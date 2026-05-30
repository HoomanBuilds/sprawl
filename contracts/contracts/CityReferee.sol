// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _cityState, address _sprawlToken, address _reputationRegistry) {
        owner = msg.sender;
        cityState = ICityState(_cityState);
        sprawlToken = SprawlToken(_sprawlToken);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    function recordOutcome(
        uint256 agentId,
        int256 pnl,
        uint256 newVolume,
        string calldata tag
    ) external onlyOwner {
        cityState.updateAgent(agentId, pnl, newVolume);

        // Write reputation to ERC-8004 ReputationRegistry (already deployed on Mantle Sepolia at 0x8004B663...)
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
