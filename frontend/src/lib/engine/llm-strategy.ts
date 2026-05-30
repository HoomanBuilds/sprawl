import type { StrategyEngine, AgentContext, AgentDecision } from '@/types/engine';
import { callDeepSeek } from '../deepseek';
import { buildSystemPrompt, buildUserPrompt } from './context-composer';
import { DEFI_TOOL_SCHEMAS } from './tool-schemas';

export class LLMStrategy implements StrategyEngine {
    async decide(ctx: AgentContext): Promise<AgentDecision> {
        const systemPrompt = buildSystemPrompt(ctx);
        const userPrompt = buildUserPrompt(ctx);

        try {
            const data = await callDeepSeek(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                DEFI_TOOL_SCHEMAS,
                { temperature: 0.3, timeoutMs: 30_000 }
            );

            const choice = data.choices?.[0];

            if (!choice) {
                return fallbackDecision('No choice returned');
            }

            if (choice.message?.tool_calls?.length) {
                return parseToolCall(choice.message.tool_calls[0]);
            }

            if (choice.message?.content) {
                return parseTextResponse(choice.message.content);
            }

            return fallbackDecision('Empty response');
        } catch (err: any) {
            console.error(`[LLMStrategy] Error: ${err.message}`);
            return fallbackDecision(err.message);
        }
    }
}

function parseToolCall(toolCall: { function: { name: string; arguments: string } }): AgentDecision {
    const name = toolCall.function?.name;
    let args: Record<string, any> = {};

    try {
        args = JSON.parse(toolCall.function?.arguments ?? '{}');
    } catch {
        args = {};
    }

    const validActions = ['swap', 'provideLiquidity', 'removeLiquidity', 'hold', 'raid'];
    const action = validActions.includes(name) ? name : 'hold';

    return {
        action: action as AgentDecision['action'],
        protocol: 'SprawlDEX',
        params: args,
        rationale: args.reason ?? `LLM chose ${action}`,
    };
}

function parseTextResponse(content: string): AgentDecision {
    return {
        action: 'hold',
        protocol: '',
        params: {},
        rationale: content.slice(0, 200),
    };
}

function fallbackDecision(reason: string): AgentDecision {
    return {
        action: 'hold',
        protocol: '',
        params: {},
        rationale: `Fallback: ${reason}`,
    };
}
