import { formatNumber, formatPercent, formatUsdCompact } from "../../core/models/formatters";
import type {
  AgentResult,
  AgentTask,
  PlannedAction,
  Receipt,
  ScheduledExecution,
  WorkflowResult,
} from "../../core/models/schemas";
import type { SessionListEntry, WorkflowStrategyConfig } from "../../state/useClawfiWorkflow";
import type { AuditActionItem, Message, RiskPolicy, SessionSummary, TreasurySummary, WorkforceStatus } from "../types";

export function buildRiskPolicy(
  strategyConfig: WorkflowStrategyConfig,
  data: WorkflowResult | null,
): RiskPolicy {
  const hbarPrice =
    data?.treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ?? 0.11;
  const totalValue = data?.treasury.portfolio.totalValueUsd ?? 0;
  const maxAmountHbar =
    totalValue > 0 && hbarPrice > 0
      ? Math.max(1, Math.round(((strategyConfig.maxTokenExposurePercent / 100) * totalValue) / hbarPrice))
      : 50_000;
  const allowedProtocols = Array.from(
    new Set(
      [
        ...(data?.defiOpportunities.map((entry) => entry.protocol) ?? []),
        ...(data?.actionPlan.actions.map((entry) => entry.venue) ?? []),
      ].filter(Boolean),
    ),
  ).slice(0, 6);

  return {
    maxAmount: String(maxAmountHbar),
    requireAudit: true,
    minTvl: String(strategyConfig.minLiquidityThresholdUsd),
    maxRiskScore: riskLevelLabel(strategyConfig.riskLevel),
    allowedProtocols: allowedProtocols.length > 0 ? allowedProtocols : ["Stader Labs", "SaucerSwap", "Bonzo Finance"],
  };
}

export function applyRiskPolicy(
  policy: RiskPolicy,
  input: {
    data: WorkflowResult | null;
    strategyConfig: WorkflowStrategyConfig;
  },
) {
  const hbarPrice =
    input.data?.treasury.portfolio.positions.find((position) => position.symbol === "HBAR")?.priceUsd ?? 0.11;
  const totalValue = input.data?.treasury.portfolio.totalValueUsd ?? 0;
  const maxAmount = parseNumber(policy.maxAmount);
  const maxExposureUsd = maxAmount * hbarPrice;
  const maxExposurePercent =
    totalValue > 0
      ? Math.min(100, Math.max(0, Number(((maxExposureUsd / totalValue) * 100).toFixed(1))))
      : input.strategyConfig.maxTokenExposurePercent;

  return {
    strategyConfig: {
      riskLevel: riskLevelValue(policy.maxRiskScore),
      minLiquidityThresholdUsd: parseNumber(policy.minTvl),
      maxTokenExposurePercent: maxExposurePercent,
    } satisfies Partial<WorkflowStrategyConfig>,
  };
}

export function decorateGoalWithPolicy(goal: string, policy: RiskPolicy) {
  const lines = [
    `Max single execution size: ${policy.maxAmount} HBAR.`,
    `Minimum protocol TVL: $${formatNumber(parseNumber(policy.minTvl), 0)}.`,
    `Maximum risk score: ${policy.maxRiskScore}.`,
    policy.requireAudit ? "Only use audited protocols." : "Audit is preferred but not mandatory.",
  ];

  if (policy.allowedProtocols.length > 0) {
    lines.push(`Prefer these protocols when possible: ${policy.allowedProtocols.join(", ")}.`);
  }

  return `Treasury policy:\n- ${lines.join("\n- ")}\n\nGoal:\n${goal}`;
}

export function buildMessages(data: WorkflowResult | null, notice?: string | null): Message[] {
  const messages: Message[] = [];
  if (!data) {
    if (notice) {
      messages.push({
        id: "system-notice",
        role: "system",
        content: notice,
        timestamp: new Date(),
      });
    }
    return messages;
  }

  messages.push({
    id: `${data.sessionId}-goal`,
    role: "user",
    content: extractDisplayGoal(data.goal),
    timestamp: resolveTimestamp(data),
  });

  const taskByName = new Map(data.tasks.map((task) => [task.agentName, task]));
  const resultByTaskId = new Map(data.agentResults.map((result) => [result.taskId, result]));

  pushAgentMessage(messages, data, taskByName, resultByTaskId, "orchestrator", "Coordinator", data.reporterNarrative);
  pushAgentMessage(
    messages,
    data,
    taskByName,
    resultByTaskId,
    "researcher",
    "Token Research",
    summarizeOpportunities(data.tokenOpportunities.map((entry) => entry.title), "token"),
  );
  pushAgentMessage(
    messages,
    data,
    taskByName,
    resultByTaskId,
    "researcher",
    "DeFi Strategy",
    summarizeOpportunities(data.defiOpportunities.map((entry) => entry.title), "DeFi"),
  );

  const riskTask = taskByName.get("Risk");
  const riskResult = riskTask ? resultByTaskId.get(riskTask.id) : undefined;
  messages.push({
    id: `${data.sessionId}-risk`,
    role: "risk",
    content: riskResult?.summary || buildRiskFallback(data),
    timestamp: resolveTimestamp(data),
  });

  const executionTask = taskByName.get("Execution");
  const executionResult = executionTask ? resultByTaskId.get(executionTask.id) : undefined;
  messages.push({
    id: `${data.sessionId}-execution-summary`,
    role: "executor",
    content: executionResult?.summary || data.hederaStatus.settlementSummary,
    timestamp: resolveTimestamp(data),
  });

  for (const scheduled of data.scheduledExecutions) {
    const action = data.actionPlan.actions.find((entry) => entry.id === scheduled.actionId);
    messages.push({
      id: `${data.sessionId}-${scheduled.id}`,
      role: "executor",
      content: `${scheduled.actionTitle}\n\n${scheduled.preview}`,
      timestamp: new Date(scheduled.updatedAt || scheduled.createdAt || resolveTimestamp(data)),
      actionPreview: buildActionPreview(action, scheduled, data.actionPlan.approvalState),
    });

    const receipt = buildReceiptForScheduled(scheduled, data.receipts);
    if (receipt) {
      messages.push({
        id: `${data.sessionId}-${scheduled.id}-receipt`,
        role: "executor",
        content: "Transaction executed successfully and verified on-chain.",
        timestamp: new Date(scheduled.updatedAt || scheduled.createdAt || resolveTimestamp(data)),
        receipt,
      });
    }
  }

  if (notice) {
    messages.push({
      id: `${data.sessionId}-notice`,
      role: "system",
      content: notice,
      timestamp: new Date(),
    });
  }

  return messages.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
}

export function buildWorkforce(data: WorkflowResult | null): WorkforceStatus[] {
  if (!data) {
    return [];
  }

  const resultByTask = new Map(data.agentResults.map((result) => [result.taskId, result]));

  return data.tasks.map((task) => {
    const result = resultByTask.get(task.id);
    return {
      id: task.id,
      name: task.agentName,
      role: mapAgentRole(task.agentName),
      status: mapTaskStatus(task, result),
      detail: result?.summary || task.title,
    };
  });
}

export function buildTreasurySummary(
  data: WorkflowResult | null,
  wallet: {
    accountId: string | null;
    isAvailable: boolean;
  },
): TreasurySummary {
  if (!data) {
    return {
      networkLabel: "No active session",
      balanceLabel: "Connect API to load treasury",
      riskLabel: "Unknown",
      walletLabel: wallet.isAvailable ? "Wallet available" : "Wallet unavailable",
    };
  }

  const hbarPosition = data.treasury.portfolio.positions.find((position) => position.symbol === "HBAR");
  const balanceLabel = hbarPosition
    ? `${formatNumber(hbarPosition.quantity, 0)} HBAR`
    : formatUsdCompact(data.treasury.portfolio.liquidValueUsd);

  return {
    networkLabel: capitalize(data.treasury.network),
    balanceLabel,
    riskLabel: riskLevelLabel(data.strategyConfig.riskLevel),
    walletLabel: wallet.accountId ? wallet.accountId : wallet.isAvailable ? "Wallet available" : "Wallet unavailable",
  };
}

export function buildSessionSummaries(
  sessions: SessionListEntry[],
  selectedSessionId: string | null,
): SessionSummary[] {
  return sessions.slice(0, 6).map((session) => ({
    id: session.sessionId,
    title: extractDisplayGoal(session.goal),
    detail: `${session.mode} · ${session.receiptCount} receipts`,
    active: session.sessionId === selectedSessionId,
  }));
}

export function buildAuditActions(data: WorkflowResult | null): AuditActionItem[] {
  if (!data) {
    return [];
  }

  return data.actionPlan.actions.map((action) => {
    const scheduled = data.scheduledExecutions.find((entry) => entry.actionId === action.id);
    return {
      id: action.id,
      type: action.title,
      protocol: action.venue,
      amount: formatUsdCompact(action.targetAllocationUsd),
      expectedYield: formatPercent(action.expectedReturnPercent),
      riskScore: riskLabelFromValue(action.riskLabel),
      status: resolveActionStatus(data.actionPlan.approvalState, scheduled?.status),
      receipt: scheduled ? buildReceiptForScheduled(scheduled, data.receipts) ?? undefined : undefined,
    };
  });
}

function pushAgentMessage(
  messages: Message[],
  data: WorkflowResult,
  taskByName: Map<string, AgentTask>,
  resultByTaskId: Map<string, AgentResult>,
  role: Message["role"],
  agentName: string,
  fallbackContent: string,
) {
  const task = taskByName.get(agentName);
  const result = task ? resultByTaskId.get(task.id) : undefined;
  const content = result?.summary || fallbackContent;
  if (!content) {
    return;
  }

  messages.push({
    id: `${data.sessionId}-${agentName.toLowerCase().replaceAll(" ", "-")}`,
    role,
    content,
    timestamp: resolveTimestamp(data),
  });
}

function buildActionPreview(
  action: PlannedAction | undefined,
  scheduled: ScheduledExecution,
  approvalState: WorkflowResult["actionPlan"]["approvalState"],
) {
  return {
    id: scheduled.actionId,
    type: action?.title ?? scheduled.actionTitle,
    protocol: action?.venue ?? scheduled.actionTitle,
    amount: action ? formatUsdCompact(action.targetAllocationUsd) : scheduled.preview,
    expectedYield: action ? formatPercent(action.expectedReturnPercent) : undefined,
    riskScore: riskLabelFromValue(action?.riskLabel ?? "medium"),
    status: resolveActionStatus(approvalState, scheduled.status),
  } as const;
}

function buildReceiptForScheduled(scheduled: ScheduledExecution, receipts: Receipt[]) {
  const receipt =
    receipts.find((entry) => entry.linkedIds?.executionId === scheduled.id && entry.transactionId) ??
    receipts.find(
      (entry) =>
        typeof entry.payload.transactionId === "string" &&
        entry.payload.transactionId === scheduled.transactionId,
    ) ??
    receipts.find((entry) => entry.transactionId === scheduled.transactionId && entry.transactionId);

  const payloadTransactionId =
    receipt && typeof receipt.payload.transactionId === "string" ? receipt.payload.transactionId : undefined;
  const payloadExplorerUrl =
    receipt && typeof receipt.payload.explorerUrl === "string" ? receipt.payload.explorerUrl : undefined;
  const txHash = scheduled.transactionId ?? payloadTransactionId ?? receipt?.transactionId;
  if (!txHash) {
    return null;
  }

  return {
    actionId: scheduled.actionId,
    txHash,
    network: capitalize(receipt?.network ?? "testnet"),
    gasUsed:
      receipt && (typeof receipt.payload.gasUsed === "number" || typeof receipt.payload.gasUsed === "string")
        ? String(receipt.payload.gasUsed)
        : "n/a",
    timestamp: formatTimestamp(receipt?.timestamp ?? scheduled.updatedAt ?? scheduled.createdAt),
    explorerUrl: payloadExplorerUrl ?? deriveExecutionExplorerUrl(receipt?.network, txHash),
  };
}

function resolveActionStatus(
  approvalState: WorkflowResult["actionPlan"]["approvalState"],
  scheduledStatus?: ScheduledExecution["status"],
) {
  if (scheduledStatus === "executed") return "executed";
  if (scheduledStatus === "cancelled" || scheduledStatus === "failed" || approvalState === "rejected") return "rejected";
  if (scheduledStatus === "approved" || approvalState === "approved" || approvalState === "approved_with_changes") {
    return "approved";
  }
  return "pending";
}

function mapAgentRole(agentName: string): WorkforceStatus["role"] {
  if (agentName === "Risk") return "risk";
  if (agentName === "Execution") return "executor";
  if (agentName === "Token Research" || agentName === "DeFi Strategy") return "researcher";
  return "orchestrator";
}

function mapTaskStatus(task: AgentTask, result?: AgentResult): WorkforceStatus["status"] {
  if (task.status === "failed" || result?.status === "failed") return "offline";
  if (task.status === "assigned") return "warning";
  if (task.status === "completed" || task.status === "approved" || result?.status === "completed") return "online";
  return "idle";
}

function buildRiskFallback(data: WorkflowResult) {
  if (data.riskDecision.findings.length === 0) {
    return `Risk review passed. ${data.actionPlan.actions.length} actions remain within ${riskLevelLabel(data.strategyConfig.riskLevel)} policy limits.`;
  }
  return data.riskDecision.findings.map((finding) => `- ${finding.message}`).join("\n");
}

function summarizeOpportunities(opportunities: string[], label: string) {
  if (opportunities.length === 0) {
    return `No ${label} opportunities passed the current policy screen.`;
  }
  return `Top ${label} opportunities: ${opportunities.slice(0, 3).join(", ")}.`;
}

function resolveTimestamp(data: WorkflowResult) {
  const candidate =
    data.activityLog[0]?.timestamp ??
    data.scheduledExecutions[0]?.createdAt ??
    data.receipts[0]?.timestamp ??
    new Date().toISOString();
  return new Date(candidate);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function riskLevelLabel(value: "low" | "medium" | "high") {
  if (value === "low") return "Low";
  if (value === "medium") return "Moderate";
  return "High";
}

function riskLevelValue(value: RiskPolicy["maxRiskScore"]) {
  if (value === "Low") return "low" as const;
  if (value === "Moderate") return "medium" as const;
  return "high" as const;
}

function riskLabelFromValue(value: "low" | "medium" | "high") {
  if (value === "low") return "Low";
  if (value === "high") return "High";
  return "Medium";
}

function parseNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function deriveExecutionExplorerUrl(network: string | undefined, transactionId: string) {
  if (!transactionId.includes("@")) {
    return undefined;
  }
  const segment = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${segment}/transaction/${transactionId}`;
}

function extractDisplayGoal(goal: string) {
  const marker = "\n\nGoal:\n";
  if (goal.startsWith("Treasury policy:\n- ") && goal.includes(marker)) {
    return goal.slice(goal.indexOf(marker) + marker.length);
  }
  return goal;
}
