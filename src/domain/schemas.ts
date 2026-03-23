import { z } from "zod";

export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export const hederaModeSchema = z.enum(["simulated", "real_scaffolded", "wallet_connected"]);
export const receiptEventTypeSchema = z.enum([
  "task_created",
  "task_assigned",
  "task_started",
  "task_completed",
  "task_failed",
  "task_approved",
  "token_analysis_generated",
  "defi_analysis_generated",
  "risk_review_completed",
  "risk_rejected",
  "allocation_finalized",
  "execution_simulated",
  "execution_scheduled",
  "execution_approved",
  "execution_cancelled",
  "execution_prepared",
  "reward_reserved",
  "reward_settled",
]);
export const receiptStatusSchema = z.enum(["recorded", "indexed", "failed"]);

export const ucpDataSchema = z.object({
  ucpVersion: z.literal("1.0"),
  intent: z.enum(["invoice", "payment", "split_distribution"]),
  senderId: z.string().optional(),
  recipientId: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: z.string(),
  memo: z.string().optional(),
  splitStrategy: z.array(z.object({
    recipientId: z.string(),
    amount: z.number().nonnegative(),
    role: z.string().optional(),
  })).optional()
});

export const assetTypeSchema = z.enum(["hbar", "stablecoin", "token", "lp", "yield_position"]);
export const positionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  assetType: assetTypeSchema,
  quantity: z.number().nonnegative(),
  priceUsd: z.number().nonnegative(),
  valueUsd: z.number().nonnegative(),
  hederaTokenId: z.string().optional(),
  source: z.string(),
});

export const portfolioSchema = z.object({
  positions: z.array(positionSchema),
  totalValueUsd: z.number().nonnegative(),
  liquidValueUsd: z.number().nonnegative(),
});

export const treasuryBudgetSchema = z.object({
  reserveBudgetUsd: z.number().nonnegative(),
  tradingBudgetUsd: z.number().nonnegative(),
  defiBudgetUsd: z.number().nonnegative(),
  rewardBudgetUsd: z.number().nonnegative(),
  executionBudgetUsd: z.number().nonnegative(),
});

export const treasurySchema = z.object({
  treasuryId: z.string(),
  accountId: z.string(),
  network: z.string(),
  mode: hederaModeSchema,
  portfolio: portfolioSchema,
  budgets: treasuryBudgetSchema,
  idleStablecoinUsd: z.number().nonnegative(),
  reserveCoveragePercent: z.number().nonnegative(),
});

export const strategyConfigSchema = z.object({
  reservePercent: z.number().min(0).max(100),
  tradingPercent: z.number().min(0).max(100),
  defiPercent: z.number().min(0).max(100),
  riskLevel: riskLevelSchema,
  maxTokenExposurePercent: z.number().min(0).max(100),
  maxProtocolExposurePercent: z.number().min(0).max(100),
  minLiquidityThresholdUsd: z.number().nonnegative(),
  maxSlippageBps: z.number().nonnegative(),
  targetYieldApy: z.number().nonnegative(),
  simulateOnly: z.boolean(),
  approvalRequired: z.boolean(),
});

const opportunityBaseSchema = z.object({
  id: z.string(),
  kind: z.enum(["token", "defi"]),
  title: z.string(),
  summary: z.string(),
  thesis: z.string(),
  confidence: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  liquidityUsd: z.number().nonnegative(),
  expectedUpsidePercent: z.number(),
  slippageBps: z.number().nonnegative(),
  rationaleBullets: z.array(z.string()).min(1),
});

export const tokenOpportunitySchema = opportunityBaseSchema.extend({
  kind: z.literal("token"),
  symbol: z.string(),
  hederaTokenId: z.string(),
  momentumScore: z.number().min(0).max(100),
  catalyst: z.string(),
  targetEntry: z.string(),
  stopLoss: z.string(),
});

export const defiOpportunitySchema = opportunityBaseSchema.extend({
  kind: z.literal("defi"),
  protocol: z.string(),
  asset: z.string(),
  projectedApy: z.number().nonnegative(),
  lockupDays: z.number().nonnegative(),
  protocolRisk: z.number().min(0).max(100),
  liquidityModel: z.string(),
});

export const opportunitySchema = z.discriminatedUnion("kind", [
  tokenOpportunitySchema,
  defiOpportunitySchema,
]);

export const plannedActionSchema = z.object({
  id: z.string(),
  actionType: z.enum(["buy_token", "allocate_defi", "hold_reserve", "pay_reward"]),
  title: z.string(),
  assetSymbol: z.string(),
  venue: z.string(),
  targetAllocationUsd: z.number().nonnegative(),
  targetAllocationPercent: z.number().nonnegative(),
  expectedReturnPercent: z.number(),
  riskLabel: riskLevelSchema,
  reason: z.string(),
  opportunityId: z.string().optional(),
  guardrails: z.array(z.string()),
  status: z.enum(["draft", "approved", "resized", "rejected", "simulated"]),
});

export const actionPlanSchema = z.object({
  reserveUsd: z.number().nonnegative(),
  tradingUsd: z.number().nonnegative(),
  defiUsd: z.number().nonnegative(),
  actions: z.array(plannedActionSchema),
  rejectedOpportunityIds: z.array(z.string()),
  expectedReturnLowPercent: z.number(),
  expectedReturnHighPercent: z.number(),
  approvalState: z.enum(["pending", "approved", "approved_with_changes", "rejected"]),
  notes: z.array(z.string()),
});

export const scheduledExecutionStatusSchema = z.enum([
  "draft",
  "simulated",
  "scheduled",
  "awaiting_approval",
  "approved",
  "executed",
  "cancelled",
  "failed",
]);

export const scheduledExecutionSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  actionTitle: z.string(),
  status: scheduledExecutionStatusSchema,
  approvalRequired: z.boolean(),
  scheduleId: z.string().optional(),
  transactionId: z.string().optional(),
  preview: z.string(),
  ucpInvoice: ucpDataSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
});

export const riskFindingSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string(),
  relatedActionId: z.string().optional(),
  opportunityId: z.string().optional(),
});

export const riskDecisionSchema = z.object({
  status: z.enum(["approved", "approved_with_changes", "rejected"]),
  findings: z.array(riskFindingSchema),
  rejectedOpportunityIds: z.array(z.string()),
  resizedActions: z.array(
    z.object({
      actionId: z.string(),
      originalAllocationUsd: z.number().nonnegative(),
      finalAllocationUsd: z.number().nonnegative(),
      reason: z.string(),
    }),
  ),
  approvedActions: z.array(plannedActionSchema),
});

export const executionStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  estimatedCostUsd: z.number().nonnegative(),
  requiresApproval: z.boolean(),
  status: z.enum(["queued", "prepared", "simulated"]),
});

export const executionPreviewSchema = z.object({
  mode: z.enum(["simulation", "prepared"]),
  steps: z.array(executionStepSchema),
  estimatedNetworkFeesUsd: z.number().nonnegative(),
  estimatedSlippageUsd: z.number().nonnegative(),
  settlementPath: z.string(),
});

export const simulationResultSchema = z.object({
  projectedMonthlyYieldUsd: z.number(),
  projectedMonthlyPnLRangeUsd: z.tuple([z.number(), z.number()]),
  stressScenarioDrawdownUsd: z.number(),
  liquidityCoveragePercent: z.number(),
  summary: z.string(),
});

export const agentTaskSchema = z.object({
  id: z.string(),
  agentName: z.string(),
  title: z.string(),
  status: z.enum(["created", "assigned", "completed", "failed", "approved"]),
  rewardUsd: z.number().nonnegative(),
  allowedTools: z.array(z.string()),
  promptPreview: z.string(),
});

export const agentResultSchema = z.object({
  taskId: z.string(),
  agentName: z.string(),
  status: z.enum(["completed", "failed"]),
  summary: z.string(),
  confidence: z.number().min(0).max(100),
  output: z.unknown(),
  toolTrace: z.array(z.string()),
  retries: z.number().nonnegative(),
});

export const receiptSchema = z.object({
  id: z.string(),
  eventType: receiptEventTypeSchema,
  timestamp: z.string(),
  accountId: z.string(),
  network: z.string(),
  settlementMode: hederaModeSchema,
  summary: z.string(),
  status: receiptStatusSchema,
  canonicalPayload: z.string(),
  canonicalHash: z.string(),
  taskId: z.string().optional(),
  linkedIds: z
    .object({
      taskId: z.string().optional(),
      agentName: z.string().optional(),
      allocationId: z.string().optional(),
      executionId: z.string().optional(),
      rewardId: z.string().optional(),
    })
    .optional(),
  payload: z.record(z.string(), z.unknown()),
  transactionId: z.string().optional(),
  topicId: z.string().optional(),
  explorerUrl: z.string().optional(),
});

export const payoutSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agentName: z.string(),
  rewardUsd: z.number().nonnegative(),
  rewardHbar: z.number().nonnegative(),
  status: z.enum(["reserved", "released", "settled"]),
  recipientAccountId: z.string(),
  settlementMode: hederaModeSchema,
  transactionId: z.string().optional(),
  ucpDistribution: ucpDataSchema.optional(),
});

export const rewardPolicySchema = z.object({
  rewardAssetSymbol: z.string(),
  rewardPoolAccountId: z.string(),
  feeRoutingAccountId: z.string().optional(),
  roleRewardsUsd: z.record(z.string(), z.number().nonnegative()),
});

export const rewardReservationSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agentName: z.string(),
  rewardUsd: z.number().nonnegative(),
  status: z.enum(["reserved", "released", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  linkedReceiptId: z.string().optional(),
});

export const auditRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(["receipt", "execution", "reward", "decision"]),
  summary: z.string(),
  status: z.string(),
  transactionId: z.string().optional(),
  topicId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const mirrorEventViewSchema = z.object({
  id: z.string(),
  source: z.enum(["mirror", "simulated_mirror"]),
  network: z.string(),
  record: auditRecordSchema,
});

export const auditQueryResultSchema = z.object({
  source: z.enum(["mirror", "simulated_mirror"]),
  records: z.array(mirrorEventViewSchema),
  cursor: z.string().optional(),
});

export const activityLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  stage: z.string(),
  message: z.string(),
  tone: z.enum(["system", "decision", "warning", "success"]),
});

export const toolInvocationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentName: z.string(),
  toolName: z.string(),
  timestamp: z.string(),
  durationMs: z.number().nonnegative(),
  status: z.enum(["ok", "error"]),
  inputSummary: z.string(),
  outputSummary: z.string(),
  error: z.string().optional(),
});

export const aiModelProviderSchema = z.enum(["gemini", "openai", "anthropic", "mock"]);

export const userAgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  provider: aiModelProviderSchema,
  model: z.string(),
  apiKey: z.string().optional(),
  rewardUsd: z.number().nonnegative(),
  allowedTools: z.array(z.string()),
  systemPrompt: z.string(),
});

export const workflowResultSchema = z.object({
  scenarioId: z.string(),
  goal: z.string(),
  sessionId: z.string(),
  treasury: treasurySchema,
  strategyConfig: strategyConfigSchema,
  tokenOpportunities: z.array(tokenOpportunitySchema),
  defiOpportunities: z.array(defiOpportunitySchema),
  actionPlan: actionPlanSchema,
  riskDecision: riskDecisionSchema,
  executionPreview: executionPreviewSchema,
  simulationResult: simulationResultSchema,
  scheduledExecutions: z.array(scheduledExecutionSchema),
  receipts: z.array(receiptSchema),
  rewardReservations: z.array(rewardReservationSchema),
  payouts: z.array(payoutSchema),
  auditTrail: z.array(mirrorEventViewSchema),
  tasks: z.array(agentTaskSchema),
  agentResults: z.array(agentResultSchema),
  toolInvocations: z.array(toolInvocationSchema),
  activityLog: z.array(activityLogEntrySchema),
  reporterNarrative: z.string(),
  userAgents: z.array(userAgentConfigSchema).optional(),
  openclawAlignment: z.object({
    pluginName: z.string(),
    runtimePattern: z.string(),
    extensionMode: z.string(),
    toolPolicy: z.string(),
  }),
  hederaStatus: z.object({
    mode: hederaModeSchema,
    settlementSummary: z.string(),
    receiptSummary: z.string(),
    coordinationSummary: z.string().optional(),
    scheduledSummary: z.string().optional(),
    liveCapabilities: z.array(z.string()),
    simulatedCapabilities: z.array(z.string()),
  }),
});

export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type HederaMode = z.infer<typeof hederaModeSchema>;
export type Position = z.infer<typeof positionSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type TreasuryBudget = z.infer<typeof treasuryBudgetSchema>;
export type Treasury = z.infer<typeof treasurySchema>;
export type StrategyConfig = z.infer<typeof strategyConfigSchema>;
export type TokenOpportunity = z.infer<typeof tokenOpportunitySchema>;
export type DefiOpportunity = z.infer<typeof defiOpportunitySchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type PlannedAction = z.infer<typeof plannedActionSchema>;
export type ActionPlan = z.infer<typeof actionPlanSchema>;
export type ScheduledExecutionStatus = z.infer<typeof scheduledExecutionStatusSchema>;
export type ScheduledExecution = z.infer<typeof scheduledExecutionSchema>;
export type RiskDecision = z.infer<typeof riskDecisionSchema>;
export type ExecutionPreview = z.infer<typeof executionPreviewSchema>;
export type SimulationResult = z.infer<typeof simulationResultSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type AgentResult = z.infer<typeof agentResultSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type Payout = z.infer<typeof payoutSchema>;
export type RewardPolicy = z.infer<typeof rewardPolicySchema>;
export type RewardReservation = z.infer<typeof rewardReservationSchema>;
export type AuditRecord = z.infer<typeof auditRecordSchema>;
export type MirrorEventView = z.infer<typeof mirrorEventViewSchema>;
export type AuditQueryResult = z.infer<typeof auditQueryResultSchema>;
export type ActivityLogEntry = z.infer<typeof activityLogEntrySchema>;
export type ToolInvocation = z.infer<typeof toolInvocationSchema>;
export type UserAgentConfig = z.infer<typeof userAgentConfigSchema>;
export type AiModelProvider = z.infer<typeof aiModelProviderSchema>;
export type WorkflowResult = z.infer<typeof workflowResultSchema>;
export type UcpData = z.infer<typeof ucpDataSchema>;
