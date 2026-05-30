const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BillboardContract", function () {
  let billboard, sprawlToken, owner, advertiser;

  beforeEach(async function () {
    [owner, advertiser] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("SprawlToken");
    sprawlToken = await Token.deploy("SPRAWL", "SPRAWL", owner.address);

    const Billboard = await ethers.getContractFactory("BillboardContract");
    billboard = await Billboard.deploy(sprawlToken.target);

    // Fund advertiser with SPRAWL
    await sprawlToken.mint(advertiser.address, ethers.parseEther("1000"));
    await sprawlToken.connect(advertiser).approve(billboard.target, ethers.parseEther("1000"));
  });

  it("should purchase a billboard and emit event", async function () {
    await expect(
      billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "plane", 7)
    ).to.emit(billboard, "BillboardPurchased");

    const bb = await billboard.billboards(0);
    expect(bb.advertiser).to.equal(advertiser.address);
    expect(bb.vehicleType).to.equal("plane");
    expect(bb.sprawlPaid).to.equal(ethers.parseEther("350")); // 50 * 7
  });

  it("should burn SPRAWL on purchase", async function () {
    const before = await sprawlToken.balanceOf(advertiser.address);
    await billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "led_wrap", 3);
    const after_ = await sprawlToken.balanceOf(advertiser.address);
    expect(before - after_).to.equal(ethers.parseEther("30")); // 10 * 3
  });

  it("should reject invalid vehicle type", async function () {
    await expect(
      billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "invalid_type", 1)
    ).to.be.revertedWith("Invalid vehicle type");
  });

  it("should report active/inactive status", async function () {
    await billboard.connect(advertiser).purchaseBillboard("ipfs://Qm123", "billboard", 1);
    expect(await billboard.isActive(0)).to.be.true;
  });
});
