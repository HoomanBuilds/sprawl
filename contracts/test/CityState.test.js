const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CityState", function () {
  let cityState, owner, referee, agentWallet, other;

  beforeEach(async function () {
    [owner, referee, agentWallet, other] = await ethers.getSigners();
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
    expect(await cityState.agentCount()).to.equal(1);
  });

  it("should reject duplicate agent spawn", async function () {
    await cityState.spawnAgent(1, agentWallet.address, 0);
    await expect(cityState.spawnAgent(1, other.address, 0)).to.be.revertedWith("Agent exists");
  });

  it("should record decision from agent wallet", async function () {
    await cityState.spawnAgent(1, agentWallet.address, 0);
    await expect(
      cityState.connect(agentWallet).recordDecision(1, "swap", "SprawlDEX", "0x")
    ).to.emit(cityState, "AgentDecision");
  });

  it("should reject unauthorized decision recording", async function () {
    await cityState.spawnAgent(1, agentWallet.address, 0);
    await expect(
      cityState.connect(other).recordDecision(1, "swap", "SprawlDEX", "0x")
    ).to.be.revertedWith("Unauthorized");
  });

  it("should update agent stats via referee", async function () {
    await cityState.spawnAgent(1, agentWallet.address, 0);
    await cityState.connect(referee).updateAgent(1, 500, ethers.parseEther("200000"));
    const agent = await cityState.agents(1);
    expect(agent.netPnl).to.equal(500);
    expect(agent.level).to.equal(3n); // 1 + 200000 / 100000 = 3
  });

  it("should record raid win correctly", async function () {
    await cityState.spawnAgent(1, agentWallet.address, 0);
    await cityState.spawnAgent(2, other.address, 1);
    await cityState.connect(referee).recordRaid(1, 2, true);
    const attacker = await cityState.agents(1);
    const defender = await cityState.agents(2);
    expect(attacker.raidWins).to.equal(1);
    expect(defender.raidLosses).to.equal(1);
  });

  it("should record raid loss correctly", async function () {
    await cityState.spawnAgent(1, agentWallet.address, 0);
    await cityState.spawnAgent(2, other.address, 1);
    await cityState.connect(referee).recordRaid(1, 2, false);
    const attacker = await cityState.agents(1);
    const defender = await cityState.agents(2);
    expect(attacker.raidLosses).to.equal(1);
    expect(defender.raidWins).to.equal(1);
  });
});
