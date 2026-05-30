# Phase 1: Contracts + Project Scaffold — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the two-folder project structure, write and deploy all Solidity contracts to Mantle Sepolia, seed SprawlDEX pools, and start the MarketMaker price feed — the chain foundation everything else builds on.

**Architecture:** Hardhat + ethers v5 for contracts (same pattern as our Signatory project). Next.js 16 for frontend. Two folders: `contracts/` and `frontend/`. All contracts deployed to Mantle Sepolia (chain ID 5003).

**Tech Stack:** Hardhat, Solidity 0.8.19, ethers v5, OpenZeppelin, Next.js 16, TypeScript, Supabase

**Design doc reference:** `docs/plans/2026-05-30-sprawl-protocol-implementation-plan.md` — the full 2349-line design. This execution plan implements Sections 1.1 through 1.7.

---

### Task 1: Initialize project structure

**Files:**
- Create: `contracts/package.json`
- Create: `contracts/hardhat.config.js`
- Create: `contracts/.env.example`
- Create: `frontend/package.json`
- Create: `frontend/next.config.js`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/app/page.tsx` (placeholder)
- Create: `frontend/src/app/layout.tsx` (placeholder)
- Create: `.gitignore`

**Step 1: Create root .gitignore**

```
node_modules/
.env
.env.local
artifacts/
cache/
typechain-types/
.next/
out/
```

**Step 2: Init contracts/ with Hardhat**

```bash
mkdir -p contracts && cd contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts dotenv
npx hardhat init  # choose "Create a JavaScript project"
```

**Step 3: Configure Hardhat for Mantle Sepolia**

Replace `contracts/hardhat.config.js` with:

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",  // avoid PUSH0 for L2 compat
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    mantleSepolia: {
      url: process.env.MANTLE_SEPOLIA_RPC_URL || "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    hardhat: {
      chainId: 31337,
    }
  },
  etherscan: {
    apiKey: { mantleSepolia: "not_required" },
    customChains: [{
      network: "mantleSepolia",
      chainId: 5003,
      urls: {
        apiURL: "https://explorer.sepolia.mantle.xyz/api",
        browserURL: "https://explorer.sepolia.mantle.xyz"
      }
    }]
  }
};
```

Reference: `inspiration/erc-8004-contracts/hardhat.config.ts` for Mantle network config.

**Step 4: Create contracts/.env.example**

```
DEPLOYER_PRIVATE_KEY=
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
```

**Step 5: Init frontend/ with Next.js**

```bash
cd ../frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

**Step 6: Create the lib/ directory structure**

```bash
mkdir -p src/lib/{engine,memory,skills,indexer,market-maker,execution,identity}
mkdir -p src/components/ui
mkdir -p src/types src/constants src/hooks
mkdir -p scripts
mkdir -p supabase/migrations
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: init project scaffold — contracts/ (Hardhat) + frontend/ (Next.js)"
```

---

### Task 2: SprawlToken contract

**Files:**
- Create: `contracts/contracts/SprawlToken.sol`
- Create: `contracts/test/SprawlToken.test.js`

**Step 1: Write the SprawlToken contract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SprawlToken is ERC20 {
    address public minter;

    modifier onlyMinter() {
        require(msg.sender == minter, "Only minter");
        _;
    }

    constructor(string memory name_, string memory symbol_, address minter_) ERC20(name_, symbol_) {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function setMinter(address newMinter) external onlyMinter {
        require(newMinter != address(0), "Zero address");
        minter = newMinter;
    }
}
```

**Step 2: Write tests**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SprawlToken", function () {
    let token, owner, other;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();
        const SprawlToken = await ethers.getContractFactory("SprawlToken");
        token = await SprawlToken.deploy("Sprawl ETH", "sETH", owner.address);
    });

    it("should mint tokens", async function () {
        await token.mint(other.address, ethers.utils.parseEther("100"));
        expect(await token.balanceOf(other.address)).to.equal(ethers.utils.parseEther("100"));
    });

    it("should reject non-minter", async function () {
        await expect(token.connect(other).mint(other.address, 100))
            .to.be.revertedWith("Only minter");
    });

    it("should transfer minter role", async function () {
        await token.setMinter(other.address);
        expect(await token.minter()).to.equal(other.address);
    });
});
```

**Step 3: Run tests**

```bash
cd contracts && npx hardhat test test/SprawlToken.test.js
```
Expected: 3 passing

**Step 4: Commit**

```bash
git add contracts/contracts/SprawlToken.sol contracts/test/SprawlToken.test.js
git commit -m "feat: add SprawlToken ERC-20 with minter role"
```

---

### Task 3: SprawlDEX contract

**Files:**
- Create: `contracts/contracts/SprawlDEX.sol`
- Create: `contracts/test/SprawlDEX.test.js`

**Step 1: Write the SprawlDEX AMM contract**

This is the core constant-product AMM with real x*y=k math, fees, LP shares, and price queries.

Reference: Design doc Section 1.5 for the full contract spec.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SprawlDEX {
    using SafeERC20 for IERC20;

    struct Pool {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
        uint256 feeNumerator;     // e.g., 3 for 0.3%
        uint256 feeDenominator;   // e.g., 1000
        uint256 totalSwaps;
        uint256 totalLpShares;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(address => uint256)) public lpShares;

    event PoolCreated(bytes32 indexed poolId, address indexed tokenA, address indexed tokenB);
    event Swap(address indexed trader, address tokenIn, address tokenOut,
               uint256 amountIn, uint256 amountOut, uint256 priceAfter, uint256 fee);
    event LiquidityAdded(address indexed provider, bytes32 indexed poolId, uint256 amountA, uint256 amountB, uint256 shares);
    event LiquidityRemoved(address indexed provider, bytes32 indexed poolId, uint256 amountA, uint256 amountB, uint256 shares);

    function getPoolId(address tokenA, address tokenB) public pure returns (bytes32) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encodePacked(t0, t1));
    }

    function createPool(
        address tokenA, address tokenB,
        uint256 amountA, uint256 amountB,
        uint256 feeNum, uint256 feeDenom
    ) external returns (bytes32 poolId) {
        poolId = getPoolId(tokenA, tokenB);
        require(pools[poolId].tokenA == address(0), "Pool exists");
        require(amountA > 0 && amountB > 0, "Zero amounts");

        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        (uint256 a0, uint256 a1) = tokenA < tokenB ? (amountA, amountB) : (amountB, amountA);

        IERC20(t0).safeTransferFrom(msg.sender, address(this), a0);
        IERC20(t1).safeTransferFrom(msg.sender, address(this), a1);

        pools[poolId] = Pool(t0, t1, a0, a1, feeNum, feeDenom, 0, 1000);
        lpShares[poolId][msg.sender] = 1000;

        emit PoolCreated(poolId, t0, t1);
    }

    function swap(
        address tokenIn, address tokenOut,
        uint256 amountIn, uint256 amountOutMin
    ) external returns (uint256 amountOut) {
        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        require(pool.tokenA != address(0), "Pool not found");

        uint256 fee = (amountIn * pool.feeNumerator) / pool.feeDenominator;
        uint256 amountInAfterFee = amountIn - fee;

        uint256 reserveIn = tokenIn == pool.tokenA ? pool.reserveA : pool.reserveB;
        uint256 reserveOut = tokenIn == pool.tokenA ? pool.reserveB : pool.reserveA;

        amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
        require(amountOut >= amountOutMin, "Slippage exceeded");
        require(amountOut < reserveOut, "Insufficient liquidity");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        if (tokenIn == pool.tokenA) {
            pool.reserveA += amountIn;
            pool.reserveB -= amountOut;
        } else {
            pool.reserveB += amountIn;
            pool.reserveA -= amountOut;
        }
        pool.totalSwaps++;

        uint256 priceAfter = (pool.reserveB * 1e18) / pool.reserveA;
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, priceAfter, fee);
    }

    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.tokenA != address(0), "Pool not found");

        (uint256 a0, uint256 a1) = tokenA == pool.tokenA ? (amountA, amountB) : (amountB, amountA);

        uint256 shares = (a0 * pool.totalLpShares) / pool.reserveA;

        IERC20(pool.tokenA).safeTransferFrom(msg.sender, address(this), a0);
        IERC20(pool.tokenB).safeTransferFrom(msg.sender, address(this), a1);

        pool.reserveA += a0;
        pool.reserveB += a1;
        pool.totalLpShares += shares;
        lpShares[poolId][msg.sender] += shares;

        emit LiquidityAdded(msg.sender, poolId, a0, a1, shares);
    }

    function removeLiquidity(address tokenA, address tokenB, uint256 shares) external {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(lpShares[poolId][msg.sender] >= shares, "Insufficient shares");

        uint256 amountA = (shares * pool.reserveA) / pool.totalLpShares;
        uint256 amountB = (shares * pool.reserveB) / pool.totalLpShares;

        pool.reserveA -= amountA;
        pool.reserveB -= amountB;
        pool.totalLpShares -= shares;
        lpShares[poolId][msg.sender] -= shares;

        IERC20(pool.tokenA).safeTransfer(msg.sender, amountA);
        IERC20(pool.tokenB).safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, poolId, amountA, amountB, shares);
    }

    // --- View functions ---
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        uint256 fee = (amountIn * pool.feeNumerator) / pool.feeDenominator;
        uint256 afterFee = amountIn - fee;
        uint256 reserveIn = tokenIn == pool.tokenA ? pool.reserveA : pool.reserveB;
        uint256 reserveOut = tokenIn == pool.tokenA ? pool.reserveB : pool.reserveA;
        return (afterFee * reserveOut) / (reserveIn + afterFee);
    }

    function getPrice(address tokenA, address tokenB) external view returns (uint256) {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.tokenA != address(0), "Pool not found");
        (uint256 rA, uint256 rB) = tokenA == pool.tokenA
            ? (pool.reserveA, pool.reserveB)
            : (pool.reserveB, pool.reserveA);
        return (rB * 1e18) / rA;
    }

    function getPoolInfo(bytes32 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }
}
```

**Step 2: Write tests**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SprawlDEX", function () {
    let dex, tokenA, tokenB, owner, trader;
    const INITIAL_A = ethers.utils.parseEther("10000");
    const INITIAL_B = ethers.utils.parseEther("25000000"); // simulates sETH/sUSDC at $2500

    beforeEach(async function () {
        [owner, trader] = await ethers.getSigners();
        const Token = await ethers.getContractFactory("SprawlToken");
        tokenA = await Token.deploy("Sprawl ETH", "sETH", owner.address);
        tokenB = await Token.deploy("Sprawl USDC", "sUSDC", owner.address);

        const DEX = await ethers.getContractFactory("SprawlDEX");
        dex = await DEX.deploy();

        // Mint and approve
        await tokenA.mint(owner.address, INITIAL_A);
        await tokenB.mint(owner.address, INITIAL_B);
        await tokenA.approve(dex.address, INITIAL_A);
        await tokenB.approve(dex.address, INITIAL_B);

        // Create pool with 0.3% fee
        await dex.createPool(tokenA.address, tokenB.address, INITIAL_A, INITIAL_B, 3, 1000);

        // Fund trader
        await tokenA.mint(trader.address, ethers.utils.parseEther("100"));
        await tokenA.connect(trader).approve(dex.address, ethers.utils.parseEther("100"));
        await tokenB.mint(trader.address, ethers.utils.parseEther("100000"));
        await tokenB.connect(trader).approve(dex.address, ethers.utils.parseEther("100000"));
    });

    it("should create pool and set reserves", async function () {
        const poolId = await dex.getPoolId(tokenA.address, tokenB.address);
        const pool = await dex.getPoolInfo(poolId);
        expect(pool.reserveA).to.be.gt(0);
        expect(pool.reserveB).to.be.gt(0);
    });

    it("should swap with correct constant product math", async function () {
        const swapAmount = ethers.utils.parseEther("1"); // 1 sETH
        const expectedOut = await dex.getAmountOut(tokenA.address, tokenB.address, swapAmount);

        await dex.connect(trader).swap(tokenA.address, tokenB.address, swapAmount, 0);

        const traderBalance = await tokenB.balanceOf(trader.address);
        // Trader started with 100000 sUSDC + expectedOut from swap
        expect(traderBalance).to.equal(ethers.utils.parseEther("100000").add(expectedOut));
    });

    it("should enforce slippage protection", async function () {
        const swapAmount = ethers.utils.parseEther("1");
        const tooHighMin = ethers.utils.parseEther("999999");

        await expect(
            dex.connect(trader).swap(tokenA.address, tokenB.address, swapAmount, tooHighMin)
        ).to.be.revertedWith("Slippage exceeded");
    });

    it("should move price after large swap", async function () {
        const priceBefore = await dex.getPrice(tokenA.address, tokenB.address);

        // Large swap: 50 sETH (0.5% of pool)
        const swapAmount = ethers.utils.parseEther("50");
        await dex.connect(trader).swap(tokenA.address, tokenB.address, swapAmount, 0);

        const priceAfter = await dex.getPrice(tokenA.address, tokenB.address);
        expect(priceAfter).to.be.lt(priceBefore); // sETH→sUSDC sells pressure → sETH price drops
    });

    it("should add and remove liquidity", async function () {
        const addA = ethers.utils.parseEther("10");
        const addB = ethers.utils.parseEther("25000");
        await tokenA.mint(trader.address, addA);
        await tokenB.mint(trader.address, addB);
        await tokenA.connect(trader).approve(dex.address, addA);
        await tokenB.connect(trader).approve(dex.address, addB);

        const poolId = await dex.getPoolId(tokenA.address, tokenB.address);
        await dex.connect(trader).addLiquidity(tokenA.address, tokenB.address, addA, addB);

        const shares = await dex.lpShares(poolId, trader.address);
        expect(shares).to.be.gt(0);

        await dex.connect(trader).removeLiquidity(tokenA.address, tokenB.address, shares);
        const sharesAfter = await dex.lpShares(poolId, trader.address);
        expect(sharesAfter).to.equal(0);
    });

    it("should reject duplicate pool creation", async function () {
        await expect(
            dex.createPool(tokenA.address, tokenB.address, 100, 100, 3, 1000)
        ).to.be.revertedWith("Pool exists");
    });
});
```

**Step 3: Run tests**

```bash
cd contracts && npx hardhat test test/SprawlDEX.test.js
```
Expected: 5 passing

**Step 4: Commit**

```bash
git add contracts/contracts/SprawlDEX.sol contracts/test/SprawlDEX.test.js
git commit -m "feat: add SprawlDEX constant-product AMM with LP support"
```

---

### Task 4: CityState contract

**Files:**
- Create: `contracts/contracts/CityState.sol`
- Create: `contracts/test/CityState.test.js`

**Step 1: Write CityState**

Reference: Design doc Section 1.2 + Appendix B.4

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CityState {
    address public owner;
    address public referee;

    struct AgentStats {
        address wallet;
        uint256 totalVolume;
        int256 netPnl;
        uint256 level;
        uint256 raidWins;
        uint256 raidLosses;
        uint8 strategyType; // 0=preset, 1=rules, 2=llm
        bool exists;
    }

    mapping(uint256 => AgentStats) public agents;
    uint256 public agentCount;

    event AgentSpawned(uint256 indexed agentId, address indexed wallet, uint8 strategyType);
    event AgentDecision(uint256 indexed agentId, string action, string protocol, bytes params, uint256 ts);
    event AgentOutcome(uint256 indexed agentId, int256 pnlDelta, uint256 newVolume, uint256 newLevel);
    event BuildingGrew(uint256 indexed agentId, uint256 newLevel);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyReferee() { require(msg.sender == referee || msg.sender == owner, "Not referee"); _; }

    constructor() { owner = msg.sender; }

    function setReferee(address _referee) external onlyOwner {
        referee = _referee;
    }

    function spawnAgent(uint256 agentId, address wallet, uint8 strategyType) external onlyOwner {
        require(!agents[agentId].exists, "Agent exists");
        agents[agentId] = AgentStats(wallet, 0, 0, 1, 0, 0, strategyType, true);
        agentCount++;
        emit AgentSpawned(agentId, wallet, strategyType);
    }

    function recordDecision(uint256 agentId, string calldata action, string calldata protocol, bytes calldata params) external {
        require(agents[agentId].exists, "Agent not found");
        require(msg.sender == agents[agentId].wallet || msg.sender == owner || msg.sender == referee, "Unauthorized");
        emit AgentDecision(agentId, action, protocol, params, block.timestamp);
    }

    function updateAgent(uint256 agentId, int256 pnlDelta, uint256 newVolume) external onlyReferee {
        AgentStats storage stats = agents[agentId];
        require(stats.exists, "Agent not found");
        stats.totalVolume = newVolume;
        stats.netPnl += pnlDelta;
        uint256 newLevel = newVolume / 100000e18; // level up every 100K volume
        if (newLevel > stats.level) {
            stats.level = newLevel;
            emit BuildingGrew(agentId, newLevel);
        }
        emit AgentOutcome(agentId, pnlDelta, newVolume, stats.level);
    }

    function recordRaid(uint256 agentId, bool won) external onlyReferee {
        AgentStats storage stats = agents[agentId];
        require(stats.exists, "Agent not found");
        if (won) stats.raidWins++;
        else stats.raidLosses++;
    }
}
```

**Step 2: Write tests**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CityState", function () {
    let cityState, owner, referee, agentWallet;

    beforeEach(async function () {
        [owner, referee, agentWallet] = await ethers.getSigners();
        const CityState = await ethers.getContractFactory("CityState");
        cityState = await CityState.deploy();
        await cityState.setReferee(referee.address);
    });

    it("should spawn an agent", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 2);
        const agent = await cityState.agents(1);
        expect(agent.exists).to.be.true;
        expect(agent.wallet).to.equal(agentWallet.address);
        expect(agent.strategyType).to.equal(2);
    });

    it("should record decision from agent wallet", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 0);
        await expect(
            cityState.connect(agentWallet).recordDecision(1, "swap", "SprawlDEX", "0x")
        ).to.emit(cityState, "AgentDecision");
    });

    it("should update agent stats via referee", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 0);
        await cityState.connect(referee).updateAgent(1, 500, ethers.utils.parseEther("200000"));
        const agent = await cityState.agents(1);
        expect(agent.netPnl).to.equal(500);
        expect(agent.level).to.equal(2); // 200K / 100K = level 2
    });

    it("should reject unauthorized referee calls", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 0);
        await expect(
            cityState.connect(agentWallet).updateAgent(1, 100, 100)
        ).to.be.revertedWith("Not referee");
    });
});
```

**Step 3: Run tests**

```bash
npx hardhat test test/CityState.test.js
```
Expected: 4 passing

**Step 4: Commit**

```bash
git add contracts/contracts/CityState.sol contracts/test/CityState.test.js
git commit -m "feat: add CityState contract with agent spawn, decisions, and outcomes"
```

---

### Task 5: AgentFaucet contract

**Files:**
- Create: `contracts/contracts/AgentFaucet.sol`
- Create: `contracts/test/AgentFaucet.test.js`

**Step 1: Write AgentFaucet**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SprawlToken.sol";

contract AgentFaucet {
    SprawlToken public sETH;
    SprawlToken public sBTC;
    SprawlToken public sUSDC;
    SprawlToken public sPOL;
    SprawlToken public sSOL;
    SprawlToken public sprawl;
    address public owner;

    mapping(address => bool) public funded;

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(
        address _sETH, address _sBTC, address _sUSDC,
        address _sPOL, address _sSOL, address _sprawl
    ) {
        sETH = SprawlToken(_sETH);
        sBTC = SprawlToken(_sBTC);
        sUSDC = SprawlToken(_sUSDC);
        sPOL = SprawlToken(_sPOL);
        sSOL = SprawlToken(_sSOL);
        sprawl = SprawlToken(_sprawl);
        owner = msg.sender;
    }

    function fundNewAgent(address agentWallet) external onlyOwner {
        require(!funded[agentWallet], "Already funded");
        funded[agentWallet] = true;

        sUSDC.mint(agentWallet, 5_000 * 1e18);
        sETH.mint(agentWallet, 1 * 1e18);
        sBTC.mint(agentWallet, 35 * 1e15); // 0.035 sBTC
        sPOL.mint(agentWallet, 5_000 * 1e18);
        sSOL.mint(agentWallet, 15 * 1e18);
        sprawl.mint(agentWallet, 100 * 1e18);
    }
}
```

**Step 2: Write test**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentFaucet", function () {
    let faucet, sETH, sBTC, sUSDC, sPOL, sSOL, sprawl, owner, agent;

    beforeEach(async function () {
        [owner, agent] = await ethers.getSigners();
        const Token = await ethers.getContractFactory("SprawlToken");
        sETH = await Token.deploy("Sprawl ETH", "sETH", owner.address);
        sBTC = await Token.deploy("Sprawl BTC", "sBTC", owner.address);
        sUSDC = await Token.deploy("Sprawl USDC", "sUSDC", owner.address);
        sPOL = await Token.deploy("Sprawl POL", "sPOL", owner.address);
        sSOL = await Token.deploy("Sprawl SOL", "sSOL", owner.address);
        sprawl = await Token.deploy("SPRAWL", "SPRAWL", owner.address);

        const Faucet = await ethers.getContractFactory("AgentFaucet");
        faucet = await Faucet.deploy(
            sETH.address, sBTC.address, sUSDC.address,
            sPOL.address, sSOL.address, sprawl.address
        );

        // Transfer minter role to faucet for all tokens
        for (const token of [sETH, sBTC, sUSDC, sPOL, sSOL, sprawl]) {
            await token.setMinter(faucet.address);
        }
    });

    it("should fund a new agent with starting portfolio", async function () {
        await faucet.fundNewAgent(agent.address);
        expect(await sUSDC.balanceOf(agent.address)).to.equal(ethers.utils.parseEther("5000"));
        expect(await sETH.balanceOf(agent.address)).to.equal(ethers.utils.parseEther("1"));
        expect(await sprawl.balanceOf(agent.address)).to.equal(ethers.utils.parseEther("100"));
    });

    it("should reject double funding", async function () {
        await faucet.fundNewAgent(agent.address);
        await expect(faucet.fundNewAgent(agent.address)).to.be.revertedWith("Already funded");
    });
});
```

**Step 3: Run tests**

```bash
npx hardhat test test/AgentFaucet.test.js
```
Expected: 2 passing

**Step 4: Commit**

```bash
git add contracts/contracts/AgentFaucet.sol contracts/test/AgentFaucet.test.js
git commit -m "feat: add AgentFaucet for agent starting portfolios"
```

---

### Task 6: Deploy script + pool seeding

**Files:**
- Create: `contracts/scripts/deploy.js`
- Create: `contracts/scripts/seed-pools.js`

**Step 1: Write deploy script**

```javascript
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with:", deployer.address);

    const Token = await hre.ethers.getContractFactory("SprawlToken");

    // 1. Deploy tokens
    console.log("\n--- Deploying tokens ---");
    const sETH = await Token.deploy("Sprawl ETH", "sETH", deployer.address);
    const sBTC = await Token.deploy("Sprawl BTC", "sBTC", deployer.address);
    const sUSDC = await Token.deploy("Sprawl USDC", "sUSDC", deployer.address);
    const sPOL = await Token.deploy("Sprawl POL", "sPOL", deployer.address);
    const sSOL = await Token.deploy("Sprawl SOL", "sSOL", deployer.address);
    const sprawl = await Token.deploy("SPRAWL", "SPRAWL", deployer.address);

    console.log("sETH:", sETH.address);
    console.log("sBTC:", sBTC.address);
    console.log("sUSDC:", sUSDC.address);
    console.log("sPOL:", sPOL.address);
    console.log("sSOL:", sSOL.address);
    console.log("SPRAWL:", sprawl.address);

    // 2. Deploy SprawlDEX
    console.log("\n--- Deploying SprawlDEX ---");
    const DEX = await hre.ethers.getContractFactory("SprawlDEX");
    const dex = await DEX.deploy();
    console.log("SprawlDEX:", dex.address);

    // 3. Deploy CityState
    console.log("\n--- Deploying CityState ---");
    const CS = await hre.ethers.getContractFactory("CityState");
    const cityState = await CS.deploy();
    console.log("CityState:", cityState.address);

    // 4. Deploy AgentFaucet
    console.log("\n--- Deploying AgentFaucet ---");
    const Faucet = await hre.ethers.getContractFactory("AgentFaucet");
    const faucet = await Faucet.deploy(
        sETH.address, sBTC.address, sUSDC.address,
        sPOL.address, sSOL.address, sprawl.address
    );
    console.log("AgentFaucet:", faucet.address);

    // 5. Transfer minter roles to faucet
    console.log("\n--- Setting minter roles ---");
    for (const [name, token] of [["sETH", sETH], ["sBTC", sBTC], ["sUSDC", sUSDC], ["sPOL", sPOL], ["sSOL", sSOL], ["SPRAWL", sprawl]]) {
        await token.setMinter(faucet.address);
        console.log(`${name} minter → AgentFaucet`);
    }

    // 6. Write deployment addresses
    const addresses = {
        sETH: sETH.address,
        sBTC: sBTC.address,
        sUSDC: sUSDC.address,
        sPOL: sPOL.address,
        sSOL: sSOL.address,
        SPRAWL: sprawl.address,
        SprawlDEX: dex.address,
        CityState: cityState.address,
        AgentFaucet: faucet.address,
        deployer: deployer.address,
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
    };

    const fs = require("fs");
    fs.writeFileSync("deployments.json", JSON.stringify(addresses, null, 2));
    console.log("\nAddresses saved to deployments.json");
    console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
```

**Step 2: Write pool seeding script**

```javascript
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    const addresses = JSON.parse(fs.readFileSync("deployments.json", "utf8"));
    const [deployer] = await hre.ethers.getSigners();

    const Token = await hre.ethers.getContractFactory("SprawlToken");
    const dex = await hre.ethers.getContractAt("SprawlDEX", addresses.SprawlDEX);

    const tokens = {
        sETH: Token.attach(addresses.sETH),
        sBTC: Token.attach(addresses.sBTC),
        sUSDC: Token.attach(addresses.sUSDC),
        sPOL: Token.attach(addresses.sPOL),
        sSOL: Token.attach(addresses.sSOL),
        SPRAWL: Token.attach(addresses.SPRAWL),
    };

    // Temporarily set deployer as minter to mint pool seed liquidity
    // (AgentFaucet is currently minter, so we need to get minter back temporarily)
    // NOTE: For pool seeding, deployer mints directly. Faucet minter is set AFTER seeding.

    console.log("Minting pool seed tokens to deployer...");
    const e = hre.ethers.utils.parseEther;

    // Pool seeds (from design doc Section C)
    const POOLS = [
        { name: "sETH/sUSDC", tokenA: "sETH", tokenB: "sUSDC", amountA: e("100"), amountB: e("250000") },
        { name: "sBTC/sUSDC", tokenA: "sBTC", tokenB: "sUSDC", amountA: e("5"), amountB: e("350000") },
        { name: "sPOL/sUSDC", tokenA: "sPOL", tokenB: "sUSDC", amountA: e("500000"), amountB: e("225000") },
        { name: "sSOL/sUSDC", tokenA: "sSOL", tokenB: "sUSDC", amountA: e("1500"), amountB: e("262500") },
        { name: "SPRAWL/sUSDC", tokenA: "SPRAWL", tokenB: "sUSDC", amountA: e("100000"), amountB: e("100000") },
    ];

    for (const pool of POOLS) {
        const tA = tokens[pool.tokenA];
        const tB = tokens[pool.tokenB];

        // Mint (deployer needs to be minter — handle this in deploy.js by seeding BEFORE transferring minter to faucet)
        console.log(`\nCreating pool: ${pool.name}`);
        await tA.mint(deployer.address, pool.amountA);
        await tB.mint(deployer.address, pool.amountB);
        await tA.approve(dex.address, pool.amountA);
        await tB.approve(dex.address, pool.amountB);
        await dex.createPool(tA.address, tB.address, pool.amountA, pool.amountB, 3, 1000);
        console.log(`  ✓ ${pool.name} seeded`);
    }

    console.log("\nAll pools seeded. Verifying prices...");
    for (const pool of POOLS) {
        const price = await dex.getPrice(tokens[pool.tokenA].address, tokens[pool.tokenB].address);
        console.log(`  ${pool.name}: ${hre.ethers.utils.formatEther(price)} ${pool.tokenB}/${pool.tokenA}`);
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
```

**Step 3: Test locally (Hardhat network)**

```bash
npx hardhat run scripts/deploy.js
npx hardhat run scripts/seed-pools.js
```
Expected: All tokens deployed, all pools created with correct prices.

Note: The deploy script needs to be modified to seed pools BEFORE transferring minter to faucet. Update deploy.js to call seed-pools logic inline, then transfer minter last.

**Step 4: Commit**

```bash
git add contracts/scripts/deploy.js contracts/scripts/seed-pools.js
git commit -m "feat: add deploy + pool seeding scripts for Mantle Sepolia"
```

---

### Task 7: Deploy to Mantle Sepolia

**Step 1: Fund deployer wallet**

- Go to `faucet.sepolia.mantle.xyz` (requires X/Twitter login)
- Request 1000 MNT to your deployer address
- Verify balance: `npx hardhat console --network mantleSepolia` → `(await ethers.provider.getBalance(deployer)).toString()`

**Step 2: Set env vars**

```bash
cp .env.example .env
# Edit .env: add DEPLOYER_PRIVATE_KEY
```

**Step 3: Deploy**

```bash
npx hardhat run scripts/deploy.js --network mantleSepolia
```

**Step 4: Seed pools**

```bash
npx hardhat run scripts/seed-pools.js --network mantleSepolia
```

**Step 5: Verify contracts on explorer**

```bash
npx hardhat verify --network mantleSepolia <SprawlDEX_ADDRESS>
npx hardhat verify --network mantleSepolia <CityState_ADDRESS>
# etc for each contract
```

**Step 6: Copy deployment addresses to frontend**

```bash
cp contracts/deployments.json frontend/src/constants/deployments.json
```

**Step 7: Commit**

```bash
git add contracts/deployments.json frontend/src/constants/deployments.json
git commit -m "feat: deploy contracts to Mantle Sepolia + seed DEX pools"
```

---

### Task 8: Frontend types + contract ABIs

**Files:**
- Create: `frontend/src/types/agent.ts`
- Create: `frontend/src/types/city.ts`
- Create: `frontend/src/constants/abis.ts`
- Create: `frontend/src/lib/config.ts`

**Step 1: Create AgentRecord type**

Reference: Design doc Appendix B.1

```typescript
// frontend/src/types/agent.ts
export interface AgentRecord {
    agent_id: number;
    wallet_address: string;
    owner_address: string;
    name: string;
    persona: string;
    strategy_type: 0 | 1 | 2;
    policy_config: AgentPolicy;
    sprawl_balance: number;
    sprawl_lifetime_earned: number;
    sprawl_lifetime_spent: number;
    last_portfolio_value: number;
    last_settlement_date: string | null;
    total_volume: number;
    strategy_count: number;
    recent_actions: number;
    reputation_score: number;
    xp_total: number;
    xp_level: number;
    xp_daily: number;
    xp_daily_date: string | null;
    raid_xp: number;
    raid_wins: number;
    raid_losses: number;
    app_streak: number;
    weekly_volume: number;
    weekly_start_date: string;
    profit_streak: number;
    reputation_given: number;
    poignancy_accumulator: number;
    district: string;
    net_pnl: number;
    created_at: string;
    last_action_at: string | null;
}

export interface AgentPolicy {
    rules: PolicyRule[];
    riskTolerance: 'low' | 'medium' | 'high';
    maxPositionSize: number;
    maxSlippageBps: number;
    allowedProtocols: string[];
}

export interface PolicyRule {
    name: string;
    condition: { field: string; operator: '>' | '<' | '==' | '!='; value: number | string };
    action: string;
    protocol: string;
    params: Record<string, any>;
}
```

**Step 2: Create CityBuilding type**

Reference: Design doc Appendix B.2

```typescript
// frontend/src/types/city.ts
export interface CityBuilding {
    agent_id: number;
    name: string;
    strategy_type: 0 | 1 | 2;
    district: string;
    position: [number, number, number];
    height: number;
    width: number;
    depth: number;
    floors: number;
    windowsPerFloor: number;
    sideWindowsPerFloor: number;
    litPercentage: number;
    tint: [number, number, number, number];
    glow: number;
    xp_level: number;
    xp_total: number;
    sprawl_lifetime_earned: number;
    net_pnl: number;
    raid_wins: number;
    raid_losses: number;
    reputation_score: number;
    loadout: { crown: string | null; roof: string | null; aura: string | null };
    active_raid_tag: { attacker_name: string; tag_style: string; expires_at: string } | null;
    is_active: boolean;
}
```

**Step 3: Create config with contract addresses**

```typescript
// frontend/src/lib/config.ts
import deployments from '@/constants/deployments.json';

export const CONTRACTS = {
    SprawlDEX: deployments.SprawlDEX,
    CityState: deployments.CityState,
    AgentFaucet: deployments.AgentFaucet,
    sETH: deployments.sETH,
    sBTC: deployments.sBTC,
    sUSDC: deployments.sUSDC,
    sPOL: deployments.sPOL,
    sSOL: deployments.sSOL,
    SPRAWL: deployments.SPRAWL,
} as const;

export const MANTLE_SEPOLIA_CHAIN_ID = 5003;
export const MANTLE_SEPOLIA_RPC = 'https://rpc.sepolia.mantle.xyz';
export const MANTLE_SEPOLIA_EXPLORER = 'https://explorer.sepolia.mantle.xyz';

// ERC-8004 already deployed on Mantle Sepolia
export const ERC8004 = {
    IdentityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    ReputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
    ValidationRegistry: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272',
} as const;
```

**Step 4: Extract ABIs from Hardhat artifacts**

```typescript
// frontend/src/constants/abis.ts
// After compilation, copy ABI arrays from contracts/artifacts/contracts/*.sol/*.json
// For now, create placeholder that will be populated after compile

export { default as SprawlDEXABI } from './abi/SprawlDEX.json';
export { default as CityStateABI } from './abi/CityState.json';
export { default as SprawlTokenABI } from './abi/SprawlToken.json';
export { default as AgentFaucetABI } from './abi/AgentFaucet.json';
```

```bash
# After hardhat compile, copy ABIs:
mkdir -p frontend/src/constants/abi
cp contracts/artifacts/contracts/SprawlDEX.sol/SprawlDEX.json frontend/src/constants/abi/
cp contracts/artifacts/contracts/CityState.sol/CityState.json frontend/src/constants/abi/
cp contracts/artifacts/contracts/SprawlToken.sol/SprawlToken.json frontend/src/constants/abi/
cp contracts/artifacts/contracts/AgentFaucet.sol/AgentFaucet.json frontend/src/constants/abi/
```

**Step 5: Commit**

```bash
git add frontend/src/types/ frontend/src/lib/config.ts frontend/src/constants/
git commit -m "feat: add TypeScript types, contract ABIs, and config for Mantle Sepolia"
```

---

### Task 9: Ethers provider + tx-lock utilities

**Files:**
- Create: `frontend/src/lib/ethers-provider.ts`
- Create: `frontend/src/lib/execution/tx-lock.ts`
- Create: `frontend/src/lib/utils/bigint-safe.ts`

**Step 1: Create ethers provider factory**

Reference: Copy pattern from `inspiration/signatory/frontend/src/lib/ethers-provider.ts`

```typescript
// frontend/src/lib/ethers-provider.ts
import { ethers } from 'ethers';
import { MANTLE_SEPOLIA_RPC, MANTLE_SEPOLIA_CHAIN_ID } from './config';

export function getMantleSepoliaProvider(): ethers.providers.StaticJsonRpcProvider {
    return new ethers.providers.StaticJsonRpcProvider(
        { url: MANTLE_SEPOLIA_RPC, skipFetchSetup: true },
        { chainId: MANTLE_SEPOLIA_CHAIN_ID, name: 'mantle-sepolia' }
    );
}

export function getDeployerWallet(): ethers.Wallet {
    const key = process.env.BACKEND_PRIVATE_KEY;
    if (!key) throw new Error('BACKEND_PRIVATE_KEY not set');
    return new ethers.Wallet(key, getMantleSepoliaProvider());
}
```

**Step 2: Create deployer tx-lock**

Reference: Copy from `inspiration/eth-open-agents/packages/deployer-tx-lock/index.ts`

```typescript
// frontend/src/lib/execution/tx-lock.ts
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const LOCK_DIR = join(process.cwd(), '.locks');
const LOCK_FILE = join(LOCK_DIR, 'deployer-tx.lock');

export async function withTxLock<T>(fn: () => Promise<T>): Promise<T> {
    if (!existsSync(LOCK_DIR)) mkdirSync(LOCK_DIR, { recursive: true });

    // Spin-wait for lock (max 30 seconds)
    const start = Date.now();
    while (existsSync(LOCK_FILE)) {
        if (Date.now() - start > 30_000) {
            unlinkSync(LOCK_FILE); // force release stale lock
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    writeFileSync(LOCK_FILE, String(process.pid));
    try {
        return await fn();
    } finally {
        if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
    }
}
```

**Step 3: Create bigint-safe utility**

Reference: Copy from `inspiration/clan-world/apps/server/convex/indexer.ts:64`

```typescript
// frontend/src/lib/utils/bigint-safe.ts
export function bigintSafe(obj: unknown): unknown {
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(bigintSafe);
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [k, bigintSafe(v)])
        );
    }
    return obj;
}
```

**Step 4: Commit**

```bash
git add frontend/src/lib/ethers-provider.ts frontend/src/lib/execution/tx-lock.ts frontend/src/lib/utils/bigint-safe.ts
git commit -m "feat: add ethers provider factory, tx-lock, and bigint-safe utility"
```

---

### Task 10: CityReferee contract

**Files:**
- Create: `contracts/contracts/CityReferee.sol`
- Create: `contracts/test/CityReferee.test.js`

Reference: Design doc Section 1.3 + Appendix B.4 (`settleDaily` function)

**Step 1: Write CityReferee**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SprawlToken.sol";

interface ICityState {
    function updateAgent(uint256 agentId, int256 pnlDelta, uint256 newVolume) external;
    function agents(uint256 agentId) external view returns (
        address wallet, uint256 totalVolume, int256 netPnl,
        uint256 level, uint256 raidWins, uint256 raidLosses,
        uint8 strategyType, bool exists
    );
}

interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId, int128 value, uint8 valueDecimals,
        string calldata tag1, string calldata tag2,
        string calldata endpoint, string calldata feedbackURI,
        bytes32 feedbackHash, bytes calldata feedbackAuth
    ) external;
}

contract CityReferee {
    address public owner;
    ICityState public cityState;
    SprawlToken public sprawlToken;
    IReputationRegistry public reputationRegistry;

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(address _cityState, address _sprawlToken, address _reputationRegistry) {
        owner = msg.sender;
        cityState = ICityState(_cityState);
        sprawlToken = SprawlToken(_sprawlToken);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    function recordOutcome(uint256 agentId, int256 pnl, uint256 newVolume, string calldata tag) external onlyOwner {
        cityState.updateAgent(agentId, pnl, newVolume);

        int128 score = _pnlToScore(pnl);
        reputationRegistry.giveFeedback(agentId, score, 2, tag, "", "", "", bytes32(0), "");
    }

    function settleDaily(uint256 agentId, int256 dailyPnl, uint256 sprawlReward) external onlyOwner {
        (address wallet,,,,,,, bool exists) = cityState.agents(agentId);
        require(exists, "Agent not found");

        if (dailyPnl > 0 && sprawlReward > 0) {
            sprawlToken.mint(wallet, sprawlReward);
        }
    }

    function _pnlToScore(int256 pnl) internal pure returns (int128) {
        if (pnl > 10000e18) return 100;
        if (pnl < -10000e18) return -100;
        return int128(pnl / 100e18);
    }
}
```

**Step 2: Write tests**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CityReferee", function () {
    let referee, cityState, sprawlToken, owner, other;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("SprawlToken");
        sprawlToken = await Token.deploy("SPRAWL", "SPRAWL", owner.address);

        const CS = await ethers.getContractFactory("CityState");
        cityState = await CS.deploy();

        // Deploy a mock ReputationRegistry (just needs to not revert)
        // For testing, use a dummy address — recordOutcome will revert on the
        // giveFeedback call unless we mock it, so we test settleDaily separately
        const Referee = await ethers.getContractFactory("CityReferee");
        referee = await Referee.deploy(cityState.address, sprawlToken.address, ethers.constants.AddressZero);

        // Set referee on CityState so updateAgent works
        await cityState.setReferee(referee.address);
        // Transfer SPRAWL minter to referee
        await sprawlToken.setMinter(referee.address);
        // Spawn an agent via CityState (owner can do this)
        await cityState.spawnAgent(1, other.address, 0);
    });

    it("should settle daily and mint SPRAWL for profitable agent", async function () {
        await referee.settleDaily(1, 500, ethers.utils.parseEther("10"));
        expect(await sprawlToken.balanceOf(other.address)).to.equal(ethers.utils.parseEther("10"));
    });

    it("should not mint SPRAWL when dailyPnl is negative", async function () {
        await referee.settleDaily(1, -200, 0);
        expect(await sprawlToken.balanceOf(other.address)).to.equal(0);
    });

    it("should reject non-owner calls", async function () {
        await expect(
            referee.connect(other).settleDaily(1, 100, ethers.utils.parseEther("5"))
        ).to.be.revertedWith("Not owner");
    });

    it("should revert settleDaily for non-existent agent", async function () {
        await expect(
            referee.settleDaily(999, 100, ethers.utils.parseEther("5"))
        ).to.be.revertedWith("Agent not found");
    });
});
```

**Step 3: Run tests**

```bash
cd contracts && npx hardhat test test/CityReferee.test.js
```
Expected: 4 passing

**Step 4: Commit**

```bash
git add contracts/contracts/CityReferee.sol contracts/test/CityReferee.test.js
git commit -m "feat: add CityReferee contract with settleDaily and recordOutcome"
```

---

### Task 11: RaidContract

**Files:**
- Create: `contracts/contracts/RaidContract.sol`
- Create: `contracts/test/RaidContract.test.js`

Reference: Design doc Section 1.4

**Step 1: Write RaidContract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICityStateRaid {
    function agents(uint256 agentId) external view returns (
        address wallet, uint256 totalVolume, int256 netPnl,
        uint256 level, uint256 raidWins, uint256 raidLosses,
        uint8 strategyType, bool exists
    );
    function recordRaid(uint256 agentId, bool won) external;
}

contract RaidContract {
    address public owner;
    ICityStateRaid public cityState;
    IERC20 public sprawlToken;

    uint256 public constant RAID_COST = 5e18; // 5 SPRAWL burned
    address public constant BURN_ADDRESS = address(0xdead);
    uint256 public constant MAX_DAILY_RAIDS = 3;
    uint256 public constant WEEKLY_COOLDOWN = 7 days;
    uint256 public constant SPOILS_XP = 25;

    // attackerId => day => raid count
    mapping(uint256 => mapping(uint256 => uint256)) public dailyRaids;
    // attackerId => defenderId => last raid timestamp
    mapping(uint256 => mapping(uint256 => uint256)) public weeklyTarget;

    event RaidResult(uint256 indexed attackerId, uint256 indexed defenderId, bool attackerWon, uint256 spoilsXp);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(address _cityState, address _sprawlToken) {
        owner = msg.sender;
        cityState = ICityStateRaid(_cityState);
        sprawlToken = IERC20(_sprawlToken);
    }

    function initiateRaid(uint256 attackerId, uint256 defenderId) external onlyOwner {
        require(attackerId != defenderId, "Cannot self-raid");

        (,,,,,,, bool attackerExists) = cityState.agents(attackerId);
        (,,,,,,, bool defenderExists) = cityState.agents(defenderId);
        require(attackerExists, "Attacker not found");
        require(defenderExists, "Defender not found");

        uint256 today = block.timestamp / 1 days;
        require(dailyRaids[attackerId][today] < MAX_DAILY_RAIDS, "Max 3 raids/day");
        require(
            weeklyTarget[attackerId][defenderId] == 0 ||
            block.timestamp - weeklyTarget[attackerId][defenderId] >= WEEKLY_COOLDOWN,
            "Weekly target cooldown"
        );

        // Burn 5 SPRAWL raid cost (transferred from caller to burn address)
        sprawlToken.transferFrom(msg.sender, BURN_ADDRESS, RAID_COST);

        // Scoring
        (, uint256 aTotalVolume,, uint256 aLevel, uint256 aRaidWins,,,) = cityState.agents(attackerId);
        (, uint256 dTotalVolume,, uint256 dLevel, uint256 dRaidWins,,,) = cityState.agents(defenderId);

        uint256 attackScore = aTotalVolume * 3 + aRaidWins * 50 + aLevel * 10;
        uint256 defenseScore = dTotalVolume * 3 + dRaidWins * 30 + dLevel * 10;

        bool attackerWon = attackScore > defenseScore;

        // Update state
        dailyRaids[attackerId][today]++;
        weeklyTarget[attackerId][defenderId] = block.timestamp;

        // Record raid outcomes on CityState
        cityState.recordRaid(attackerId, attackerWon);
        cityState.recordRaid(defenderId, !attackerWon);

        emit RaidResult(attackerId, defenderId, attackerWon, SPOILS_XP);
    }

    function today() external view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
```

**Step 2: Write tests**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RaidContract", function () {
    let raid, cityState, sprawlToken, owner, other;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("SprawlToken");
        sprawlToken = await Token.deploy("SPRAWL", "SPRAWL", owner.address);

        const CS = await ethers.getContractFactory("CityState");
        cityState = await CS.deploy();

        const Raid = await ethers.getContractFactory("RaidContract");
        raid = await Raid.deploy(cityState.address, sprawlToken.address);

        // Set raid contract as referee on CityState (so recordRaid works)
        await cityState.setReferee(raid.address);

        // Spawn two agents with different stats
        await cityState.spawnAgent(1, owner.address, 0);
        await cityState.spawnAgent(2, other.address, 0);

        // Give owner some SPRAWL for raid costs and approve
        await sprawlToken.mint(owner.address, ethers.utils.parseEther("100"));
        await sprawlToken.approve(raid.address, ethers.utils.parseEther("100"));
    });

    it("should execute a raid and emit RaidResult", async function () {
        await expect(raid.initiateRaid(1, 2))
            .to.emit(raid, "RaidResult")
            .withArgs(1, 2, false, 25); // both agents have equal stats, so attackScore == defenseScore → attacker loses
    });

    it("should burn 5 SPRAWL on raid", async function () {
        const balanceBefore = await sprawlToken.balanceOf(owner.address);
        await raid.initiateRaid(1, 2);
        const balanceAfter = await sprawlToken.balanceOf(owner.address);
        expect(balanceBefore.sub(balanceAfter)).to.equal(ethers.utils.parseEther("5"));
    });

    it("should enforce max 3 raids per day", async function () {
        await raid.initiateRaid(1, 2);
        // Need different targets for weekly cooldown, so spawn more agents
        await cityState.spawnAgent(3, other.address, 0);
        await cityState.spawnAgent(4, other.address, 0);
        await cityState.spawnAgent(5, other.address, 0);

        await raid.initiateRaid(1, 3);
        await raid.initiateRaid(1, 4);
        await expect(raid.initiateRaid(1, 5)).to.be.revertedWith("Max 3 raids/day");
    });

    it("should enforce weekly per-target cooldown", async function () {
        await raid.initiateRaid(1, 2);
        await expect(raid.initiateRaid(1, 2)).to.be.revertedWith("Weekly target cooldown");
    });

    it("should reject self-raid", async function () {
        await expect(raid.initiateRaid(1, 1)).to.be.revertedWith("Cannot self-raid");
    });

    it("should update raid wins/losses on CityState", async function () {
        await raid.initiateRaid(1, 2);
        const attacker = await cityState.agents(1);
        const defender = await cityState.agents(2);
        // With equal stats, attacker loses (attackScore not > defenseScore)
        expect(attacker.raidLosses).to.equal(1);
        expect(defender.raidWins).to.equal(1);
    });
});
```

**Step 3: Run tests**

```bash
cd contracts && npx hardhat test test/RaidContract.test.js
```
Expected: 6 passing

**Step 4: Commit**

```bash
git add contracts/contracts/RaidContract.sol contracts/test/RaidContract.test.js
git commit -m "feat: add RaidContract with scoring, cooldowns, and SPRAWL burn"
```

---

### Task 12: BillboardContract

**Files:**
- Create: `contracts/contracts/BillboardContract.sol`
- Create: `contracts/test/BillboardContract.test.js`

Reference: Design doc Appendix L

**Step 1: Write BillboardContract**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BillboardContract {
    IERC20 public sprawlToken;
    address public constant BURN_ADDRESS = address(0xdead);

    struct Billboard {
        address advertiser;
        string contentURI;
        string vehicleType;
        uint256 sprawlPaid;
        uint256 expiresAt;
    }

    mapping(uint256 => Billboard) public billboards;
    uint256 public nextBillboardId;

    // Cost per day in SPRAWL (18 decimals) by vehicle type
    mapping(string => uint256) public costPerDay;

    event BillboardPurchased(uint256 indexed id, address indexed advertiser, string vehicleType,
                             string contentURI, uint256 sprawlPaid, uint256 expiresAt);
    event BillboardExpired(uint256 indexed id);

    constructor(address _sprawlToken) {
        sprawlToken = IERC20(_sprawlToken);

        // Default pricing (in SPRAWL per day)
        costPerDay["plane"] = 50e18;
        costPerDay["blimp"] = 30e18;
        costPerDay["billboard"] = 20e18;
        costPerDay["rooftop_sign"] = 15e18;
        costPerDay["led_wrap"] = 40e18;
    }

    function purchaseBillboard(
        string calldata contentURI,
        string calldata vehicleType,
        uint256 durationDays
    ) external {
        require(durationDays > 0 && durationDays <= 30, "Duration 1-30 days");
        uint256 dailyCost = costPerDay[vehicleType];
        require(dailyCost > 0, "Invalid vehicle type");

        uint256 cost = dailyCost * durationDays;
        sprawlToken.transferFrom(msg.sender, BURN_ADDRESS, cost);

        uint256 expiresAt = block.timestamp + durationDays * 1 days;
        billboards[nextBillboardId] = Billboard(msg.sender, contentURI, vehicleType, cost, expiresAt);

        emit BillboardPurchased(nextBillboardId, msg.sender, vehicleType, contentURI, cost, expiresAt);
        nextBillboardId++;
    }

    function isActive(uint256 id) external view returns (bool) {
        return billboards[id].expiresAt > block.timestamp;
    }
}
```

**Step 2: Write tests**

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BillboardContract", function () {
    let billboard, sprawlToken, owner, advertiser;

    beforeEach(async function () {
        [owner, advertiser] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("SprawlToken");
        sprawlToken = await Token.deploy("SPRAWL", "SPRAWL", owner.address);

        const Billboard = await ethers.getContractFactory("BillboardContract");
        billboard = await Billboard.deploy(sprawlToken.address);

        // Give advertiser SPRAWL and approve
        await sprawlToken.mint(advertiser.address, ethers.utils.parseEther("1000"));
        await sprawlToken.connect(advertiser).approve(billboard.address, ethers.utils.parseEther("1000"));
    });

    it("should purchase a billboard and emit event", async function () {
        await expect(
            billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "blimp", 3)
        ).to.emit(billboard, "BillboardPurchased");

        const bb = await billboard.billboards(0);
        expect(bb.advertiser).to.equal(advertiser.address);
        expect(bb.contentURI).to.equal("ipfs://Qm123");
        expect(bb.vehicleType).to.equal("blimp");
        expect(bb.sprawlPaid).to.equal(ethers.utils.parseEther("90")); // 30 * 3
    });

    it("should burn SPRAWL on purchase", async function () {
        const balanceBefore = await sprawlToken.balanceOf(advertiser.address);
        await billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "billboard", 2);
        const balanceAfter = await sprawlToken.balanceOf(advertiser.address);
        expect(balanceBefore.sub(balanceAfter)).to.equal(ethers.utils.parseEther("40")); // 20 * 2
    });

    it("should reject invalid vehicle type", async function () {
        await expect(
            billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "helicopter", 1)
        ).to.be.revertedWith("Invalid vehicle type");
    });
});
```

**Step 3: Run tests**

```bash
cd contracts && npx hardhat test test/BillboardContract.test.js
```
Expected: 3 passing

**Step 4: Commit**

```bash
git add contracts/contracts/BillboardContract.sol contracts/test/BillboardContract.test.js
git commit -m "feat: add BillboardContract with SPRAWL burn and vehicle types"
```

---

### Task 13: Update CityState to add recordRaid method

CityState already has `recordRaid` in the contract from Task 4, but the test file needs coverage for it.

**Files:**
- Update: `contracts/test/CityState.test.js`

**Step 1: Add recordRaid tests to CityState test file**

Append these tests to the existing `describe("CityState", ...)` block:

```javascript
    it("should record raid win via referee", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 0);
        await cityState.connect(referee).recordRaid(1, true);
        const agent = await cityState.agents(1);
        expect(agent.raidWins).to.equal(1);
        expect(agent.raidLosses).to.equal(0);
    });

    it("should record raid loss via referee", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 0);
        await cityState.connect(referee).recordRaid(1, false);
        const agent = await cityState.agents(1);
        expect(agent.raidWins).to.equal(0);
        expect(agent.raidLosses).to.equal(1);
    });

    it("should reject recordRaid from non-referee", async function () {
        await cityState.spawnAgent(1, agentWallet.address, 0);
        await expect(
            cityState.connect(agentWallet).recordRaid(1, true)
        ).to.be.revertedWith("Not referee");
    });
```

**Step 2: Run tests**

```bash
cd contracts && npx hardhat test test/CityState.test.js
```
Expected: 7 passing (4 original + 3 new)

**Step 3: Commit**

```bash
git add contracts/test/CityState.test.js
git commit -m "test: add recordRaid coverage to CityState tests"
```

---

### Task 14: Update deploy script

**Files:**
- Update: `contracts/scripts/deploy.js`
- Update: `contracts/contracts/SprawlToken.sol`

The deploy script needs CityReferee, RaidContract, and BillboardContract. CityReferee must be authorized to mint $SPRAWL. Since SprawlToken only supports a single minter, and both AgentFaucet and CityReferee need to mint, update SprawlToken to support a secondary minter.

**Step 1: Update SprawlToken to support a secondary minter**

Add to `SprawlToken.sol`:

```solidity
    address public secondaryMinter;

    function setSecondaryMinter(address _secondaryMinter) external onlyMinter {
        secondaryMinter = _secondaryMinter;
    }
```

Update the `onlyMinter` modifier:

```solidity
    modifier onlyMinter() {
        require(msg.sender == minter || msg.sender == secondaryMinter, "Only minter");
        _;
    }
```

**Step 2: Update deploy.js**

Add to deploy.js after the AgentFaucet deployment and before writing addresses:

```javascript
    // 5. Deploy CityReferee
    console.log("\n--- Deploying CityReferee ---");
    const Referee = await hre.ethers.getContractFactory("CityReferee");
    const referee = await Referee.deploy(
        cityState.address,
        sprawl.address,
        "0x8004B663056A597Dffe9eCcC1965A193B7388713" // ERC-8004 ReputationRegistry on Mantle Sepolia
    );
    console.log("CityReferee:", referee.address);

    // 6. Deploy RaidContract
    console.log("\n--- Deploying RaidContract ---");
    const Raid = await hre.ethers.getContractFactory("RaidContract");
    const raidContract = await Raid.deploy(cityState.address, sprawl.address);
    console.log("RaidContract:", raidContract.address);

    // 7. Deploy BillboardContract
    console.log("\n--- Deploying BillboardContract ---");
    const BB = await hre.ethers.getContractFactory("BillboardContract");
    const billboardContract = await BB.deploy(sprawl.address);
    console.log("BillboardContract:", billboardContract.address);

    // 8. Set CityReferee as referee on CityState
    console.log("\n--- Configuring roles ---");
    await cityState.setReferee(referee.address);
    console.log("CityState referee → CityReferee");

    // 9. Set CityReferee as secondary minter on SPRAWL token
    // (AgentFaucet is primary minter, CityReferee is secondary for daily settlement rewards)
    await sprawl.setSecondaryMinter(referee.address);
    console.log("SPRAWL secondaryMinter → CityReferee");
```

Update the addresses object:

```javascript
    const addresses = {
        sETH: sETH.address,
        sBTC: sBTC.address,
        sUSDC: sUSDC.address,
        sPOL: sPOL.address,
        sSOL: sSOL.address,
        SPRAWL: sprawl.address,
        SprawlDEX: dex.address,
        CityState: cityState.address,
        AgentFaucet: faucet.address,
        CityReferee: referee.address,
        RaidContract: raidContract.address,
        BillboardContract: billboardContract.address,
        deployer: deployer.address,
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
    };
```

**Step 3: Update frontend config**

Add to `frontend/src/lib/config.ts` CONTRACTS object:

```typescript
    CityReferee: deployments.CityReferee,
    RaidContract: deployments.RaidContract,
    BillboardContract: deployments.BillboardContract,
```

**Step 4: Run local deploy test**

```bash
cd contracts && npx hardhat run scripts/deploy.js
```
Expected: All contracts deployed, CityReferee set as referee, secondary minter configured.

**Step 5: Commit**

```bash
git add contracts/contracts/SprawlToken.sol contracts/scripts/deploy.js frontend/src/lib/config.ts
git commit -m "feat: add CityReferee, RaidContract, BillboardContract to deploy pipeline"
```

---

## Summary: What Phase 1 Delivers

After completing all 14 tasks:

- [x] Two-folder project structure (contracts/ + frontend/)
- [x] SprawlToken ERC-20 with primary + secondary minter roles (6 tokens deployed)
- [x] SprawlDEX constant-product AMM with swap, LP, price queries
- [x] CityState contract with agent spawn, decisions, outcomes, and raid tracking
- [x] AgentFaucet for $10K starting portfolios
- [x] CityReferee with settleDaily (mints $SPRAWL) and recordOutcome (writes to ERC-8004)
- [x] RaidContract with scoring formula, cooldowns, daily limits, and 5 SPRAWL burn
- [x] BillboardContract with vehicle types, duration pricing, and SPRAWL burn
- [x] All contracts deployed to Mantle Sepolia
- [x] 5 DEX pools seeded with real-price-ratio liquidity
- [x] TypeScript types (AgentRecord, CityBuilding, AgentPolicy)
- [x] Contract ABIs + addresses in frontend constants
- [x] Ethers provider factory + tx-lock + bigint-safe utilities
- [x] Full deploy script with role configuration (referee, secondary minter)

**Next phase:** Phase 2 (Agent Engine) — the tick loop, strategy engines, memory, DeepSeek v4 integration, and the MarketMaker price feed bot.
