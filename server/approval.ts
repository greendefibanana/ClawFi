import {
  actionPlanSchema,
  activityLogEntrySchema,
  scheduledExecutionSchema,
  workflowResultSchema,
  type WorkflowResult,
} from "../src/core/models/schemas";
import { createHederaCore } from "../src/hedera/adapters/createHederaCore";
import { resolveAgentRecipientAccountId } from "../src/hedera/runtimeConfig";
import { createReceipt } from "../src/hedera/receiptFactory";
import { releasePayout, reservePayout } from "../src/hedera/payouts";
import { createId, isoNow } from "../src/lib/ids";
import { createAdapterForMode } from "./hederaAdapterFactory";
import { createLiveExecutionAdapterFromEnv } from "./liveExecution";

export async function approveSessionSettlement(input: {
  session: WorkflowResult;
  approvedBy: string;
  allowAlreadyApproved?: boolean;
}) {
  const { session } = input;
  if (session.hederaStatus.mode === "wallet_connected") {
    throw new Error("Wallet-connected sessions must be approved through the browser wallet flow.");
  }
  if (session.actionPlan.approvalState !== "pending" && !input.allowAlreadyApproved) {
    throw new Error("Session is not awaiting approval.");
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

  const receipts = [...session.receipts];
  const payouts = [...session.payouts];
  let scheduledExecutions = [...session.scheduledExecutions];
  const approvedAt = isoNow();
  const actionExecutionNotes: string[] = [];
  const liveExecutionAdapter = createLiveExecutionAdapterFromEnv(session.hederaStatus.mode);

  for (const task of session.tasks.filter((entry) => entry.status === "completed")) {
    if (!receipts.some((entry) => entry.eventType === "task_approved" && entry.taskId === task.id)) {
      receipts.push(
        await adapter.recordReceipt(
          createReceipt({
            eventType: "task_approved",
            accountId: session.treasury.accountId,
            network: session.treasury.network,
            settlementMode: session.hederaStatus.mode,
            taskId: task.id,
            payload: {
              agentName: task.agentName,
              approved: true,
              approvedBy: input.approvedBy,
              approvedAt,
            },
          }),
        ),
      );
    }
  }

  for (const action of session.actionPlan.actions) {
    const matchingScheduled = scheduledExecutions.find((entry) => entry.actionId === action.id);
    if (matchingScheduled && matchingScheduled.status === "awaiting_approval") {
      const approvedSchedule =
        session.hederaStatus.mode === "real_scaffolded" && matchingScheduled.scheduleId
          ? scheduledExecutionSchema.parse({
              ...matchingScheduled,
              ...await hederaCore.schedule.approveScheduledExecution({
                scheduleId: matchingScheduled.scheduleId,
                approvedBy: input.approvedBy,
              }),
              id: matchingScheduled.id,
              actionId: matchingScheduled.actionId,
              actionTitle: matchingScheduled.actionTitle,
              preview: matchingScheduled.preview,
              ucpInvoice: matchingScheduled.ucpInvoice,
              createdAt: matchingScheduled.createdAt,
              ...(matchingScheduled.transactionId ? { transactionId: matchingScheduled.transactionId } : {}),
            })
          : scheduledExecutionSchema.parse({
              ...matchingScheduled,
              status: "approved",
              approvedBy: input.approvedBy,
              approvedAt,
              updatedAt: approvedAt,
            });
      scheduledExecutions = scheduledExecutions.map((entry) =>
        entry.id === matchingScheduled.id ? approvedSchedule : entry,
      );
      receipts.push(
        await adapter.recordReceipt(
          createReceipt({
            eventType: "execution_approved",
            accountId: session.treasury.accountId,
            network: session.treasury.network,
            settlementMode: session.hederaStatus.mode,
            payload: {
              actionId: action.id,
              actionTitle: action.title,
              scheduleId: approvedSchedule.scheduleId ?? approvedSchedule.id,
              approvedBy: input.approvedBy,
              approvedAt,
            },
          }),
        ),
      );
      const scheduled = scheduledExecutions.find((entry) => entry.actionId === action.id) ?? matchingScheduled;
      if (scheduled.status === "executed") {
        receipts.push(
          await adapter.recordReceipt(
            createReceipt({
              eventType: "execution_prepared",
              accountId: session.treasury.accountId,
              network: session.treasury.network,
              settlementMode: session.hederaStatus.mode,
              payload: {
                actionId: action.id,
                actionTitle: action.title,
                actionType: action.actionType,
                status: scheduled.status,
                venue: action.venue,
                detail: `Schedule ${scheduled.scheduleId ?? scheduled.id} executed through Hedera schedule flow.`,
                transactionId: scheduled.transactionId ?? null,
                scheduleId: scheduled.scheduleId ?? null,
                approvedBy: input.approvedBy,
                approvedAt,
              },
            }),
          ),
        );
        continue;
      }
    }

    const executionOutcome = liveExecutionAdapter
      ? await liveExecutionAdapter.executeAction({
          action,
          treasury: session.treasury,
          strategyConfig: session.strategyConfig,
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
      if (session.hederaStatus.mode === "real_scaffolded" && currentScheduled.scheduleId && currentScheduled.status !== "executed") {
        try {
          await hederaCore.schedule.cancelScheduledExecution({
            scheduleId: currentScheduled.scheduleId,
            reason: "Replaced by direct execution after governance approval.",
          });
        } catch {
          // Keep going when cleanup fails; the direct execution result remains authoritative.
        }
      }
      if (executionOutcome.status === "executed") {
        const executedSchedule = scheduledExecutionSchema.parse({
          ...currentScheduled,
          status: "executed",
          transactionId: executionOutcome.transactionId,
          preview: `${currentScheduled.preview} | Executed after approval via direct live connector.`,
          updatedAt: approvedAt,
        });
        scheduledExecutions = scheduledExecutions.map((entry) =>
          entry.id === currentScheduled.id ? executedSchedule : entry,
        );
      } else if (executionOutcome.status === "failed") {
        const failedSchedule = scheduledExecutionSchema.parse({
          ...currentScheduled,
          status: "failed",
          preview: `${currentScheduled.preview} | Direct execution failure: ${executionOutcome.detail}`,
          updatedAt: approvedAt,
        });
        scheduledExecutions = scheduledExecutions.map((entry) =>
          entry.id === currentScheduled.id ? failedSchedule : entry,
        );
      }
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
          accountId: session.treasury.accountId,
          network: session.treasury.network,
          settlementMode: session.hederaStatus.mode,
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
            approvedBy: input.approvedBy,
            approvedAt,
          },
        }),
      ),
    );
  }

  const hbarPosition = session.treasury.portfolio.positions.find((position) => position.symbol === "HBAR");
  const hbarPriceUsd =
    typeof hbarPosition?.priceUsd === "number" && hbarPosition.priceUsd > 0 ? hbarPosition.priceUsd : 0.11;
  const reservationByTask = new Map(session.rewardReservations.map((reservation) => [reservation.taskId, reservation]));
  for (const task of session.tasks.filter((entry) => entry.status === "completed")) {
    if (payouts.some((entry) => entry.taskId === task.id)) {
      continue;
    }
    const reservation = reservationByTask.get(task.id);
    const recipientAccountId =
      resolveAgentRecipientAccountId({
        agentName: task.agentName,
        mode: session.hederaStatus.mode,
        fallbackAccountId: session.treasury.accountId,
      });
    const reserved = reservePayout({
      task: {
        ...task,
        rewardUsd: reservation?.rewardUsd ?? task.rewardUsd,
      },
      senderAccountId: session.treasury.accountId,
      recipientAccountId,
      hbarPriceUsd,
      settlementMode: session.hederaStatus.mode,
    });
    const settled = await adapter.settlePayout(releasePayout(reserved));
    payouts.push(settled);
    receipts.push(
      await adapter.recordReceipt(
        createReceipt({
          eventType: "reward_settled",
          accountId: session.treasury.accountId,
          network: session.treasury.network,
          settlementMode: session.hederaStatus.mode,
          taskId: task.id,
          payload: {
            agentName: task.agentName,
            rewardUsd: settled.rewardUsd,
            rewardHbar: settled.rewardHbar,
            payoutId: settled.id,
            recipientAccountId: settled.recipientAccountId,
            ucpDistribution: settled.ucpDistribution,
            approvedBy: input.approvedBy,
            approvedAt,
          },
        }),
      ),
    );
  }

  receipts.push(
    await adapter.recordReceipt(
      createReceipt({
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
      }),
    ),
  );

  const finalizedRewardReservations = session.rewardReservations.map((reservation) => {
    if (reservation.status !== "reserved") {
      return reservation;
    }
    const isCompletedTask = session.tasks.some((task) => task.id === reservation.taskId && task.status === "completed");
    if (isCompletedTask) {
      return {
        ...reservation,
        status: "released" as const,
        updatedAt: approvedAt,
      };
    }
    return reservation;
  });
  const auditTrail = await hederaCore.mirror.getAuditTrail({
    receipts,
    payouts,
    scheduledExecutions,
  });

  const updated = workflowResultSchema.parse({
    ...session,
    actionPlan: actionPlanSchema.parse({
      ...session.actionPlan,
      approvalState: session.riskDecision.status,
      notes: [
        ...session.actionPlan.notes.filter((note) => note !== "Manual approval is required before execution settlements."),
        ...actionExecutionNotes,
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
        stage: "approval_finalized",
        message: "Approval completed. Actions were executed through configured connectors and reward settlements were released.",
        tone: "success",
      }),
    ],
    hederaStatus: {
      ...session.hederaStatus,
      settlementSummary: "Actions and rewards were settled after approval and recorded with Hedera-native receipt events.",
      scheduledSummary: `${scheduledExecutions.length} scheduled actions updated after approval by ${input.approvedBy}.`,
    },
  });

  return updated;
}

export async function rejectSessionSettlement(input: {
  session: WorkflowResult;
  rejectedBy: string;
  reason?: string;
}) {
  const { session } = input;
  if (session.actionPlan.approvalState !== "pending") {
    throw new Error("Session is not awaiting approval.");
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

  const rejectedAt = isoNow();
  const reason = input.reason?.trim() || "Operator rejected pending execution settlement.";
  const receipts = [...session.receipts];
  const payouts = [...session.payouts];
  const scheduledExecutions = await Promise.all(
    session.scheduledExecutions.map(async (entry) => {
      if (entry.status !== "awaiting_approval" && entry.status !== "approved") {
        return entry;
      }

      if (session.hederaStatus.mode === "real_scaffolded" && entry.scheduleId) {
        const cancelled = await hederaCore.schedule.cancelScheduledExecution({
          scheduleId: entry.scheduleId,
          reason,
        });
        return scheduledExecutionSchema.parse({
          ...entry,
          ...cancelled,
          id: entry.id,
          actionId: entry.actionId,
          actionTitle: entry.actionTitle,
          createdAt: entry.createdAt,
          ucpInvoice: entry.ucpInvoice,
          approvedBy: input.rejectedBy,
          approvedAt: rejectedAt,
          preview: `${entry.preview} | Cancelled: ${reason}`,
        });
      }

      return scheduledExecutionSchema.parse({
        ...entry,
        status: "cancelled",
        preview: `${entry.preview} | Cancelled: ${reason}`,
        approvedBy: input.rejectedBy,
        approvedAt: rejectedAt,
        updatedAt: rejectedAt,
      });
    }),
  );

  for (const task of session.tasks.filter((entry) => entry.status === "completed")) {
    receipts.push(
      await adapter.recordReceipt(
        createReceipt({
          eventType: "execution_cancelled",
          accountId: session.treasury.accountId,
          network: session.treasury.network,
          settlementMode: session.hederaStatus.mode,
          taskId: task.id,
          payload: {
            taskId: task.id,
            agentName: task.agentName,
            rejectedBy: input.rejectedBy,
            rejectedAt,
            reason,
          },
        }),
      ),
    );
  }

  for (const scheduled of scheduledExecutions.filter((entry) => entry.status === "cancelled")) {
    receipts.push(
      await adapter.recordReceipt(
        createReceipt({
          eventType: "execution_cancelled",
          accountId: session.treasury.accountId,
          network: session.treasury.network,
          settlementMode: session.hederaStatus.mode,
          payload: {
            actionId: scheduled.actionId,
            actionTitle: scheduled.actionTitle,
            scheduleId: scheduled.scheduleId ?? scheduled.id,
            rejectedBy: input.rejectedBy,
            rejectedAt,
            reason,
          },
        }),
      ),
    );
  }

  receipts.push(
    await adapter.recordReceipt(
      createReceipt({
        eventType: "allocation_finalized",
        accountId: session.treasury.accountId,
        network: session.treasury.network,
        settlementMode: session.hederaStatus.mode,
        payload: {
          approvalState: "rejected",
          actionCount: session.actionPlan.actions.length,
          rejectedBy: input.rejectedBy,
          rejectedAt,
          reason,
        },
      }),
    ),
  );

  const finalizedRewardReservations = session.rewardReservations.map((reservation) => {
    if (reservation.status !== "reserved") {
      return reservation;
    }
    return {
      ...reservation,
      status: "cancelled" as const,
      updatedAt: rejectedAt,
    };
  });

  const auditTrail = await hederaCore.mirror.getAuditTrail({
    receipts,
    payouts,
    scheduledExecutions,
  });

  return workflowResultSchema.parse({
    ...session,
    actionPlan: actionPlanSchema.parse({
      ...session.actionPlan,
      approvalState: "rejected",
      notes: [
        ...session.actionPlan.notes.filter((note) => note !== "Manual approval is required before execution settlements."),
        `Rejected by ${input.rejectedBy}: ${reason}`,
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
        timestamp: rejectedAt,
        actor: input.rejectedBy,
        stage: "approval_rejected",
        message: `Pending execution settlements were cancelled. ${reason}`,
        tone: "warning",
      }),
    ],
    hederaStatus: {
      ...session.hederaStatus,
      settlementSummary: `Pending settlements were cancelled by ${input.rejectedBy}.`,
      scheduledSummary: `${scheduledExecutions.filter((entry) => entry.status === "cancelled").length} scheduled actions were cancelled.`,
    },
  });
}
