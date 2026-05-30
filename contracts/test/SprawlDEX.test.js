const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SprawlDEX", function () {
  let dex, tokenA, tokenB, owner, trader;
  const INITIAL_A = ethers.parseEther("10000");
  const INITIAL_B = ethers.parseEther("25000000");

  beforeEach(async function () {
    [owner, trader] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("SprawlToken");
    tokenA = await Token.deploy("Sprawl ETH", "sETH", owner.address);
    tokenB = await Token.deploy("Sprawl USDC", "sUSDC", owner.address);

    const DEX = await ethers.getContractFactory("SprawlDEX");
    dex = await DEX.deploy();

    await tokenA.mint(owner.address, INITIAL_A);
    await tokenB.mint(owner.address, INITIAL_B);
    await tokenA.approve(dex.target, INITIAL_A);
    await tokenB.approve(dex.target, INITIAL_B);

    await dex.createPool(tokenA.target, tokenB.target, INITIAL_A, INITIAL_B, 3, 1000);

    await tokenA.mint(trader.address, ethers.parseEther("100"));
    await tokenA.connect(trader).approve(dex.target, ethers.parseEther("100"));
    await tokenB.mint(trader.address, ethers.parseEther("100000"));
    await tokenB.connect(trader).approve(dex.target, ethers.parseEther("100000"));
  });

  it("should create pool and set reserves", async function () {
    const poolId = await dex.getPoolId(tokenA.target, tokenB.target);
    const pool = await dex.getPoolInfo(poolId);
    expect(pool.reserveA).to.be.gt(0);
    expect(pool.reserveB).to.be.gt(0);
  });

  it("should swap with correct constant product math", async function () {
    const swapAmount = ethers.parseEther("1");
    const expectedOut = await dex.getAmountOut(tokenA.target, tokenB.target, swapAmount);

    await dex.connect(trader).swap(tokenA.target, tokenB.target, swapAmount, 0);

    const traderBalance = await tokenB.balanceOf(trader.address);
    expect(traderBalance).to.equal(ethers.parseEther("100000") + expectedOut);
  });

  it("should enforce slippage protection", async function () {
    const swapAmount = ethers.parseEther("1");
    const tooHighMin = ethers.parseEther("999999");

    await expect(
      dex.connect(trader).swap(tokenA.target, tokenB.target, swapAmount, tooHighMin)
    ).to.be.revertedWith("Slippage exceeded");
  });

  it("should move price after large swap", async function () {
    const priceBefore = await dex.getPrice(tokenA.target, tokenB.target);

    const swapAmount = ethers.parseEther("50");
    await dex.connect(trader).swap(tokenA.target, tokenB.target, swapAmount, 0);

    const priceAfter = await dex.getPrice(tokenA.target, tokenB.target);
    expect(priceAfter).to.be.lt(priceBefore);
  });

  it("should add and remove liquidity", async function () {
    const addA = ethers.parseEther("10");
    const addB = ethers.parseEther("25000");
    await tokenA.mint(trader.address, addA);
    await tokenB.mint(trader.address, addB);
    await tokenA.connect(trader).approve(dex.target, addA);
    await tokenB.connect(trader).approve(dex.target, addB);

    const poolId = await dex.getPoolId(tokenA.target, tokenB.target);
    await dex.connect(trader).addLiquidity(tokenA.target, tokenB.target, addA, addB);

    const shares = await dex.lpShares(poolId, trader.address);
    expect(shares).to.be.gt(0);

    await dex.connect(trader).removeLiquidity(tokenA.target, tokenB.target, shares);
    const sharesAfter = await dex.lpShares(poolId, trader.address);
    expect(sharesAfter).to.equal(0);
  });

  it("should reject duplicate pool creation", async function () {
    await expect(
      dex.createPool(tokenA.target, tokenB.target, 100, 100, 3, 1000)
    ).to.be.revertedWith("Pool exists");
  });
});
