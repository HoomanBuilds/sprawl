import { JsonRpcProvider, FallbackProvider, Network, Wallet } from "ethers";
import { MANTLE_SEPOLIA_RPC, MANTLE_SEPOLIA_CHAIN_ID } from "./config";

const NETWORK = new Network("mantle-sepolia", MANTLE_SEPOLIA_CHAIN_ID);

// Alchemy primary + public RPCs as fallbacks. FallbackProvider (quorum 1) tries
// them in priority order, so only the primary is hit per call and the next is
// used on failure/stall — keeping the engine alive if Alchemy is throttled.
const RPC_ENDPOINTS: { url: string; priority: number }[] = [
  { url: MANTLE_SEPOLIA_RPC, priority: 1 },
  { url: "https://mantle-sepolia.drpc.org", priority: 2 },
  { url: "https://rpc.sepolia.mantle.xyz", priority: 3 },
];

let cachedProvider: FallbackProvider | null = null;

export function getMantleSepoliaProvider(): FallbackProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = new FallbackProvider(
    RPC_ENDPOINTS.map(({ url, priority }) => {
      // staticNetwork pins the chain id so ethers never polls eth_chainId;
      // batchMaxCount 1 avoids JSON-RPC batches that some free RPCs reject.
      const provider = new JsonRpcProvider(url, NETWORK, { staticNetwork: NETWORK, batchMaxCount: 1 });
      provider.pollingInterval = 30_000;
      return { provider, priority, weight: 1, stallTimeout: 2000 };
    }),
    NETWORK,
    { quorum: 1 },
  );
  return cachedProvider;
}

export function getDeployerWallet(): Wallet {
  const key = process.env.BACKEND_PRIVATE_KEY;
  if (!key) throw new Error("BACKEND_PRIVATE_KEY not set");
  return new Wallet(key, getMantleSepoliaProvider());
}

// Dedicated wallet for ERC-8004 reputation feedback. Must be DISTINCT from the
// deployer: the canonical ReputationRegistry rejects feedback from the agent's
// own ERC-8004 owner ("Self-feedback not allowed"), and the deployer owns all
// agent identity tokens. Returns null when unconfigured (feedback is optional).
export function getRefereeWallet(): Wallet | null {
  const key = process.env.REFEREE_PRIVATE_KEY;
  if (!key) return null;
  return new Wallet(key, getMantleSepoliaProvider());
}
