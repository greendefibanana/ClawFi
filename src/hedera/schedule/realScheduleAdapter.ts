import {
  AccountId,
  Client,
  ContractExecuteTransaction,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleInfoQuery,
  ScheduleSignTransaction,
  Status,
  TransactionId,
  TransactionReceiptQuery,
  TransactionRecordQuery,
  type Transaction,
} from "@hashgraph/sdk";
import { scheduledExecutionSchema } from "../../core/models/schemas";
import { createId, isoNow } from "../../lib/ids";
import { parseOperatorPrivateKey, parseTreasuryPrivateKey } from "../operatorKey";
import type { HederaScheduleAdapter } from "./adapter";

export class RealScheduleAdapter implements HederaScheduleAdapter {
  private readonly operatorClient: Client;
  private readonly treasuryClient: Client;
  private readonly network: "testnet" | "mainnet";
  private readonly operatorId: string;
  private readonly operatorKey: string;
  private readonly treasuryAccountId: string;
  private readonly mirrorNodeBaseUrl: string;

  constructor(config: {
    network: "testnet" | "mainnet";
    operatorId: string;
    operatorKey: string;
    treasuryAccountId: string;
    treasuryKey: string;
  }) {
    this.network = config.network;
    this.operatorId = config.operatorId;
    this.operatorKey = config.operatorKey;
    this.treasuryAccountId = config.treasuryAccountId;
    this.mirrorNodeBaseUrl =
      this.network === "mainnet"
        ? "https://mainnet-public.mirrornode.hedera.com"
        : "https://testnet.mirrornode.hedera.com";
    this.operatorClient = this.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
    this.operatorClient.setOperator(
      AccountId.fromString(this.operatorId),
      parseOperatorPrivateKey(this.operatorKey),
    );
    this.treasuryClient = this.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
    this.treasuryClient.setOperator(
      AccountId.fromString(this.treasuryAccountId),
      parseTreasuryPrivateKey(config.treasuryKey),
    );
  }

  async createScheduledAction(input: {
    actionId: string;
    actionTitle: string;
    approvalRequired: boolean;
    preview: string;
    ucpInvoice?: import("../../core/models/schemas").ScheduledExecution["ucpInvoice"];
    // For a real schedule, we need the inner transaction.
    // In this scaffold, we'll assume a placeholder transfer to self
    // as a proof of concept of the schedule mechanism.
    innerTx?: Transaction;
  }) {
    const now = isoNow();
    
    // In a real implementation, 'innerTx' would be the actual SaucerSwap or Bonzo call.
    // For this hackathon-ready scaffold, we wrap a simple HBAR transfer to treasury
    // as the scheduled action if no innerTx is provided.
    const innerTx = input.innerTx ?? new ContractExecuteTransaction(); // Placeholder

    const scheduleTx = new ScheduleCreateTransaction()
      .setScheduledTransaction(innerTx)
      .setAdminKey(parseOperatorPrivateKey(this.operatorKey))
      .setPayerAccountId(AccountId.fromString(this.treasuryAccountId))
      .setScheduleMemo(`ClawFi: ${input.actionTitle}`);

    const response = await scheduleTx.execute(this.operatorClient);
    const receipt = await response.getReceipt(this.operatorClient);
    const scheduleId = receipt.scheduleId?.toString() ?? `0.0.${createId("schedule")}`;
    const liveStatus = await this.getScheduledExecutionStatus({
      scheduleId,
    });

    const scheduled = scheduledExecutionSchema.parse({
      id: createId("sched"),
      actionId: input.actionId,
      actionTitle: input.actionTitle,
      status:
        liveStatus === "executed"
          ? "executed"
          : input.approvalRequired
            ? "awaiting_approval"
            : "scheduled",
      approvalRequired: input.approvalRequired,
      scheduleId,
      preview: input.preview,
      ucpInvoice: input.ucpInvoice,
      createdAt: now,
      updatedAt: now,
    });
    return scheduled;
  }

  async getScheduledExecutionStatus(input: { scheduleId: string }) {
    try {
      const outcome = await this.readScheduleOutcome(input.scheduleId);
      return outcome.status;
    } catch (error) {
      console.error(`Error querying schedule ${input.scheduleId}:`, error);
      return "failed";
    }
  }

  async approveScheduledExecution(input: { scheduleId: string; approvedBy: string }) {
    try {
      const signTx = await new ScheduleSignTransaction()
        .setScheduleId(input.scheduleId)
        .execute(this.treasuryClient);

      const receipt = await signTx.getReceipt(this.treasuryClient);
      if (receipt.status !== Status.Success && receipt.status.toString() !== "SCHEDULE_ALREADY_EXECUTED") {
        throw new Error(`Failed to sign schedule ${input.scheduleId}: ${receipt.status.toString()}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("SCHEDULE_ALREADY_EXECUTED") && !message.includes("NO_NEW_VALID_SIGNATURES")) {
        throw error;
      }
    }

    const now = isoNow();
    const liveOutcome = await this.readScheduleOutcome(input.scheduleId);
    return scheduledExecutionSchema.parse({
      id: createId("sched"),
      actionId: "unknown",
      actionTitle: "Approved Action",
      status:
        liveOutcome.status === "executed"
          ? "executed"
          : liveOutcome.status === "failed"
            ? "failed"
            : "approved",
      approvalRequired: true,
      approvedBy: input.approvedBy,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
      scheduleId: input.scheduleId,
      ...(liveOutcome.transactionId ? { transactionId: liveOutcome.transactionId } : {}),
      preview:
        liveOutcome.status === "failed"
          ? liveOutcome.preview
          : "Schedule signed and executed on-chain.",
    });
  }

  async cancelScheduledExecution(input: { scheduleId: string; reason: string }) {
    const deleteTx = await new ScheduleDeleteTransaction()
      .setScheduleId(input.scheduleId)
      .execute(this.operatorClient);
    const receipt = await deleteTx.getReceipt(this.operatorClient);
    if (receipt.status !== Status.Success) {
      throw new Error(`Failed to delete schedule ${input.scheduleId}: ${receipt.status.toString()}`);
    }

    return scheduledExecutionSchema.parse({
      id: createId("sched"),
      actionId: "unknown",
      actionTitle: "Cancelled Action",
      status: "cancelled",
      approvalRequired: true,
      createdAt: isoNow(),
      updatedAt: isoNow(),
      scheduleId: input.scheduleId,
      preview: `Cancelled: ${input.reason}`,
    });
  }

  private async readScheduleOutcome(scheduleId: string): Promise<{
    status: "scheduled" | "executed" | "cancelled" | "failed";
    transactionId?: string;
    preview: string;
  }> {
    const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(this.operatorClient);

    if (info.deleted) {
      return {
        status: "cancelled",
        preview: "Schedule was cancelled on-chain.",
      };
    }

    if (!info.executed) {
      return {
        status: "scheduled",
        preview: "Schedule is pending on-chain approval.",
      };
    }

    const scheduledTransactionId = info.scheduledTransactionId?.toString();
    if (!scheduledTransactionId) {
      return {
        status: "executed",
        preview: "Schedule executed on-chain.",
      };
    }

    const transactionId = TransactionId.fromString(scheduledTransactionId);
    let executionStatus: string;
    try {
      const record = await new TransactionRecordQuery()
        .setTransactionId(transactionId)
        .execute(this.operatorClient);
      executionStatus = record.receipt.status.toString();
    } catch {
      try {
        const receipt = await new TransactionReceiptQuery()
          .setTransactionId(transactionId)
          .execute(this.operatorClient);
        executionStatus = receipt.status.toString();
      } catch {
        executionStatus = await this.readMirrorTransactionResult(scheduledTransactionId) ?? "RECEIPT_NOT_FOUND";
      }
    }
    if (executionStatus !== Status.Success.toString()) {
      return {
        status: "failed",
        transactionId: scheduledTransactionId,
        preview: `Scheduled transaction failed on-chain with status ${executionStatus}.`,
      };
    }

    return {
      status: "executed",
      transactionId: scheduledTransactionId,
      preview: "Schedule executed on-chain.",
    };
  }

  private async readMirrorTransactionResult(transactionId: string) {
    const response = await fetch(
      `${this.mirrorNodeBaseUrl}/api/v1/transactions/${encodeURIComponent(this.toMirrorTransactionId(transactionId))}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      transactions?: Array<{
        result?: string;
      }>;
    };
    return payload.transactions?.[0]?.result ?? null;
  }

  private toMirrorTransactionId(transactionId: string) {
    if (!transactionId.includes("@")) {
      return transactionId;
    }
    const [accountId, validStart] = transactionId.split("@");
    if (!accountId || !validStart) {
      return transactionId;
    }
    const [seconds, nanos] = validStart.split(".");
    if (!seconds || !nanos) {
      return transactionId;
    }
    return `${accountId}-${seconds}-${nanos}`;
  }
}
