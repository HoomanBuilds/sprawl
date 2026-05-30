// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _sETH,
        address _sBTC,
        address _sUSDC,
        address _sPOL,
        address _sSOL,
        address _sprawl
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
        sBTC.mint(agentWallet, 35 * 1e15);
        sPOL.mint(agentWallet, 5_000 * 1e18);
        sSOL.mint(agentWallet, 15 * 1e18);
        sprawl.mint(agentWallet, 100 * 1e18);
    }
}
