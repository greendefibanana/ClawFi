import { describe, expect, it } from "vitest";
import { createReceipt, finalizeRecordedReceipt } from "../src/hedera/receiptFactory";

describe("createReceipt", () => {
  it("creates Hedera-shaped receipts for auditable events", () => {
    const receipt = createReceipt({
      eventType: "allocation_finalized",
      accountId: "0.0.7001001",
      network: "testnet",
      settlementMode: "simulated",
      payload: {
        actionCount: 4,
      },
    });

    expect(receipt.eventType).toBe("allocation_finalized");
    expect(receipt.id).toMatch(/^receipt-/);
    expect(receipt.timestamp).toContain("T");
    expect(receipt.status).toBe("recorded");
    expect(receipt.canonicalPayload).toContain("allocation_finalized");
    expect(receipt.canonicalHash).toMatch(/^fnv1a-[a-f0-9]{8}$/);
  });

  it("attaches a UCP invoice for scheduled executions with fee estimates", () => {
    const receipt = createReceipt({
      eventType: "execution_scheduled",
      accountId: "0.0.7001001",
      network: "testnet",
      settlementMode: "simulated",
      payload: {
        actionId: "action-1",
        actionTitle: "Deploy to Bonzo",
        estimatedNetworkFeesUsd: 0.05,
      },
    });

    expect(receipt.payload.ucpInvoice).toMatchObject({
      intent: "invoice",
      senderId: "0.0.7001001",
      amount: 0.05,
      currency: "USD",
    });
  });

  it("attaches a UCP distribution for settled rewards using the actual recipient", () => {
    const receipt = createReceipt({
      eventType: "reward_settled",
      accountId: "0.0.7001001",
      network: "testnet",
      settlementMode: "simulated",
      taskId: "task-1",
      payload: {
        agentName: "Coordinator",
        rewardUsd: 1.25,
        recipientAccountId: "0.0.7010001",
      },
    });

    expect(receipt.payload.ucpDistribution).toMatchObject({
      intent: "split_distribution",
      senderId: "0.0.7001001",
      recipientId: "0.0.7010001",
      amount: 1.25,
      currency: "USD",
    });
  });
});

describe("finalizeRecordedReceipt", () => {
  it("preserves canonical payload integrity when transport metadata is added", () => {
    const receipt = createReceipt({
      eventType: "task_completed",
      accountId: "0.0.7001001",
      network: "testnet",
      settlementMode: "simulated",
      taskId: "task-1",
      payload: {
        agentName: "Coordinator",
      },
    });

    const finalized = finalizeRecordedReceipt({
      receipt,
      status: "indexed",
      transactionId: "0.0.7001001@123.456",
      topicId: "0.0.8001",
      explorerUrl: "https://hashscan.io/testnet/transaction/0.0.7001001@123.456",
    });

    expect(finalized.payload).toEqual(receipt.payload);
    expect(finalized.canonicalPayload).toBe(receipt.canonicalPayload);
    expect(finalized.canonicalHash).toBe(receipt.canonicalHash);
  });
});
