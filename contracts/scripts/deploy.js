const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)));

  const Token = await hre.ethers.getContractFactory("SprawlToken");
  const e = hre.ethers.parseEther;

  // ── 1. Deploy tokens ──
  console.log("\n--- Deploying tokens ---");
  const sETH = await Token.deploy("Sprawl ETH", "sETH", deployer.address);
  const sBTC = await Token.deploy("Sprawl BTC", "sBTC", deployer.address);
  const sUSDC = await Token.deploy("Sprawl USDC", "sUSDC", deployer.address);
  const sPOL = await Token.deploy("Sprawl POL", "sPOL", deployer.address);
  const sSOL = await Token.deploy("Sprawl SOL", "sSOL", deployer.address);
  const sprawl = await Token.deploy("SPRAWL", "SPRAWL", deployer.address);
  await Promise.all([sETH.waitForDeployment(), sBTC.waitForDeployment(), sUSDC.waitForDeployment(), sPOL.waitForDeployment(), sSOL.waitForDeployment(), sprawl.waitForDeployment()]);

  console.log("sETH:", await sETH.getAddress());
  console.log("sBTC:", await sBTC.getAddress());
  console.log("sUSDC:", await sUSDC.getAddress());
  console.log("sPOL:", await sPOL.getAddress());
  console.log("sSOL:", await sSOL.getAddress());
  console.log("SPRAWL:", await sprawl.getAddress());

  // ── 2. Deploy SprawlDEX ──
  console.log("\n--- Deploying SprawlDEX ---");
  const DEX = await hre.ethers.getContractFactory("SprawlDEX");
  const dex = await DEX.deploy();
  await dex.waitForDeployment();
  console.log("SprawlDEX:", await dex.getAddress());

  // ── 3. Seed pools (deployer is still minter, seed BEFORE transferring) ──
  console.log("\n--- Seeding DEX pools ---");
  const POOLS = [
    { name: "sETH/sUSDC", tA: sETH, tB: sUSDC, aA: e("100"), aB: e("250000") },
    { name: "sBTC/sUSDC", tA: sBTC, tB: sUSDC, aA: e("5"), aB: e("350000") },
    { name: "sPOL/sUSDC", tA: sPOL, tB: sUSDC, aA: e("500000"), aB: e("225000") },
    { name: "sSOL/sUSDC", tA: sSOL, tB: sUSDC, aA: e("1500"), aB: e("262500") },
    { name: "SPRAWL/sUSDC", tA: sprawl, tB: sUSDC, aA: e("100000"), aB: e("100000") },
  ];

  const dexAddr = await dex.getAddress();
  for (const pool of POOLS) {
    await pool.tA.mint(deployer.address, pool.aA);
    await pool.tB.mint(deployer.address, pool.aB);
    await pool.tA.approve(dexAddr, pool.aA);
    await pool.tB.approve(dexAddr, pool.aB);
    await dex.createPool(await pool.tA.getAddress(), await pool.tB.getAddress(), pool.aA, pool.aB, 3, 1000);
    console.log(`  ✓ ${pool.name} seeded`);
  }

  // ── 4. Deploy CityState ──
  console.log("\n--- Deploying CityState ---");
  const CS = await hre.ethers.getContractFactory("CityState");
  const cityState = await CS.deploy();
  await cityState.waitForDeployment();
  console.log("CityState:", await cityState.getAddress());

  // ── 5. Deploy CityReferee ──
  console.log("\n--- Deploying CityReferee ---");
  const ERC8004_REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713"; // Mantle Sepolia
  const Referee = await hre.ethers.getContractFactory("CityReferee");
  const referee = await Referee.deploy(
    await cityState.getAddress(),
    await sprawl.getAddress(),
    ERC8004_REPUTATION
  );
  await referee.waitForDeployment();
  console.log("CityReferee:", await referee.getAddress());

  // ── 6. Deploy RaidContract ──
  console.log("\n--- Deploying RaidContract ---");
  const Raid = await hre.ethers.getContractFactory("RaidContract");
  const raidContract = await Raid.deploy(await cityState.getAddress(), await sprawl.getAddress());
  await raidContract.waitForDeployment();
  console.log("RaidContract:", await raidContract.getAddress());

  // ── 7. Deploy BillboardContract ──
  console.log("\n--- Deploying BillboardContract ---");
  const BB = await hre.ethers.getContractFactory("BillboardContract");
  const billboardContract = await BB.deploy(await sprawl.getAddress());
  await billboardContract.waitForDeployment();
  console.log("BillboardContract:", await billboardContract.getAddress());

  // ── 8. Deploy AgentFaucet ──
  console.log("\n--- Deploying AgentFaucet ---");
  const Faucet = await hre.ethers.getContractFactory("AgentFaucet");
  const faucet = await Faucet.deploy(
    await sETH.getAddress(), await sBTC.getAddress(), await sUSDC.getAddress(),
    await sPOL.getAddress(), await sSOL.getAddress(), await sprawl.getAddress()
  );
  await faucet.waitForDeployment();
  console.log("AgentFaucet:", await faucet.getAddress());

  // ── 9. Wire permissions ──
  console.log("\n--- Wiring permissions ---");

  // CityState: referee = CityReferee (for updateAgent, recordRaid via RaidContract needs separate referee)
  // Since CityState only allows one referee, set it to deployer (who proxies for both CityReferee and RaidContract)
  // Alternatively set referee to CityReferee and have RaidContract call via CityReferee
  // For simplicity: keep deployer as owner who calls both directly
  await cityState.setReferee(await referee.getAddress());
  console.log("  CityState referee → CityReferee");

  // SPRAWL: set secondary minter FIRST (requires primary minter = deployer still)
  await sprawl.setSecondaryMinter(await referee.getAddress());
  console.log("  SPRAWL secondary minter → CityReferee");
  // Now transfer primary minter to AgentFaucet
  await sprawl.setMinter(await faucet.getAddress());
  console.log("  SPRAWL primary minter → AgentFaucet");

  // Transfer other token minters to AgentFaucet
  for (const [name, token] of [["sETH", sETH], ["sBTC", sBTC], ["sUSDC", sUSDC], ["sPOL", sPOL], ["sSOL", sSOL]]) {
    await token.setMinter(await faucet.getAddress());
    console.log(`  ${name} minter → AgentFaucet`);
  }

  // ── 10. Save addresses ──
  const addresses = {
    sETH: await sETH.getAddress(),
    sBTC: await sBTC.getAddress(),
    sUSDC: await sUSDC.getAddress(),
    sPOL: await sPOL.getAddress(),
    sSOL: await sSOL.getAddress(),
    SPRAWL: await sprawl.getAddress(),
    SprawlDEX: await dex.getAddress(),
    CityState: await cityState.getAddress(),
    CityReferee: await referee.getAddress(),
    RaidContract: await raidContract.getAddress(),
    BillboardContract: await billboardContract.getAddress(),
    AgentFaucet: await faucet.getAddress(),
    deployer: deployer.address,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    ERC8004_Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    ERC8004_Reputation: ERC8004_REPUTATION,
  };

  fs.writeFileSync("deployments.json", JSON.stringify(addresses, null, 2));
  console.log("\n✓ All addresses saved to deployments.json");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
