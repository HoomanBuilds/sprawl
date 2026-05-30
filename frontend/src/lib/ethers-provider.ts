import { JsonRpcProvider, Wallet } from "ethers";
import { MANTLE_SEPOLIA_RPC, MANTLE_SEPOLIA_CHAIN_ID } from "./config";

export function getMantleSepoliaProvider(): JsonRpcProvider {
  return new JsonRpcProvider(MANTLE_SEPOLIA_RPC, {
    chainId: MANTLE_SEPOLIA_CHAIN_ID,
    name: "mantle-sepolia",
  });
}

export function getDeployerWallet(): Wallet {
  const key = process.env.BACKEND_PRIVATE_KEY;
  if (!key) throw new Error("BACKEND_PRIVATE_KEY not set");
  return new Wallet(key, getMantleSepoliaProvider());
}
