// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICityStateRaid {
    function agents(uint256 agentId) external view returns (
        address wallet, uint256 totalVolume, int256 netPnl,
        uint256 level, uint256 raidWins, uint256 raidLosses,
        uint8 strategyType, bool exists
    );
    function recordRaid(uint256 attackerId, uint256 defenderId, bool attackerWon) external;
}

contract RaidContract {
    address public owner;
    ICityStateRaid public cityState;
    IERC20 public sprawlToken;

    uint256 public constant RAID_COST = 5e18;
    address public constant BURN_ADDRESS = address(0xdead);
    uint256 public constant MAX_DAILY_RAIDS = 3;
    uint256 public constant WEEKLY_COOLDOWN = 7 days;

    mapping(uint256 => mapping(uint256 => uint256)) public dailyRaids; // attackerId => day => count
    mapping(uint256 => mapping(uint256 => uint256)) public weeklyTarget; // attackerId => defenderId => lastRaidTs

    event RaidResult(
        uint256 indexed attackerId,
        uint256 indexed defenderId,
        bool attackerWon,
        uint256 attackScore,
        uint256 defenseScore
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _cityState, address _sprawlToken) {
        owner = msg.sender;
        cityState = ICityStateRaid(_cityState);
        sprawlToken = IERC20(_sprawlToken);
    }

    function _agentScore(uint256 agentId, uint256 winMultiplier) internal view returns (uint256) {
        (, uint256 vol,, uint256 lvl, uint256 wins,,,) = cityState.agents(agentId);
        return vol / 1e18 * 3 + wins * winMultiplier + lvl * 10;
    }

    function _checkExists(uint256 agentId) internal view {
        (,,,,,,, bool exists) = cityState.agents(agentId);
        require(exists, "Agent not found");
    }

    function initiateRaid(uint256 attackerId, uint256 defenderId, address raidPayer) external onlyOwner {
        require(attackerId != defenderId, "Cannot self-raid");
        _checkExists(attackerId);
        _checkExists(defenderId);

        uint256 today = block.timestamp / 1 days;
        require(dailyRaids[attackerId][today] < MAX_DAILY_RAIDS, "Max daily raids");
        require(
            weeklyTarget[attackerId][defenderId] == 0 ||
            block.timestamp - weeklyTarget[attackerId][defenderId] >= WEEKLY_COOLDOWN,
            "Weekly cooldown"
        );

        uint256 attackScore = _agentScore(attackerId, 50);
        uint256 defenseScore = _agentScore(defenderId, 30);
        bool attackerWon = attackScore > defenseScore;

        // State changes first (Checks-Effects-Interactions)
        dailyRaids[attackerId][today]++;
        weeklyTarget[attackerId][defenderId] = block.timestamp;
        cityState.recordRaid(attackerId, defenderId, attackerWon);

        // Burn SPRAWL AFTER all validation and state writes succeed
        sprawlToken.transferFrom(raidPayer, BURN_ADDRESS, RAID_COST);

        emit RaidResult(attackerId, defenderId, attackerWon, attackScore, defenseScore);
    }
}
