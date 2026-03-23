import "../src/env/loadDotEnv";
import {
  actionPlanSchema,
  activityLogEntrySchema,
  workflowResultSchema,
  type AgentTask,
  type WorkflowResult,
} from "../src/core/models/schemas";
import { createHederaCore } from "../src/hedera/adapters/createHederaCore";
import { resolveAgentRecipientAccountId } from "../src/hedera/runtimeConfig";
import { createReceipt } from "../src/hedera/receiptFactory";
import { releasePayout, reservePayout } from "../src/hedera/payouts";
import { createId, isoNow } from "../src/lib/ids";
import { createAdapterForMode } from "../server/hederaAdapterFactory";
import { persistSessionEvidence } from "../server/evidence";
import { createLiveExecutionAdapterFromEnv } from "../server/liveExecution";
import { getSessionById, persistSession } from "../server/sessionStore";

type MirrorTransaction = {
  transaction_id: string;
  result: string;
  transfers?: Array<{
    account: string;
    amount: number;
  }>;
};

type MirrorTransactionsResponse = {
  transactions?: MirrorTransaction[];
  links?: {
    next?: string | null;
  };
};

const sessionId = process.argv[2];
const approvedBy = process.argv[3] ?? "treasury-operator";

if (!sessionId) {
  console.error("Usage: npx tsx scripts/recover-approve-session.ts <sessionId> [approvedBy]");
  process.exit(1);
}

const session = await getSessionById(sessionId);
if (!session) {
  console.error(`Session ${sessionId} not found.`);
  process.exit(1);
}

const adapter = createAdapterForMode({
  mode: session.hederaStatus.mode,
  treasury: session.treasury,
});
const hederaCore = createHederaCore({
  mode: session.hederaStatus.mode,
  treasury: adapter,
  treasuryState: session.treasury,
});
const liveExecutionAdapter = createLiveExecutionAdapterFromEnv(session.hederaStatus.mode);

const approvedAt = isoNow();
const recoveredSession = await recoverSettledPayouts(session);
const receipts = [...recoveredSession.receipts];
const payouts = [...recoveredSession.payouts];
let scheduledExecutions = [...recoveredSession.scheduledExecutions];
const actionExecutionNotes: string[] = [];

for (const task of recoveredSession.tasks.filter((entry) => entry.status === "completed")) {
  receipts.push(
    await adapter.recordReceipt(
      createReceipt({
        eventType: "task_approved",
        accountId: recoveredSession.treasury.accountId,
        network: recoveredSession.treasury.network,
        settlementMode: recoveredSession.hederaStatus.mode,
        taskId: task.id,
        payload: {
          agentName: task.agentName,
          approved: true,
          approvedBy,
          approvedAt,
          recoveryMode: true,
        },
      }),
    ),
  );
}

for (const action of recoveredSession.actionPlan.actions) {
  receipts.push(
    await adapter.recordReceipt(
      createReceipt({
        eventType: "execution_approved",
        accountId: recoveredSession.treasury.accountId,
        network: recoveredSession.treasury.network,
        settlementMode: recoveredSession.hederaStatus.mode,
        payload: {
          actionId: action.id,
          actionTitle: action.title,
          approvedBy,
          approvedAt,
          recoveryMode: true,
        },
      }),
    ),
  );

  const executionOutcome = liveExecutionAdapter
    ? await liveExecutionAdapter.executeAction({
        action,
        treasury: recoveredSession.treasury,
        strategyConfig: recoveredSession.strategyConfig,
      })
    : {
        actionId: action.id,
        actionTitle: action.title,
        actionType: action.actionType,
        status: "skipped" as const,
        venue: action.venue,
        mode: "simulated" as const,
        detail: "No live execution adapter available for current mode.",
      };

  actionExecutionNotes.push(
    `${action.title}: ${executionOutcome.status.toUpperCase()} (${executionOutcome.detail})`,
  );

  const currentScheduled = scheduledExecutions.find((entry) => entry.actionId === action.id);
  if (currentScheduled) {
    scheduledExecutions = scheduledExecutions.map((entry) =>
      entry.id === currentScheduled.id
        ? {
            ...entry,
            status: executionOutcome.status === "executed" ? "executed" : "failed",
            transactionId: executionOutcome.transactionId ?? entry.transactionId,
            updatedAt: approvedAt,
            preview:
              executionOutcome.status === "executed"
                ? `${entry.preview} | Recovered after the original scheduled execution exhausted treasury HBAR for gas.`
                : `${entry.preview} | Recovery direct execution failed: ${executionOutcome.detail}`,
            approvedBy,
            approvedAt,
          }
        : entry,
    );
  }

  receipts.push(
    await adapter.recordReceipt(
      createReceipt({
        eventType:
          executionOutcome.status === "executed"
            ? "execution_prepared"
            : executionOutcome.status === "failed"
              ? "execution_cancelled"
              : "execution_simulated",
        accountId: recoveredSession.treasury.accountId,
        network: recoveredSession.treasury.network,
        settlementMode: recoveredSession.hederaStatus.mode,
        payload: {
          actionId: action.id,
          actionTitle: action.title,
          actionType: action.actionType,
          status: executionOutcome.status,
          venue: action.venue,
          detail: executionOutcome.detail,
          transactionId: executionOutcome.transactionId ?? null,
          explorerUrl: executionOutcome.explorerUrl ?? null,
          quotedAmountOut: executionOutcome.quotedAmountOut ?? null,
          approvedBy,
          approvedAt,
          recoveryMode: true,
        },
      }),
    ),
  );
}

const hbarPosition = recoveredSession.treasury.portfolio.positions.find((position) => position.symbol === "HBAR");
const hbarPriceUsd =
  typeof hbarPosition?.priceUsd === "number" && hbarPosition.priceUsd > 0 ? hbarPosition.priceUsd : 0.11;

for (const task of recoveredSession.tasks.filter((entry) => entry.status === "completed")) {
  let payout = payouts.find((entry) => entry.taskId === task.id);
  if (!payout) {
    const recipientAccountId = resolveAgentRecipientAccountId({
      agentName: task.agentName,
      mode: recoveredSession.hederaStatus.mode,
      fallbackAccountId: recoveredSession.treasury.accountId,
    });
    const reserved = reservePayout({
      task,
      senderAccountId: recoveredSession.treasury.accountId,
      recipientAccountId,
      hbarPriceUsd,
      settlementMode: recoveredSession.hederaStatus.mode,
    });
    payout = await adapter.settlePayout(releasePayout(reserved));
    payouts.push(payout);
  }

  receipts.push(
    await adapter.recordReceipt(
      createReceipt({
        eventType: "reward_settled",
        accountId: recoveredSession.treasury.accountId,
        network: recoveredSession.treasury.network,
        settlementMode: recoveredSession.hederaStatus.mode,
        taskId: task.id,
        payload: {
          agentName: task.agentName,
          rewardUsd: payout.rewardUsd,
          rewardHbar: payout.rewardHbar,
          payoutId: payout.id,
          recipientAccountId: payout.recipientAccountId,
          ucpDistribution: payout.ucpDistribution,
          approvedBy,
          approvedAt,
          recoveryMode: true,
        },
      }),
    ),
  );
}

receipts.push(
  await adapter.recordReceipt(
    createReceipt({
      eventType: "allocation_finalized",
      accountId: recoveredSession.treasury.accountId,
      network: recoveredSession.treasury.network,
      settlementMode: recoveredSession.hederaStatus.mode,
      payload: {
        approvalState: recoveredSession.riskDecision.status,
        actionCount: recoveredSession.actionPlan.actions.length,
        approvedBy,
        approvedAt,
        recoveryMode: true,
      },
    }),
  ),
);

const finalizedRewardReservations = recoveredSession.rewardReservations.map((reservation) =>
  reservation.status === "reserved"
    ? {
        ...reservation,
        status: "released" as const,
        updatedAt: approvedAt,
      }
    : reservation,
);

const auditTrail = await hederaCore.mirror.getAuditTrail({
  receipts,
  payouts,
  scheduledExecutions,
});

const updated = workflowResultSchema.parse({
  ...recoveredSession,
  actionPlan: actionPlanSchema.parse({
    ...recoveredSession.actionPlan,
    approvalState: recoveredSession.riskDecision.status,
    notes: [
      ...recoveredSession.actionPlan.notes.filter((note) => note !== "Manual approval is required before execution settlements."),
      ...actionExecutionNotes,
      "Recovery mode finalized the session after the original scheduled executions ran out of treasury HBAR for gas.",
    ],
  }),
  scheduledExecutions,
  receipts,
  rewardReservations: finalizedRewardReservations,
  payouts,
  auditTrail,
  activityLog: [
    ...recoveredSession.activityLog,
    activityLogEntrySchema.parse({
      id: createId("log"),
      timestamp: approvedAt,
      actor: approvedBy,
      stage: "approval_finalized",
      message:
        "Recovery approval completed. Existing payouts were reused, missing payouts were settled, and actions were executed directly after the scheduled path failed on-chain.",
      tone: "success",
    }),
  ],
  hederaStatus: {
    ...recoveredSession.hederaStatus,
    settlementSummary:
      "Recovery finalized the session after scheduled executions failed on-chain from insufficient treasury HBAR for gas.",
    scheduledSummary: `${scheduledExecutions.length} scheduled actions were recovered under direct execution after operator approval.`,
  },
});

await persistSession(updated);
const evidence = await persistSessionEvidence(updated);

console.log(
  JSON.stringify(
    {
      sessionId: updated.sessionId,
      approvalState: updated.actionPlan.approvalState,
      payoutCount: updated.payouts.length,
      payouts: updated.payouts.map((entry) => ({
        agentName: entry.agentName,
        recipientAccountId: entry.recipientAccountId,
        transactionId: entry.transactionId ?? null,
      })),
      scheduledExecutions: updated.scheduledExecutions.map((entry) => ({
        actionTitle: entry.actionTitle,
        status: entry.status,
        scheduleId: entry.scheduleId,
        transactionId: entry.transactionId ?? null,
      })),
      evidencePath: evidence.outputPath,
    },
    null,
    2,
  ),
);

async function recoverSettledPayouts(session: WorkflowResult) {
  const startTimestamp =
    session.activityLog.find((entry) => entry.stage === "approval_pending")?.timestamp ??
    session.scheduledExecutions[0]?.createdAt ??
    session.activityLog[0]?.timestamp ??
    new Date().toISOString();
  const mirrorTransactions = await fetchMirrorTransfers({
    accountId: session.treasury.accountId,
    startTimestamp,
    network: session.treasury.network,
  });

  const hbarPosition = session.treasury.portfolio.positions.find((position) => position.symbol === "HBAR");
  const hbarPriceUsd =
    typeof hbarPosition?.priceUsd === "number" && hbarPosition.priceUsd > 0 ? hbarPosition.priceUsd : 0.11;
  const existingTaskIds = new Set(session.payouts.map((entry) => entry.taskId));
  const recoveredPayouts = [...session.payouts];

  for (const task of session.tasks.filter((entry) => entry.status === "completed")) {
    if (existingTaskIds.has(task.id)) {
      continue;
    }

    const recipientAccountId = resolveAgentRecipientAccountId({
      agentName: task.agentName,
      mode: session.hederaStatus.mode,
      fallbackAccountId: session.treasury.accountId,
    });
    const expectedTinybars = rewardTinybars(task, hbarPriceUsd);
    const mirrorTransfer = mirrorTransactions.find((entry) => {
      if (entry.result !== "SUCCESS") {
        return false;
      }
      const recipientTransfer = entry.transfers?.find((transfer) => transfer.account === recipientAccountId);
      return Boolean(recipientTransfer && recipientTransfer.amount === expectedTinybars);
    });

    if (!mirrorTransfer) {
      continue;
    }

    recoveredPayouts.push({
      ...releasePayout(
        reservePayout({
          task,
          senderAccountId: session.treasury.accountId,
          recipientAccountId,
          hbarPriceUsd,
          settlementMode: session.hederaStatus.mode,
        }),
      ),
      status: "settled" as const,
      transactionId: toSdkTransactionId(mirrorTransfer.transaction_id),
    });
    existingTaskIds.add(task.id);
  }

  return {
    ...session,
    payouts: recoveredPayouts,
  };
}

async function fetchMirrorTransfers(input: {
  accountId: string;
  startTimestamp: string;
  network: string;
}) {
  const baseUrl =
    input.network === "mainnet"
      ? "https://mainnet-public.mirrornode.hedera.com"
      : "https://testnet.mirrornode.hedera.com";
  const transactions: MirrorTransaction[] = [];
  let nextUrl = `${baseUrl}/api/v1/transactions?account.id=${encodeURIComponent(
    input.accountId,
  )}&transactiontype=CRYPTOTRANSFER&timestamp=gte:${toMirrorTimestamp(input.startTimestamp)}&limit=100&order=asc`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Mirror request failed with status ${response.status} for ${nextUrl}`);
    }
    const payload = (await response.json()) as MirrorTransactionsResponse;
    transactions.push(...(payload.transactions ?? []));
    nextUrl = payload.links?.next
      ? payload.links.next.startsWith("http")
        ? payload.links.next
        : `${baseUrl}${payload.links.next}`
      : "";
  }

  return transactions;
}

function rewardTinybars(task: AgentTask, hbarPriceUsd: number) {
  return Math.round((task.rewardUsd / hbarPriceUsd) * 100_000_000);
}

function toMirrorTimestamp(isoTimestamp: string) {
  const timestampMs = Date.parse(isoTimestamp);
  const seconds = Math.floor(timestampMs / 1000);
  const nanos = Math.round((timestampMs % 1000) * 1_000_000);
  return `${seconds}.${String(nanos).padStart(9, "0")}`;
}

function toSdkTransactionId(mirrorTransactionId: string) {
  const [accountId, seconds, nanos] = mirrorTransactionId.split("-");
  if (!accountId || !seconds || !nanos) {
    return mirrorTransactionId;
  }
  return `${accountId}@${seconds}.${nanos}`;
}
