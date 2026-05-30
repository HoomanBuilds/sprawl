const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const RETRYABLE_STATUS = [429, 500];

export interface DeepSeekMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
}

export interface DeepSeekTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface DeepSeekOptions {
    model?: string;
    temperature?: number;
    stream?: boolean;
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    timeoutMs?: number;
}

export interface DeepSeekToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

export interface DeepSeekChoice {
    index: number;
    message: {
        role: string;
        content: string | null;
        tool_calls?: DeepSeekToolCall[];
    };
    finish_reason: string;
}

export interface DeepSeekResponse {
    id: string;
    choices: DeepSeekChoice[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retries: number
): Promise<Response> {
    const res = await fetch(url, init);

    if (!res.ok && retries > 0 && RETRYABLE_STATUS.includes(res.status)) {
        const backoff = res.status === 429 ? 2_000 : 1_000;
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, init, retries - 1);
    }

    return res;
}

async function* parseSSE(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
                yield JSON.parse(data);
            } catch {}
        }
    }
}

export async function callDeepSeek(
    messages: DeepSeekMessage[],
    tools?: DeepSeekTool[],
    options?: DeepSeekOptions
): Promise<DeepSeekResponse> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is not set');
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const body: Record<string, any> = {
        model: options?.model ?? 'deepseek-chat',
        temperature: options?.temperature ?? 0.3,
        messages,
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = options?.tool_choice ?? 'auto';
    }

    try {
        const res = await fetchWithRetry(
            DEEPSEEK_BASE_URL,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            },
            MAX_RETRIES
        );

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`DeepSeek API error: ${res.status} - ${err}`);
        }

        return await res.json();
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error(`DeepSeek request timed out after ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

export async function callDeepSeekStream(
    messages: DeepSeekMessage[],
    tools?: DeepSeekTool[],
    options?: DeepSeekOptions
): Promise<{ textStream: AsyncGenerator<string>; toolCalls: Promise<DeepSeekToolCall[]> }> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is not set');
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const body: Record<string, any> = {
        model: options?.model ?? 'deepseek-chat',
        temperature: options?.temperature ?? 0.3,
        stream: true,
        messages,
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = options?.tool_choice ?? 'auto';
    }

    let res: Response;
    try {
        res = await fetchWithRetry(
            DEEPSEEK_BASE_URL,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            },
            MAX_RETRIES
        );

        if (!res.ok) {
            const err = await res.text();
            clearTimeout(timeout);
            throw new Error(`DeepSeek API error: ${res.status} - ${err}`);
        }
    } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error(`DeepSeek request timed out after ${timeoutMs}ms`);
        }
        throw err;
    }

    const accumulatedToolCalls: DeepSeekToolCall[] = [];
    let toolCallsResolve: (val: DeepSeekToolCall[]) => void;
    const toolCallsPromise = new Promise<DeepSeekToolCall[]>(r => { toolCallsResolve = r; });

    async function* streamText(): AsyncGenerator<string> {
        try {
            for await (const chunk of parseSSE(res)) {
                const choice = chunk.choices?.[0];
                if (!choice) continue;

                if (choice.delta?.content) {
                    yield choice.delta.content;
                }

                if (choice.delta?.tool_calls) {
                    for (const tc of choice.delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!accumulatedToolCalls[idx]) {
                            accumulatedToolCalls[idx] = {
                                id: tc.id || '',
                                type: 'function',
                                function: { name: '', arguments: '' },
                            };
                        }
                        if (tc.function?.name) accumulatedToolCalls[idx].function.name = tc.function.name;
                        if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                        if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                    }
                }
            }
        } finally {
            clearTimeout(timeout);
            toolCallsResolve!(accumulatedToolCalls.filter(Boolean));
        }
    }

    return { textStream: streamText(), toolCalls: toolCallsPromise };
}
