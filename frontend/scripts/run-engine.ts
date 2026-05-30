import { startEngine } from '../src/lib/engine/game-loop';
import { supabaseAdmin } from '../src/lib/supabase';
import type { AgentRecord } from '../src/types/agent';

async function main() {
    const { data: agents, error } = await supabaseAdmin
        .from('agents')
        .select('*');

    if (error) {
        console.error(`[Engine] Failed to load agents: ${error.message}`);
        process.exit(1);
    }

    console.log(`[Engine] Loaded ${agents?.length ?? 0} agents from Supabase`);
    await startEngine((agents ?? []) as AgentRecord[]);
}

main().catch((err) => {
    console.error(`[Engine] Fatal: ${err.message}`);
    process.exit(1);
});
