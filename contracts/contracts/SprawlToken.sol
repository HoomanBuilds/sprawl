// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SprawlToken is ERC20 {
    address public minter;
    address public secondaryMinter;

    modifier onlyMinter() {
        require(msg.sender == minter || msg.sender == secondaryMinter, "Only minter");
        _;
    }

    constructor(string memory name_, string memory symbol_, address minter_) ERC20(name_, symbol_) {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function setMinter(address newMinter) external {
        require(msg.sender == minter, "Only primary minter");
        require(newMinter != address(0), "Zero address");
        minter = newMinter;
    }

    function setSecondaryMinter(address _secondaryMinter) external {
        require(msg.sender == minter, "Only primary minter");
        secondaryMinter = _secondaryMinter;
    }
}
