const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RaidContract", function () {
  let raid, cityState, sprawlToken, owner, attacker, defender;

  beforeEach(async function () {
    [owner, attacker, defender] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("SprawlToken");
    sprawlToken = await Token.deploy("SPRAWL", "SPRAWL", owner.address);

    const CS = await ethers.getContractFactory("CityState");
    cityState = await CS.deploy();

    const Raid = await ethers.getContractFactory("RaidContract");
    raid = await Raid.deploy(cityState.target, sprawlToken.target);

    // Wire: RaidContract needs referee role on CityState to call recordRaid
    await cityState.setReferee(raid.target);

    // Spawn agents with different volumes for scoring
    await cityState.spawnAgent(1, attacker.address, 0);
    await cityState.spawnAgent(2, defender.address, 1);

    // Give attacker higher stats by updating via owner (who is also referee-eligible via onlyOwner)
    // We need to temporarily set owner as referee to update stats
    await cityState.setReferee(owner.address);
    await cityState.updateAgent(1, 1000, ethers.parseEther("50000")); // attacker: high volume
    await cityState.updateAgent(2, 100, ethers.parseEther("10000"));  // defender: lower volume
    await cityState.setReferee(raid.target); // restore

    // Mint SPRAWL to attacker for raid cost and approve
    await sprawlToken.mint(attacker.address, ethers.parseEther("100"));
    await sprawlToken.connect(attacker).approve(raid.target, ethers.parseEther("100"));
  });

  it("should execute a raid and emit result", async function () {
    await expect(raid.initiateRaid(1, 2, attacker.address))
      .to.emit(raid, "RaidResult");
  });

  it("should burn 5 SPRAWL from raid payer", async function () {
    const before = await sprawlToken.balanceOf(attacker.address);
    await raid.initiateRaid(1, 2, attacker.address);
    const after_ = await sprawlToken.balanceOf(attacker.address);
    expect(before - after_).to.equal(ethers.parseEther("5"));
  });

  it("should update raid wins/losses on CityState", async function () {
    await raid.initiateRaid(1, 2, attacker.address);
    const a = await cityState.agents(1);
    const d = await cityState.agents(2);
    // Attacker has higher volume so should win
    expect(a.raidWins).to.equal(1);
    expect(d.raidLosses).to.equal(1);
  });

  it("should enforce max 3 daily raids", async function () {
    // Need enough SPRAWL for 4 raids
    await sprawlToken.mint(attacker.address, ethers.parseEther("100"));
    await sprawlToken.connect(attacker).approve(raid.target, ethers.parseEther("100"));

    // Spawn extra defenders
    await cityState.spawnAgent(3, defender.address, 0);
    await cityState.spawnAgent(4, defender.address, 0);
    await cityState.spawnAgent(5, defender.address, 0);

    await raid.initiateRaid(1, 2, attacker.address);
    await raid.initiateRaid(1, 3, attacker.address);
    await raid.initiateRaid(1, 4, attacker.address);

    await expect(raid.initiateRaid(1, 5, attacker.address))
      .to.be.revertedWith("Max daily raids");
  });

  it("should reject self-raid", async function () {
    await expect(raid.initiateRaid(1, 1, attacker.address))
      .to.be.revertedWith("Cannot self-raid");
  });
});
