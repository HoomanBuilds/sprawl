// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BillboardContract {
    IERC20 public sprawlToken;
    address public constant BURN_ADDRESS = address(0xdead);

    struct Billboard {
        address advertiser;
        string contentURI;
        string vehicleType;
        uint256 sprawlPaid;
        uint256 expiresAt;
    }

    mapping(uint256 => Billboard) public billboards;
    uint256 public nextBillboardId;

    // Cost per day in SPRAWL (18 decimals) by vehicle type
    mapping(string => uint256) public costPerDay;

    event BillboardPurchased(
        uint256 indexed id,
        address indexed advertiser,
        string vehicleType,
        string contentURI,
        uint256 sprawlPaid,
        uint256 expiresAt
    );

    constructor(address _sprawlToken) {
        sprawlToken = IERC20(_sprawlToken);
        // Set default pricing
        costPerDay["plane"] = 50e18;
        costPerDay["blimp"] = 40e18;
        costPerDay["billboard"] = 20e18;
        costPerDay["rooftop_sign"] = 15e18;
        costPerDay["led_wrap"] = 10e18;
    }

    function purchaseBillboard(
        string calldata contentURI,
        string calldata vehicleType,
        uint256 durationDays
    ) external {
        require(durationDays > 0 && durationDays <= 30, "1-30 days");
        uint256 dailyCost = costPerDay[vehicleType];
        require(dailyCost > 0, "Invalid vehicle type");

        uint256 totalCost = dailyCost * durationDays;
        sprawlToken.transferFrom(msg.sender, BURN_ADDRESS, totalCost);

        uint256 id = nextBillboardId++;
        billboards[id] = Billboard(
            msg.sender,
            contentURI,
            vehicleType,
            totalCost,
            block.timestamp + durationDays * 1 days
        );

        emit BillboardPurchased(id, msg.sender, vehicleType, contentURI, totalCost, billboards[id].expiresAt);
    }

    function isActive(uint256 id) external view returns (bool) {
        return billboards[id].expiresAt > block.timestamp;
    }
}
