import type { DeepSeekTool } from '../deepseek';

export const DEFI_TOOL_SCHEMAS: DeepSeekTool[] = [
    {
        type: 'function',
        function: {
            name: 'swap',
            description: 'Swap one token for another on SprawlDEX. Use this when you want to buy or sell a token.',
            parameters: {
                type: 'object',
                properties: {
                    tokenIn: {
                        type: 'string',
                        description: 'Token to sell (sETH, sBTC, sUSDC, sPOL, sSOL, SPRAWL)',
                    },
                    tokenOut: {
                        type: 'string',
                        description: 'Token to buy (sETH, sBTC, sUSDC, sPOL, sSOL, SPRAWL)',
                    },
                    amountIn: {
                        type: 'string',
                        description: 'Amount of tokenIn to sell (in human-readable units, e.g. "0.5" for 0.5 sETH)',
                    },
                    maxSlippageBps: {
                        type: 'number',
                        description: 'Maximum slippage in basis points (e.g., 100 = 1%)',
                    },
                },
                required: ['tokenIn', 'tokenOut', 'amountIn'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'provideLiquidity',
            description: 'Add liquidity to a SprawlDEX pool to earn trading fees.',
            parameters: {
                type: 'object',
                properties: {
                    tokenA: { type: 'string', description: 'First token of the pair' },
                    tokenB: { type: 'string', description: 'Second token of the pair' },
                    amountA: { type: 'string', description: 'Amount of tokenA to provide' },
                    amountB: { type: 'string', description: 'Amount of tokenB to provide' },
                },
                required: ['tokenA', 'tokenB', 'amountA', 'amountB'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'removeLiquidity',
            description: 'Remove liquidity from a SprawlDEX pool.',
            parameters: {
                type: 'object',
                properties: {
                    tokenA: { type: 'string', description: 'First token of the pair' },
                    tokenB: { type: 'string', description: 'Second token of the pair' },
                    shares: { type: 'string', description: 'Number of LP shares to remove' },
                },
                required: ['tokenA', 'tokenB', 'shares'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'hold',
            description: 'Do nothing this tick. Use when market conditions are unclear or no good opportunities exist.',
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: 'Brief reason for holding' },
                },
                required: ['reason'],
            },
        },
    },
];
