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

export async function withTxLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });

  const start = Date.now();
  while (existsSync(LOCK_FILE)) {
    if (Date.now() - start > 30_000) {
      unlinkSync(LOCK_FILE);
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
