import { marketMakerLoop } from '../src/lib/market-maker';

const ac = new AbortController();

process.on('SIGINT', () => { ac.abort(); });
process.on('SIGTERM', () => { ac.abort(); });

marketMakerLoop(ac.signal).then(() => {
    console.log('[MarketMaker] Exited');
    process.exit(0);
});
