import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";

const LOCK_DIR = join(process.cwd(), ".locks");
const LOCK_FILE = join(LOCK_DIR, "deployer-tx.lock");
// Must exceed the bounded tx wait (90s) so a legitimately slow deployer tx never
// has its lock stolen mid-flight — that stale-nonce reuse caused "nonce too low".
const BREAK_AFTER_MS = 120_000;
let cleanedStale = false;

export async function withTxLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });

  // A lock file left by a crashed previous run is stale; clear it once so a
  // restart isn't blocked for the full break timeout.
  if (!cleanedStale) {
    cleanedStale = true;
    if (existsSync(LOCK_FILE)) {
      try { unlinkSync(LOCK_FILE); } catch { /* already gone */ }
    }
  }

  const start = Date.now();
  while (existsSync(LOCK_FILE)) {
    if (Date.now() - start > BREAK_AFTER_MS) {
      try { unlinkSync(LOCK_FILE); } catch { /* already gone */ }
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  writeFileSync(LOCK_FILE, String(process.pid));
  try {
    return await fn();
  } finally {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  }
}
