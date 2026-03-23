import type { StrategyConfig, Treasury } from "../core/models/schemas";
import type {
  DefiOpportunityProvider,
  ExecutionSimulatorProvider,
  TokenMarketProvider,
  WalletProvider,
} from "../providers/interfaces";
import type { HederaTreasuryAdapter } from "../hedera/treasuryAdapter";
import type {
  AuditQueryResult,
  DefiOpportunity,
  MirrorEventView,
  PlannedAction,
  Receipt,
  RewardReservation,
  ScheduledExecution,
  TokenOpportunity,
} from "../core/models/schemas";
import type { HederaCore } from "../hedera/adapters/createHederaCore";

export type ClawfiToolName =
  | "getTokenMarketData"
  | "scanTokenOpportunities"
  | "getTokenLiquidityProfile"
  | "buildTokenThesis"
  | "scanDefiOpportunities"
  | "compareDefiStrategies"
  | "getProtocolRiskSummary"
  | "estimateYieldOutcomes"
  | "getTreasuryBalances"
  | "getPortfolioState"
  | "buildAllocationPlan"
  | "reserveBudget"
  | "createReceipt"
  | "publishCoordinationReceipt"
  | "recordTaskReceipt"
  | "recordDecisionReceipt"
  | "createScheduledExecution"
  | "getScheduledExecutionStatus"
  | "reserveAgentReward"
  | "settleAgentReward"
  | "getTreasuryAccountState"
  | "logExecutionEvent"
  | "getAuditTrail"
  | "getMirrorReceiptHistory"
  | "simulateTradeAction"
  | "simulateDefiAction"
  | "buildExecutionPreview"
  | "checkAgentStake"
  | "slashAgentStake";

export type ToolCallContext = {
  sessionId: string;
  agentName: string;
  treasury: Treasury;
  strategyConfig: StrategyConfig;
};

export type ToolDependencies = {
  walletProvider: WalletProvider;
  tokenProvider: TokenMarketProvider;
  defiProvider: DefiOpportunityProvider;
  executionProvider: ExecutionSimulatorProvider;
  hederaAdapter: HederaTreasuryAdapter;
  hederaCore: HederaCore;
};

export type ClawfiTool<Input, Output> = {
  name: ClawfiToolName;
  description: string;
  optional?: boolean;
  execute(
    args: {
      input: Input;
      context: ToolCallContext;
      deps: ToolDependencies;
    },
  ): Promise<Output>;
};

export type ToolInvocation = {
  id: string;
  sessionId: string;
  agentName: string;
  toolName: ClawfiToolName;
  timestamp: string;
  durationMs: number;
  status: "ok" | "error";
  inputSummary: string;
  outputSummary: string;
  error?: string;
};

export type TokenMarketData = {
  opportunities: TokenOpportunity[];
  totalTrackedLiquidityUsd: number;
};

export type TokenLiquidityProfile = {
  opportunityId: string;
  liquidityUsd: number;
  slippageBps: number;
  assessment: "deep" | "moderate" | "thin";
};

export type TokenThesis = {
  opportunityId: string;
  thesis: string;
  riskNotes: string[];
  suggestedSizingPercent: number;
};

export type DefiComparison = {
  ranked: DefiOpportunity[];
  reasoning: string[];
};

export type ProtocolRiskSummary = {
  opportunityId: string;
  protocol: string;
  riskScore: number;
  notes: string[];
};

export type YieldEstimate = {
  opportunityId: string;
  projectedApy: number;
  projectedMonthlyYieldUsd: number;
};

export type PortfolioState = {
  totalValueUsd: number;
  liquidValueUsd: number;
  reserveCoveragePercent: number;
};

export type BudgetReservation = {
  reserveUsd: number;
  tradingUsd: number;
  defiUsd: number;
};

export type AllocationPlanBuildResult = {
  actions: PlannedAction[];
  totalAllocationUsd: number;
};

export type ReceiptResult = {
  receipt: Receipt;
};

export type ScheduledExecutionResult = {
  scheduledExecution: ScheduledExecution;
};

export type RewardReservationResult = {
  reservation: RewardReservation;
};

export type AuditTrailResult = {
  auditTrail: MirrorEventView[];
};

export type MirrorReceiptHistoryResult = {
  history: AuditQueryResult;
};

export type TradeSimulation = {
  actionId: string;
  estimatedSlippageUsd: number;
  expectedReturnPercent: number;
};

export type DefiSimulation = {
  actionId: string;
  projectedApy: number;
  projectedMonthlyYieldUsd: number;
};
