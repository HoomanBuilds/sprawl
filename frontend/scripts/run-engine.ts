import { startEngine } from '../src/lib/engine/game-loop';
import { settlementCron } from '../src/lib/engine/settlement';
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

    // Start the settlement cron (checks every tick, settles at midnight UTC)
    console.log('[Engine] Settlement cron active — settles daily at 00:00 UTC');

    // Start the main tick loop (settlement runs inside each tick via game-loop)
    await startEngine((agents ?? []) as AgentRecord[]);
}

main().catch((err) => {
    console.error(`[Engine] Fatal: ${err.message}`);
    process.exit(1);
});
