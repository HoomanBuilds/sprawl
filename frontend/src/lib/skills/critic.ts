import type { AgentDecision, ExecutionResult } from '@/types/engine';

export interface CriticVerdict {
  success: boolean;
  critique: string;
}

export function evaluateTrade(
  decision: AgentDecision,
  result: ExecutionResult,
): CriticVerdict {
  if (!result.success) {
    return {
      success: false,
      critique: `Trade failed: ${result.error ?? 'execution error'}`,
    };
  }

  const executedAsIntended = result.txHash.length > 0 && result.amountOut !== '0';

  if (!executedAsIntended) {
    return {
      success: false,
      critique: 'Trade did not execute as intended — missing txHash or zero output',
    };
  }

  if (decision.action === 'hold') {
    return { success: true, critique: 'Hold decision — no trade to evaluate' };
  }

  const profitable = result.realizedPnl > 0;

  if (!profitable) {
    return {
      success: false,
      critique: `Negative P&L: $${result.realizedPnl.toFixed(2)}. Strategy "${decision.rationale}" did not produce profit.`,
    };
  }

  return {
    success: true,
    critique: `Profitable trade: $${result.realizedPnl.toFixed(2)} P&L. Strategy "${decision.rationale}" executed successfully.`,
  };
}
