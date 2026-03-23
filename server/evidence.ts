import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { WorkflowResult } from "../src/core/models/schemas";

export type SessionEvidence = {
  generatedAt: string;
  sessionId: string;
  scenarioId: string;
  goal: string;
  mode: string;
  network: string;
  treasuryAccountId: string;
  summary: {
    receiptCount: number;
    payoutCount: number;
    taskCount: number;
    approvedActionCount: number;
  };
  receipts: Array<{
    id: string;
    eventType: string;
    transactionId: string | null;
    topicId: string | null;
    explorerUrl: string | null;
  }>;
  payouts: Array<{
    id: string;
    taskId: string;
    agentName: string;
    rewardUsd: number;
    rewardHbar: number;
    recipientAccountId: string;
    transactionId: string | null;
    explorerUrl: string | null;
    ucpDistribution: WorkflowResult["payouts"][number]["ucpDistribution"] | null;
  }>;
  scheduledExecutions: Array<{
    id: string;
    actionId: string;
    actionTitle: string;
    status: WorkflowResult["scheduledExecutions"][number]["status"];
    scheduleId: string | null;
    transactionId: string | null;
    ucpInvoice: WorkflowResult["scheduledExecutions"][number]["ucpInvoice"] | null;
  }>;
  signoffChecklist: Array<{
    item: string;
    status: "pass" | "pending";
    notes: string;
  }>;
};

export function buildSessionEvidence(session: WorkflowResult): SessionEvidence {
  const receipts = session.receipts.map((receipt) => ({
    id: receipt.id,
    eventType: receipt.eventType,
    transactionId: receipt.transactionId ?? null,
    topicId: receipt.topicId ?? null,
    explorerUrl:
      receipt.explorerUrl ??
      (receipt.transactionId ? maybeHashscanTxUrl(session.treasury.network, receipt.transactionId) : null),
  }));

  const payouts = session.payouts.map((payout) => ({
    id: payout.id,
      taskId: payout.taskId,
      agentName: payout.agentName,
      rewardUsd: payout.rewardUsd,
      rewardHbar: payout.rewardHbar,
      recipientAccountId: payout.recipientAccountId,
      transactionId: payout.transactionId ?? null,
      explorerUrl: payout.transactionId ? maybeHashscanTxUrl(session.treasury.network, payout.transactionId) : null,
      ucpDistribution: payout.ucpDistribution ?? null,
    }));
  const scheduledExecutions = session.scheduledExecutions.map((scheduledExecution) => ({
    id: scheduledExecution.id,
    actionId: scheduledExecution.actionId,
    actionTitle: scheduledExecution.actionTitle,
    status: scheduledExecution.status,
    scheduleId: scheduledExecution.scheduleId ?? null,
    transactionId: scheduledExecution.transactionId ?? null,
    ucpInvoice: scheduledExecution.ucpInvoice ?? null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    goal: session.goal,
    mode: session.hederaStatus.mode,
    network: session.treasury.network,
    treasuryAccountId: session.treasury.accountId,
    summary: {
      receiptCount: session.receipts.length,
      payoutCount: session.payouts.length,
      taskCount: session.tasks.length,
      approvedActionCount: session.actionPlan.actions.length,
    },
    receipts,
    payouts,
    scheduledExecutions,
    signoffChecklist: [
      {
        item: "Task and decision receipts emitted",
        status: receipts.length > 0 ? "pass" : "pending",
        notes: `${receipts.length} receipts captured in session output.`,
      },
      {
        item: "Agent reward settlements recorded",
        status: payouts.length > 0 ? "pass" : "pending",
        notes: `${payouts.length} payout records captured.`,
      },
      {
        item: "HashScan transaction evidence available",
        status: receipts.some((entry) => Boolean(entry.transactionId)) || payouts.some((entry) => Boolean(entry.transactionId))
          ? "pass"
          : "pending",
        notes:
          "In simulated mode this remains synthetic. In funded testnet mode this should include live HashScan transaction links.",
      },
      {
        item: "Real testnet validation completed",
        status: session.hederaStatus.mode === "real_scaffolded" ? "pending" : "pending",
        notes:
          "Mark pass only after validating live HCS and payout transactions against funded Hedera testnet credentials.",
      },
    ],
  };
}

export async function persistSessionEvidence(session: WorkflowResult) {
  const evidence = buildSessionEvidence(session);
  const outputPath = resolveEvidenceFilePath(session.sessionId);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(evidence, null, 2), "utf8");
  return {
    evidence,
    outputPath,
  };
}

export async function getSessionEvidence(sessionId: string): Promise<SessionEvidence | null> {
  const path = resolveEvidenceFilePath(sessionId);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as SessionEvidence;
  } catch {
    return null;
  }
}

function resolveEvidenceFilePath(sessionId: string) {
  const baseDir = process.env.CLAWFI_EVIDENCE_DIR
    ? resolve(process.cwd(), process.env.CLAWFI_EVIDENCE_DIR)
    : resolve(process.cwd(), ".clawfi", "evidence");
  return resolve(baseDir, `${sessionId}.evidence.json`);
}

function maybeHashscanTxUrl(network: string, transactionId: string) {
  if (!transactionId.includes("@")) {
    return null;
  }
  const segment = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${segment}/transaction/${transactionId}`;
}
