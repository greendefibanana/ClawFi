import { buildExecutionPreviewTool, simulateDefiActionTool, simulateTradeActionTool } from "./executionTools";
import {
  createScheduledExecutionTool,
  createReceiptTool,
  getAuditTrailTool,
  getMirrorReceiptHistoryTool,
  getTreasuryAccountStateTool,
  getScheduledExecutionStatusTool,
  logExecutionEventTool,
  publishCoordinationReceiptTool,
  reserveAgentRewardTool,
  recordDecisionReceiptTool,
  recordTaskReceiptTool,
  settleAgentRewardTool,
  checkAgentStakeTool,
  slashAgentStakeTool,
} from "./hederaTools";
import { compareDefiStrategiesTool, estimateYieldOutcomesTool, getProtocolRiskSummaryTool, scanDefiOpportunitiesTool } from "./defiTools";
import { getTokenLiquidityProfileTool, getTokenMarketDataTool, scanTokenOpportunitiesTool, buildTokenThesisTool } from "./tokenTools";
import { buildAllocationPlanTool, getPortfolioStateTool, getTreasuryBalancesTool, reserveBudgetTool } from "./treasuryTools";
import { ClawfiToolRegistry } from "./registry";
import type { ClawfiTool, ToolDependencies } from "./types";

export function createClawfiToolRegistry(deps: ToolDependencies) {
  const registry = new ClawfiToolRegistry(deps);
  const tools: Array<ClawfiTool<unknown, unknown>> = [
    getTokenMarketDataTool,
    scanTokenOpportunitiesTool,
    getTokenLiquidityProfileTool,
    buildTokenThesisTool,
    scanDefiOpportunitiesTool,
    compareDefiStrategiesTool,
    getProtocolRiskSummaryTool,
    estimateYieldOutcomesTool,
    getTreasuryBalancesTool,
    getPortfolioStateTool,
    buildAllocationPlanTool,
    reserveBudgetTool,
    createReceiptTool,
    publishCoordinationReceiptTool,
    recordTaskReceiptTool,
    recordDecisionReceiptTool,
    createScheduledExecutionTool,
    getScheduledExecutionStatusTool,
    reserveAgentRewardTool,
    settleAgentRewardTool,
    checkAgentStakeTool,
    slashAgentStakeTool,
    getTreasuryAccountStateTool,
    logExecutionEventTool,
    getAuditTrailTool,
    getMirrorReceiptHistoryTool,
    simulateTradeActionTool,
    simulateDefiActionTool,
    buildExecutionPreviewTool,
  ];

  tools.forEach((tool) => registry.register(tool));

  return registry;
}
