export interface MemoryNode {
    id: string;
    agent_id: number;
    type: 'event' | 'thought' | 'trade' | 'reflection';
    depth: number;
    description: string;
    subject?: string;
    predicate?: string;
    object?: string;
    poignancy: number;
    keywords: string[];
    evidence: string[];
    embedding_id?: string;
    last_accessed_at: string;
    created_at: string;
    expires_at?: string;
}

export interface MemoryRetrievalOptions {
    topK: number;
    overfetch: number;
    recencyWeight: number;
    relevanceWeight: number;
    importanceWeight: number;
}

export interface SkillRecord {
    id: string;
    agent_id: number;
    name: string;
    code: string;
    description: string;
    embedding_id?: string;
    success_rate: number;
    avg_pnl: number;
    times_used: number;
    version: number;
}
