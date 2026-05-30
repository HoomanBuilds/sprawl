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
      sETH.target, sBTC.target, sUSDC.target,
      sPOL.target, sSOL.target, sprawl.target
    );

    for (const token of [sETH, sBTC, sUSDC, sPOL, sSOL, sprawl]) {
      await token.setMinter(faucet.target);
    }
  });

  it("should fund a new agent with starting portfolio", async function () {
    await faucet.fundNewAgent(agent.address);
    expect(await sUSDC.balanceOf(agent.address)).to.equal(ethers.parseEther("5000"));
    expect(await sETH.balanceOf(agent.address)).to.equal(ethers.parseEther("1"));
    expect(await sBTC.balanceOf(agent.address)).to.equal(ethers.parseUnits("35", 15));
    expect(await sPOL.balanceOf(agent.address)).to.equal(ethers.parseEther("5000"));
    expect(await sSOL.balanceOf(agent.address)).to.equal(ethers.parseEther("15"));
    expect(await sprawl.balanceOf(agent.address)).to.equal(ethers.parseEther("100"));
  });

  it("should reject double funding", async function () {
    await faucet.fundNewAgent(agent.address);
    await expect(faucet.fundNewAgent(agent.address)).to.be.revertedWith("Already funded");
  });
});
