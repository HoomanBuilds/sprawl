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
const BREAK_AFTER_MS = 120_000; // must exceed the 90s tx wait
let cleanedStale = false;

export async function withTxLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });

  // clear a stale lock left by a crashed run, once per process
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
