// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SprawlDEX {
    using SafeERC20 for IERC20;

    struct Pool {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
        uint256 feeNumerator;
        uint256 feeDenominator;
        uint256 totalSwaps;
        uint256 totalLpShares;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(address => uint256)) public lpShares;

    event PoolCreated(bytes32 indexed poolId, address indexed tokenA, address indexed tokenB);
    event Swap(
        address indexed trader,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 priceAfter,
        uint256 fee
    );
    event LiquidityAdded(address indexed provider, bytes32 indexed poolId, uint256 amountA, uint256 amountB, uint256 shares);
    event LiquidityRemoved(address indexed provider, bytes32 indexed poolId, uint256 amountA, uint256 amountB, uint256 shares);

    function getPoolId(address tokenA, address tokenB) public pure returns (bytes32) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encodePacked(t0, t1));
    }

    function createPool(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 feeNum,
        uint256 feeDenom
    ) external returns (bytes32 poolId) {
        poolId = getPoolId(tokenA, tokenB);
        require(pools[poolId].tokenA == address(0), "Pool exists");
        require(amountA > 0 && amountB > 0, "Zero amounts");

        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        (uint256 a0, uint256 a1) = tokenA < tokenB ? (amountA, amountB) : (amountB, amountA);

        IERC20(t0).safeTransferFrom(msg.sender, address(this), a0);
        IERC20(t1).safeTransferFrom(msg.sender, address(this), a1);

        pools[poolId] = Pool(t0, t1, a0, a1, feeNum, feeDenom, 0, 1000);
        lpShares[poolId][msg.sender] = 1000;

        emit PoolCreated(poolId, t0, t1);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external returns (uint256 amountOut) {
        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        require(pool.tokenA != address(0), "Pool not found");

        uint256 fee = (amountIn * pool.feeNumerator) / pool.feeDenominator;
        uint256 amountInAfterFee = amountIn - fee;

        uint256 reserveIn = tokenIn == pool.tokenA ? pool.reserveA : pool.reserveB;
        uint256 reserveOut = tokenIn == pool.tokenA ? pool.reserveB : pool.reserveA;

        amountOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
        require(amountOut >= amountOutMin, "Slippage exceeded");
        require(amountOut < reserveOut, "Insufficient liquidity");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        if (tokenIn == pool.tokenA) {
            pool.reserveA += amountIn;
            pool.reserveB -= amountOut;
        } else {
            pool.reserveB += amountIn;
            pool.reserveA -= amountOut;
        }
        pool.totalSwaps++;

        uint256 priceAfter = (pool.reserveB * 1e18) / pool.reserveA;
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, priceAfter, fee);
    }

    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.tokenA != address(0), "Pool not found");

        (uint256 a0, uint256 a1) = tokenA == pool.tokenA ? (amountA, amountB) : (amountB, amountA);

        uint256 shares = (a0 * pool.totalLpShares) / pool.reserveA;

        IERC20(pool.tokenA).safeTransferFrom(msg.sender, address(this), a0);
        IERC20(pool.tokenB).safeTransferFrom(msg.sender, address(this), a1);

        pool.reserveA += a0;
        pool.reserveB += a1;
        pool.totalLpShares += shares;
        lpShares[poolId][msg.sender] += shares;

        emit LiquidityAdded(msg.sender, poolId, a0, a1, shares);
    }

    function removeLiquidity(address tokenA, address tokenB, uint256 shares) external {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(lpShares[poolId][msg.sender] >= shares, "Insufficient shares");

        uint256 amountA = (shares * pool.reserveA) / pool.totalLpShares;
        uint256 amountB = (shares * pool.reserveB) / pool.totalLpShares;

        pool.reserveA -= amountA;
        pool.reserveB -= amountB;
        pool.totalLpShares -= shares;
        lpShares[poolId][msg.sender] -= shares;

        IERC20(pool.tokenA).safeTransfer(msg.sender, amountA);
        IERC20(pool.tokenB).safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, poolId, amountA, amountB, shares);
    }

    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        uint256 fee = (amountIn * pool.feeNumerator) / pool.feeDenominator;
        uint256 afterFee = amountIn - fee;
        uint256 reserveIn = tokenIn == pool.tokenA ? pool.reserveA : pool.reserveB;
        uint256 reserveOut = tokenIn == pool.tokenA ? pool.reserveB : pool.reserveA;
        return (afterFee * reserveOut) / (reserveIn + afterFee);
    }

    function getPrice(address tokenA, address tokenB) external view returns (uint256) {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.tokenA != address(0), "Pool not found");
        (uint256 rA, uint256 rB) = tokenA == pool.tokenA
            ? (pool.reserveA, pool.reserveB)
            : (pool.reserveB, pool.reserveA);
        return (rB * 1e18) / rA;
    }

    function getPoolInfo(bytes32 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }
}
