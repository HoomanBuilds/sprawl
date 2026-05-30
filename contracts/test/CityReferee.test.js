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

    // Deploy CityReferee with zero address for reputation registry (we test settleDaily, not recordOutcome)
    const Referee = await ethers.getContractFactory("CityReferee");
    referee = await Referee.deploy(cityState.target, sprawlToken.target, ethers.ZeroAddress);

    // Wire up permissions
    await cityState.setReferee(referee.target);
    await sprawlToken.setSecondaryMinter(referee.target);

    // Spawn an agent
    await cityState.spawnAgent(1, other.address, 0);
  });

  it("should settle daily and mint SPRAWL for profitable agent", async function () {
    await referee.settleDaily(1, 500, ethers.parseEther("10"));
    expect(await sprawlToken.balanceOf(other.address)).to.equal(ethers.parseEther("10"));
  });

  it("should not mint SPRAWL when dailyPnl is negative", async function () {
    await referee.settleDaily(1, -200, 0);
    expect(await sprawlToken.balanceOf(other.address)).to.equal(0);
  });

  it("should reject non-owner calls", async function () {
    await expect(
      referee.connect(other).settleDaily(1, 100, ethers.parseEther("5"))
    ).to.be.revertedWith("Not owner");
  });

  it("should revert for non-existent agent", async function () {
    await expect(
      referee.settleDaily(999, 100, ethers.parseEther("5"))
    ).to.be.revertedWith("Agent not found");
  });
});
