import type { Position } from "../core/models/schemas";
import { buildDefiActions } from "../engines/defiStrategyEngine";
import { buildTokenTradingActions } from "../engines/tokenTradingEngine";
import type { ClawfiTool, AllocationPlanBuildResult, BudgetReservation, PortfolioState } from "./types";

export const getTreasuryBalancesTool: ClawfiTool<Record<string, never>, { balances: Position[] }> =
  {
    name: "getTreasuryBalances",
    description: "Reads treasury balances through the active Hedera adapter.",
    async execute({ deps }) {
      const balances = await deps.hederaAdapter.readBalances();
      return { balances };
    },
  };

export const getPortfolioStateTool: ClawfiTool<Record<string, never>, PortfolioState> = {
  name: "getPortfolioState",
  description: "Returns normalized treasury portfolio state.",
  execute({ context }) {
    return Promise.resolve({
      totalValueUsd: context.treasury.portfolio.totalValueUsd,
      liquidValueUsd: context.treasury.portfolio.liquidValueUsd,
      reserveCoveragePercent: context.treasury.reserveCoveragePercent,
    });
  },
};

export const reserveBudgetTool: ClawfiTool<Record<string, never>, BudgetReservation> = {
  name: "reserveBudget",
  description: "Reserves budget sleeves based on active strategy config.",
  execute({ context }) {
    return Promise.resolve({
      reserveUsd: context.treasury.budgets.reserveBudgetUsd,
      tradingUsd: context.treasury.budgets.tradingBudgetUsd,
      defiUsd: context.treasury.budgets.defiBudgetUsd,
    });
  },
};

export const buildAllocationPlanTool: ClawfiTool<
  { tokenOpportunityIds: string[]; defiOpportunityIds: string[] },
  AllocationPlanBuildResult
> = {
  name: "buildAllocationPlan",
  description: "Builds draft token and DeFi allocation actions before risk enforcement.",
  async execute({ input, context, deps }) {
    const tokenOpps = await deps.tokenProvider.listOpportunities();
    const defiOpps = await deps.defiProvider.listOpportunities();
    const tokenActions = buildTokenTradingActions({
      treasury: context.treasury,
      config: context.strategyConfig,
      opportunities: tokenOpps.filter((item) => input.tokenOpportunityIds.includes(item.id)),
    }).actions;
    const defiActions = buildDefiActions({
      treasury: context.treasury,
      config: context.strategyConfig,
      opportunities: defiOpps.filter((item) => input.defiOpportunityIds.includes(item.id)),
    }).actions;
    const actions = [...tokenActions, ...defiActions];
    return {
      actions,
      totalAllocationUsd: actions.reduce((sum, action) => sum + action.targetAllocationUsd, 0),
    };
  },
};
