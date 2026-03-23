import {
  actionPlanSchema,
  activityLogEntrySchema,
  payoutSchema,
  scheduledExecutionSchema,
  workflowResultSchema,
  type WorkflowResult,
} from "../src/core/models/schemas";
import { createHederaCore } from "../src/hedera/adapters/createHederaCore";
import { reservePayout } from "../src/hedera/payouts";
import { resolveAgentRecipientAccountId } from "../src/hedera/runtimeConfig";
import { createReceipt } from "../src/hedera/receiptFactory";
import { createId, isoNow } from "../src/lib/ids";
import { createAdapterForMode } from "./hederaAdapterFactory";

export type WalletActionResult = {
  actionId: string;
  status: "executed" | "failed" | "skipped";
  transactionId?: string;
  explorerUrl?: string;
  detail: string;
};

export type WalletPayoutResult = {
  taskId: string;
  transactionId: string;
};

export async function finalizeWalletSession(input: {
  session: WorkflowResult;
  approvedBy: string;
  walletAccountId: string;
  actionResults: WalletActionResult[];
  payoutResults: WalletPayoutResult[];
}) {
  const { session } = input;
  if (session.hederaStatus.mode !== "wallet_connected") {
    throw new Error("Wallet approval finalization only supports wallet-connected sessions.");
  }
  if (session.actionPlan.approvalState !== "pending") {
    throw new Error("Session is not awaiting approval.");
  }
  if (session.treasury.accountId !== input.walletAccountId) {
    throw new Error("Connected wallet does not match the treasury account for this session.");
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

  const approvedAt = isoNow();
  const receipts = [...session.receipts];
  const payouts = [...session.payouts];
  let scheduledExecutions = [...session.scheduledExecutions];
  const actionExecutionNotes: string[] = [];
  const actionById = new Map(session.actionPlan.actions.map((action) => [action.id, action]));
  const payoutByTaskId = new Map(input.payoutResults.map((result) => [result.taskId, result]));

  for (const task of session.tasks.filter((entry) => entry.status === "completed")) {
    if (!receipts.some((entry) => entry.eventType === "task_approved" && entry.taskId === task.id)) {
      const receipt = createReceipt({
        eventType: "task_approved",
        accountId: session.treasury.accountId,
        network: session.treasury.network,
        settlementMode: session.hederaStatus.mode,
        taskId: task.id,
        linkedIds: {
          taskId: task.id,
          agentName: task.agentName,
        },
        payload: {
          agentName: task.agentName,
          approved: true,
          approvedBy: input.approvedBy,
          approvedAt,
        },
      });
      receipts.push(
        await adapter.recordReceipt(receipt),
      );
    }
  }

  for (const result of input.actionResults) {
    const action = actionById.get(result.actionId);
    if (!action) {
      continue;
    }

    const currentScheduled = scheduledExecutions.find((entry) => entry.actionId === action.id);
    const approvedReceipt = createReceipt({
      eventType: "execution_approved",
      accountId: session.treasury.accountId,
      network: session.treasury.network,
      settlementMode: session.hederaStatus.mode,
      payload: {
        actionId: action.id,
        actionTitle: action.title,
        approvedBy: input.approvedBy,
        approvedAt,
      },
    });
    receipts.push(await adapter.recordReceipt(approvedReceipt));

    actionExecutionNotes.push(`${action.title}: ${result.status.toUpperCase()} (${result.detail})`);

    if (currentScheduled) {
      const nextStatus =
        result.status === "executed"
          ? "executed"
          : result.status === "failed"
            ? "failed"
            : "approved";
      scheduledExecutions = scheduledExecutions.map((entry) =>
        entry.id === currentScheduled.id
          ? scheduledExecutionSchema.parse({
              ...entry,
              status: nextStatus,
              transactionId: result.transactionId,
              preview:
                result.status === "executed"
                  ? `${entry.preview} | Executed via connected browser wallet.`
                  : result.status === "failed"
                    ? `${entry.preview} | Browser wallet execution failed: ${result.detail}`
                    : entry.preview,
              approvedBy: input.approvedBy,
              approvedAt,
              updatedAt: approvedAt,
            })
          : entry,
      );
    }

    const eventType =
      result.status === "executed"
        ? "execution_prepared"
        : result.status === "failed"
          ? "execution_cancelled"
          : "execution_simulated";
    const actionReceipt = createReceipt({
      eventType,
      accountId: session.treasury.accountId,
      network: session.treasury.network,
      settlementMode: session.hederaStatus.mode,
      payload: {
        actionId: action.id,
        actionTitle: action.title,
        actionType: action.actionType,
        status: result.status,
        venue: action.venue,
        detail: result.detail,
        transactionId: result.transactionId ?? null,
        explorerUrl: result.explorerUrl ?? null,
        approvedBy: input.approvedBy,
        approvedAt,
      },
    });
    receipts.push({
      ...actionReceipt,
      status: "recorded",
      ...(result.transactionId ? { transactionId: result.transactionId } : {}),
      ...(result.explorerUrl ? { explorerUrl: result.explorerUrl } : {}),
    });
  }

  const hbarPosition = session.treasury.portfolio.positions.find((position) => position.symbol === "HBAR");
  const hbarPriceUsd =
    typeof hbarPosition?.priceUsd === "number" && hbarPosition.priceUsd > 0 ? hbarPosition.priceUsd : 0.11;
  const reservationByTask = new Map(session.rewardReservations.map((reservation) => [reservation.taskId, reservation]));

  for (const task of session.tasks.filter((entry) => entry.status === "completed")) {
    if (payouts.some((entry) => entry.taskId === task.id)) {
      continue;
    }
    const payoutResult = payoutByTaskId.get(task.id);
    if (!payoutResult) {
      continue;
    }
    const reservedRewardUsd = reservationByTask.get(task.id)?.rewardUsd ?? task.rewardUsd;
    const recipientAccountId = resolveAgentRecipientAccountId({
      agentName: task.agentName,
      mode: session.hederaStatus.mode,
      fallbackAccountId: session.treasury.accountId,
    });
    const reserved = reservePayout({
      task: {
        ...task,
        rewardUsd: reservedRewardUsd,
      },
      senderAccountId: session.treasury.accountId,
      recipientAccountId,
      hbarPriceUsd,
      settlementMode: session.hederaStatus.mode,
    });
    const settled = payoutSchema.parse({
      ...reserved,
      status: "settled",
      settlementMode: session.hederaStatus.mode,
      transactionId: payoutResult.transactionId,
    });
    payouts.push(settled);
    const payoutReceipt = createReceipt({
      eventType: "reward_settled",
      accountId: session.treasury.accountId,
      network: session.treasury.network,
      settlementMode: session.hederaStatus.mode,
      taskId: task.id,
      linkedIds: {
        taskId: task.id,
        agentName: task.agentName,
      },
      payload: {
        agentName: task.agentName,
        rewardUsd: settled.rewardUsd,
        rewardHbar: settled.rewardHbar,
        payoutId: settled.id,
        recipientAccountId: settled.recipientAccountId,
        approvedBy: input.approvedBy,
        approvedAt,
      },
    });
    receipts.push({
      ...payoutReceipt,
      status: "recorded",
      transactionId: payoutResult.transactionId,
      explorerUrl: hashscanUrl(session.treasury.network, payoutResult.transactionId),
    });
  }

  const finalizedRewardReservations = session.rewardReservations.map((reservation) => {
    if (reservation.status !== "reserved") {
      return reservation;
    }
    const paid = payouts.some((entry) => entry.taskId === reservation.taskId);
    return paid
      ? {
          ...reservation,
          status: "released" as const,
          updatedAt: approvedAt,
        }
      : reservation;
  });

  const allocationReceipt = createReceipt({
    eventType: "allocation_finalized",
    accountId: session.treasury.accountId,
    network: session.treasury.network,
    settlementMode: session.hederaStatus.mode,
    payload: {
      approvalState: session.riskDecision.status,
      actionCount: session.actionPlan.actions.length,
      approvedBy: input.approvedBy,
      approvedAt,
    },
  });
  receipts.push(await adapter.recordReceipt(allocationReceipt));

  const auditTrail = await hederaCore.mirror.getAuditTrail({
    receipts,
    payouts,
    scheduledExecutions,
  });

  return workflowResultSchema.parse({
    ...session,
    actionPlan: actionPlanSchema.parse({
      ...session.actionPlan,
      approvalState: session.riskDecision.status,
      notes: [
        ...session.actionPlan.notes.filter((note) => note !== "Manual approval is required before execution settlements."),
        ...actionExecutionNotes,
        "Approved and executed through a connected browser wallet.",
      ],
    }),
    scheduledExecutions,
    receipts,
    rewardReservations: finalizedRewardReservations,
    payouts,
    auditTrail,
    activityLog: [
      ...session.activityLog,
      activityLogEntrySchema.parse({
        id: createId("log"),
        timestamp: approvedAt,
        actor: input.approvedBy,
        stage: "wallet_approval_finalized",
        message: "Connected wallet executed the approved actions and posted settlement evidence back to the API.",
        tone: "success",
      }),
    ],
    hederaStatus: {
      ...session.hederaStatus,
      settlementSummary: "Actions and payouts were executed from the connected browser wallet.",
      scheduledSummary: `${scheduledExecutions.length} actions were finalized after browser wallet approval by ${input.approvedBy}.`,
    },
  });
}

function hashscanUrl(network: string, transactionId: string) {
  const segment = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${segment}/transaction/${transactionId}`;
}
