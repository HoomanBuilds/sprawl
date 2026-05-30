import { startEngine } from '../src/lib/engine/game-loop';
import { startIndexer } from '../src/lib/indexer';
import { marketMakerLoop } from '../src/lib/market-maker';
import { supabaseAdmin } from '../src/lib/supabase';
import type { AgentRecord } from '../src/types/agent';

const ac = new AbortController();

process.on('SIGINT', () => {
    console.log('\n[RunAll] Shutting down...');
    ac.abort();
});
process.on('SIGTERM', () => {
    console.log('\n[RunAll] SIGTERM received, shutting down...');
    ac.abort();
});

async function main() {
    console.log('[RunAll] Starting all services');

    const { data: agents, error } = await supabaseAdmin
        .from('agents')
        .select('*');

    if (error) {
        console.error(`[RunAll] Failed to load agents: ${error.message}`);
        process.exit(1);
    }

    console.log(`[RunAll] Loaded ${agents?.length ?? 0} agents`);

    const processes = [
        startEngine((agents ?? []) as AgentRecord[]).then(() => console.log('[RunAll] Engine stopped')),
        startIndexer(ac.signal).then(() => console.log('[RunAll] Indexer stopped')),
        marketMakerLoop(ac.signal).then(() => console.log('[RunAll] MarketMaker stopped')),
    ];

    console.log('[RunAll] All services running. Press Ctrl+C to stop.');

    await Promise.allSettled(processes);
    console.log('[RunAll] All services stopped');
    process.exit(0);
}

main().catch((err) => {
    console.error(`[RunAll] Fatal: ${err.message}`);
    process.exit(1);
});
