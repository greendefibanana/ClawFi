import type { ClawfiTool, DefiSimulation, TradeSimulation } from "./types";

export const simulateTradeActionTool: ClawfiTool<
  { actionId: string; amountUsd: number; expectedReturnPercent: number },
  TradeSimulation
> = {
  name: "simulateTradeAction",
  description: "Produces a deterministic trade simulation estimate for a token action.",
  execute({ input }) {
    return Promise.resolve({
      actionId: input.actionId,
      estimatedSlippageUsd: input.amountUsd * 0.0018,
      expectedReturnPercent: input.expectedReturnPercent,
    });
  },
};

export const simulateDefiActionTool: ClawfiTool<
  { actionId: string; amountUsd: number; expectedReturnPercent: number },
  DefiSimulation
> = {
  name: "simulateDefiAction",
  description: "Produces a deterministic DeFi yield simulation estimate for an allocation action.",
  execute({ input }) {
    return Promise.resolve({
      actionId: input.actionId,
      projectedApy: input.expectedReturnPercent,
      projectedMonthlyYieldUsd: (input.amountUsd * input.expectedReturnPercent) / 1200,
    });
  },
};

export const buildExecutionPreviewTool: ClawfiTool<
  {
    actions: Array<{
      title: string;
      amountUsd: number;
      venue: string;
      requiresApproval: boolean;
      actionType: string;
      assetSymbol: string;
    }>;
  },
  import("../domain/schemas").ExecutionPreview
> = {
  name: "buildExecutionPreview",
  description: "Builds an execution preview from draft actions and active policy settings.",
  async execute({ input, context, deps }) {
    return deps.executionProvider.preview({
      actions: input.actions,
      config: context.strategyConfig,
      treasury: context.treasury,
    });
  },
};
