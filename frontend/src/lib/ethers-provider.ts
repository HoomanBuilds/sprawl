import { ethers } from "ethers";
import { MANTLE_SEPOLIA_RPC, MANTLE_SEPOLIA_CHAIN_ID } from "./config";

export function getMantleSepoliaProvider(): ethers.providers.StaticJsonRpcProvider {
  return new ethers.providers.StaticJsonRpcProvider(
    { url: MANTLE_SEPOLIA_RPC, skipFetchSetup: true },
    { chainId: MANTLE_SEPOLIA_CHAIN_ID, name: "mantle-sepolia" }
  );
}

export function getDeployerWallet(): ethers.Wallet {
  const key = process.env.BACKEND_PRIVATE_KEY;
  if (!key) throw new Error("BACKEND_PRIVATE_KEY not set");
  return new ethers.Wallet(key, getMantleSepoliaProvider());
}
