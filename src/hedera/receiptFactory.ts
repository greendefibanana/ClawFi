import { receiptSchema, type HederaMode, type Receipt } from "../domain/schemas";
import { canonicalStringify, hashCanonicalPayload } from "./receipts/canonical";
import { summarizeReceiptEvent } from "./receipts/summarize";
import { createId, isoNow } from "../lib/ids";
import { createExecutionUcpInvoice, createPayoutUcpDistribution } from "./ucp";

export function createReceipt(input: {
  eventType: Receipt["eventType"];
  accountId: string;
  network: string;
  settlementMode: HederaMode;
  taskId?: string;
  payload: Receipt["payload"];
  topicId?: string;
  linkedIds?: Receipt["linkedIds"];
  status?: Receipt["status"];
}) {
  const finalPayload = { ...input.payload };

  if (
    input.eventType === "execution_scheduled" &&
    !finalPayload.ucpInvoice &&
    typeof finalPayload.estimatedNetworkFeesUsd === "number"
  ) {
    finalPayload.ucpInvoice = createExecutionUcpInvoice({
      accountId: input.accountId,
      actionTitle:
        typeof finalPayload.actionTitle === "string" ? finalPayload.actionTitle : "scheduled execution",
      estimatedNetworkFeesUsd: finalPayload.estimatedNetworkFeesUsd,
    });
  }

  if (
    input.eventType === "reward_settled" &&
    !finalPayload.ucpDistribution &&
    typeof finalPayload.rewardUsd === "number" &&
    typeof finalPayload.recipientAccountId === "string"
  ) {
    finalPayload.ucpDistribution = createPayoutUcpDistribution({
      senderId: input.accountId,
      recipientId: finalPayload.recipientAccountId,
      amountUsd: finalPayload.rewardUsd,
      taskId: input.taskId ?? "unknown",
      agentName: typeof finalPayload.agentName === "string" ? finalPayload.agentName : "unknown",
    });
  }

  const canonicalPayload = canonicalStringify({
    eventType: input.eventType,
    taskId: input.taskId,
    payload: finalPayload,
    linkedIds: input.linkedIds,
  });
  return receiptSchema.parse({
    id: createId("receipt"),
    eventType: input.eventType,
    timestamp: isoNow(),
    accountId: input.accountId,
    network: input.network,
    settlementMode: input.settlementMode,
    summary: summarizeReceiptEvent({
      eventType: input.eventType,
      taskId: input.taskId,
      payload: finalPayload,
    }),
    status: input.status ?? "recorded",
    canonicalPayload,
    canonicalHash: hashCanonicalPayload(canonicalPayload),
    taskId: input.taskId,
    linkedIds: input.linkedIds,
    payload: finalPayload,
    topicId: input.topicId,
  });
}

export function finalizeRecordedReceipt(input: {
  receipt: Receipt;
  status: Receipt["status"];
  transactionId?: string;
  topicId?: string;
  explorerUrl?: string;
}) {
  return receiptSchema.parse({
    ...input.receipt,
    status: input.status,
    transactionId: input.transactionId ?? input.receipt.transactionId,
    topicId: input.topicId ?? input.receipt.topicId,
    explorerUrl: input.explorerUrl ?? input.receipt.explorerUrl,
  });
}
