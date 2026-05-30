// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CityState {
    address public owner;
    address public referee;
    address public raidContract;

    struct AgentStats {
        address wallet;
        uint256 totalVolume;
        int256 netPnl;
        uint256 level;
        uint256 raidWins;
        uint256 raidLosses;
        uint8 strategyType;
        bool exists;
    }

    mapping(uint256 => AgentStats) public agents;
    uint256 public agentCount;

    event AgentSpawned(uint256 indexed agentId, address indexed wallet, uint8 strategyType);
    event AgentDecision(uint256 indexed agentId, string action, string protocol, bytes params, uint256 ts);
    event AgentOutcome(uint256 indexed agentId, int256 pnlDelta, uint256 newVolume, uint256 newLevel);
    event BuildingGrew(uint256 indexed agentId, uint256 newLevel);
    event RaidRecorded(uint256 indexed attackerId, uint256 indexed defenderId, bool attackerWon);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == referee || msg.sender == raidContract || msg.sender == owner,
            "Not authorized"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setReferee(address _referee) external onlyOwner {
        referee = _referee;
    }

    function setRaidContract(address _raidContract) external onlyOwner {
        raidContract = _raidContract;
    }

    function spawnAgent(uint256 agentId, address wallet, uint8 strategyType) external onlyOwner {
        require(!agents[agentId].exists, "Agent exists");
        agents[agentId] = AgentStats(wallet, 0, 0, 1, 0, 0, strategyType, true);
        agentCount++;
        emit AgentSpawned(agentId, wallet, strategyType);
    }

    function recordDecision(
        uint256 agentId,
        string calldata action,
        string calldata protocol,
        bytes calldata params
    ) external {
        require(agents[agentId].exists, "Agent not found");
        require(
            msg.sender == agents[agentId].wallet || msg.sender == owner || msg.sender == referee,
            "Unauthorized"
        );
        emit AgentDecision(agentId, action, protocol, params, block.timestamp);
    }

    function updateAgent(uint256 agentId, int256 pnlDelta, uint256 newVolume) external onlyAuthorized {
        AgentStats storage stats = agents[agentId];
        require(stats.exists, "Agent not found");
        stats.totalVolume = newVolume;
        stats.netPnl += pnlDelta;
        uint256 newLevel = 1 + newVolume / 100000e18;
        if (newLevel > stats.level) {
            stats.level = newLevel;
            emit BuildingGrew(agentId, newLevel);
        }
        emit AgentOutcome(agentId, pnlDelta, newVolume, stats.level);
    }

    function recordRaid(uint256 attackerId, uint256 defenderId, bool attackerWon) external onlyAuthorized {
        AgentStats storage attacker = agents[attackerId];
        AgentStats storage defender = agents[defenderId];
        require(attacker.exists && defender.exists, "Agent not found");
        if (attackerWon) {
            attacker.raidWins++;
            defender.raidLosses++;
        } else {
            attacker.raidLosses++;
            defender.raidWins++;
        }
        emit RaidRecorded(attackerId, defenderId, attackerWon);
    }
}
