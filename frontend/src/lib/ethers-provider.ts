import { JsonRpcProvider, Wallet } from "ethers";
import type { JsonRpcPayload, JsonRpcResult } from "ethers";
import { MANTLE_SEPOLIA_RPC, MANTLE_SEPOLIA_CHAIN_ID } from "./config";

// Free-tier RPCs (Alchemy/public) return transient 503 / -32001 / 429 under
// load. ethers throws on the first failure with no retry, which floods the
// engine + indexer with errors. This provider retries idempotent calls with
// exponential backoff + jitter so transient blips are invisible to callers.

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 8000;

// Never auto-retry a broadcast: a 503 may arrive after the node accepted the
// tx, so a retry could double-send. The caller re-tries next tick with a fresh
// nonce, which is the safe path.
const NON_RETRYABLE_METHODS = new Set(["eth_sendRawTransaction"]);

function isTransient(err: unknown): boolean {
  const e = err as { code?: string; info?: { responseStatus?: string; responseBody?: string } };
  if (e?.code === "SERVER_ERROR" || e?.code === "TIMEOUT" || e?.code === "NETWORK_ERROR") {
    return true;
  }
  const status = String(e?.info?.responseStatus ?? "");
  if (/^(429|502|503|504)/.test(status)) return true;
  const body = String(e?.info?.responseBody ?? "");
  // -32001 "Unable to complete request", -32005 limit exceeded, -32000 server error
  return /-3200[015]/.test(body) || /rate limit|limit exceeded|capacity/i.test(body);
}

function methodsOf(payload: JsonRpcPayload | JsonRpcPayload[]): string[] {
  const arr = Array.isArray(payload) ? payload : [payload];
  return arr.map((p) => p.method).filter(Boolean);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ResilientJsonRpcProvider extends JsonRpcProvider {
  async _send(
    payload: JsonRpcPayload | JsonRpcPayload[],
  ): Promise<Array<JsonRpcResult>> {
    const retryable = !methodsOf(payload).some((m) => NON_RETRYABLE_METHODS.has(m));
    let lastErr: unknown;
    for (let attempt = 0; attempt <= (retryable ? MAX_RETRIES : 0); attempt++) {
      try {
        return await super._send(payload);
      } catch (err) {
        lastErr = err;
        if (!retryable || !isTransient(err) || attempt === MAX_RETRIES) throw err;
        const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
        await sleep(backoff + Math.floor(Math.random() * 250));
      }
    }
    throw lastErr;
  }
}

export function getMantleSepoliaProvider(): JsonRpcProvider {
  const provider = new ResilientJsonRpcProvider(
    MANTLE_SEPOLIA_RPC,
    { chainId: MANTLE_SEPOLIA_CHAIN_ID, name: "mantle-sepolia" },
    // Many free RPCs reject JSON-RPC batches; send one request at a time.
    { batchMaxCount: 1 }
  );
  // We poll the chain explicitly in the indexer; slow ethers' own poller down
  // so any .on() usage doesn't add to the request rate.
  provider.pollingInterval = 12_000;
  return provider;
}

export function getDeployerWallet(): Wallet {
  const key = process.env.BACKEND_PRIVATE_KEY;
  if (!key) throw new Error("BACKEND_PRIVATE_KEY not set");
  return new Wallet(key, getMantleSepoliaProvider());
}
