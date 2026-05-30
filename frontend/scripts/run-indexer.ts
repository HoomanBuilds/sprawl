import { startIndexer } from '../src/lib/indexer';

const ac = new AbortController();

process.on('SIGINT', () => { ac.abort(); });
process.on('SIGTERM', () => { ac.abort(); });

startIndexer(ac.signal).then(() => {
    console.log('[Indexer] Exited');
    process.exit(0);
});
