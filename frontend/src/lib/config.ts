import deployments from "@/constants/deployments.json";

export const CONTRACTS = {
  SprawlDEX: deployments.SprawlDEX,
  CityState: deployments.CityState,
  CityReferee: deployments.CityReferee,
  RaidContract: deployments.RaidContract,
  BillboardContract: deployments.BillboardContract,
  AgentFaucet: deployments.AgentFaucet,
  sETH: deployments.sETH,
  sBTC: deployments.sBTC,
  sUSDC: deployments.sUSDC,
  sPOL: deployments.sPOL,
  sSOL: deployments.sSOL,
  SPRAWL: deployments.SPRAWL,
} as const;

export const MANTLE_SEPOLIA_CHAIN_ID = 5003;
export const MANTLE_SEPOLIA_RPC =
  process.env.MANTLE_SEPOLIA_RPC_URL || "https://rpc.sepolia.mantle.xyz";
export const MANTLE_SEPOLIA_EXPLORER = "https://sepolia.mantlescan.xyz";

export const ERC8004 = {
  IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  ValidationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
} as const;

export const TOKEN_SYMBOLS: Record<string, string> = {
  [deployments.sETH]: "sETH",
  [deployments.sBTC]: "sBTC",
  [deployments.sUSDC]: "sUSDC",
  [deployments.sPOL]: "sPOL",
  [deployments.sSOL]: "sSOL",
  [deployments.SPRAWL]: "SPRAWL",
};
