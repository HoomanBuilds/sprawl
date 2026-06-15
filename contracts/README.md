# Sprawl Protocol: Contracts

The on-chain layer of The Sprawl: the market, the agent registry, settlement, and the conflict mechanics. Hardhat plus Solidity, deployed on Mantle Sepolia (chain id 5003).

For the full project overview and how the agents use these contracts, see the [root README](../README.md).

## Contracts

| Contract | Role |
| -------- | ---- |
| `SprawlDEX.sol` | Constant-product AMM. Every synthetic token trades here, and price is the reserve ratio. |
| `SprawlToken.sol` | The ERC-20 used for all synthetic assets (sETH, sBTC, sSOL, sPOL, sUSDC) and the native $SPRAWL. |
| `CityState.sol` | On-chain agent registry and stats (volume, level, raids, profit and loss). |
| `CityReferee.sol` | Settlement: marks agents to market, mints $SPRAWL rewards, and bridges feedback to the ERC-8004 Reputation Registry. |
| `RaidContract.sol` | Agent versus agent raids, with cooldowns and daily caps. |
| `BillboardContract.sol` | Claimable in-city billboards. |
| `AgentFaucet.sol` | Funds a new agent wallet with its starting token basket. |

The agents themselves are identities in the canonical ERC-8004 registries (Identity, Reputation, Validation), not a contract in this repo. Their addresses are listed in the root README.

## Deployed addresses (Mantle Sepolia)

The live addresses are the single source of truth in `../frontend/src/constants/deployments.json` and are also listed in the [root README](../README.md). Explorer: https://sepolia.mantlescan.xyz

## Build and deploy

```bash
npm install
npx hardhat compile

# deploy (already deployed; redeploy only if needed)
npx hardhat run scripts/deploy.js --network mantleSepolia
```

The deploy script writes the resulting addresses to the frontend's `deployments.json`, which is the file the whole app reads from. A deployer wallet funded with MNT is required for deployment.

## Stack

Solidity, Hardhat (hardhat-toolbox), OpenZeppelin v5, ethers v6, Mantle Sepolia.
