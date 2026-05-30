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
    await token.mint(other.address, ethers.parseEther("100"));
    expect(await token.balanceOf(other.address)).to.equal(ethers.parseEther("100"));
  });

  it("should reject non-minter", async function () {
    await expect(token.connect(other).mint(other.address, 100)).to.be.revertedWith("Only minter");
  });

  it("should transfer minter role", async function () {
    await token.setMinter(other.address);
    expect(await token.minter()).to.equal(other.address);
  });

  it("should allow secondary minter to mint", async function () {
    await token.setSecondaryMinter(other.address);
    await token.connect(other).mint(other.address, ethers.parseEther("50"));
    expect(await token.balanceOf(other.address)).to.equal(ethers.parseEther("50"));
  });
});
