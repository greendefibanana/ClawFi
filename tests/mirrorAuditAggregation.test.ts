import { describe, expect, it } from "vitest";
import { payoutSchema, scheduledExecutionSchema } from "../src/domain/schemas";
import { createReceipt } from "../src/hedera/receiptFactory";
import { SimulatedMirrorAdapter } from "../src/hedera/mirror/simulatedMirrorAdapter";
import { createExecutionUcpInvoice, createPayoutUcpDistribution } from "../src/hedera/ucp";

describe("SimulatedMirrorAdapter", () => {
  it("aggregates receipts, scheduled executions, and payouts into one audit trail", async () => {
    const adapter = new SimulatedMirrorAdapter();
    const receipts = [
      createReceipt({
        eventType: "task_created",
        accountId: "0.0.7001001",
        network: "testnet",
        settlementMode: "simulated",
        taskId: "task-1",
        payload: { agentName: "Coordinator" },
      }),
      createReceipt({
        eventType: "execution_scheduled",
        accountId: "0.0.7001001",
        network: "testnet",
        settlementMode: "simulated",
        payload: { actionId: "action-1" },
      }),
    ];
    const scheduledExecutions = [
      scheduledExecutionSchema.parse({
        id: "sched-1",
        actionId: "action-1",
        actionTitle: "Deploy to Bonzo",
        status: "awaiting_approval",
        approvalRequired: true,
        scheduleId: "schedule-1",
        preview: "Awaiting approval",
        ucpInvoice: createExecutionUcpInvoice({
          accountId: "0.0.7001001",
          actionTitle: "Deploy to Bonzo",
          estimatedNetworkFeesUsd: 0.05,
        }),
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:30:00.000Z",
      }),
    ];
    const payouts = [
      payoutSchema.parse({
        id: "payout-1",
        taskId: "task-1",
        agentName: "Coordinator",
        rewardUsd: 280,
        rewardHbar: 2500,
        status: "settled",
        recipientAccountId: "0.0.7010001",
        settlementMode: "simulated",
        transactionId: "sim-payout-1",
        ucpDistribution: createPayoutUcpDistribution({
          senderId: "0.0.7001001",
          recipientId: "0.0.7010001",
          amountUsd: 280,
          taskId: "task-1",
          agentName: "Coordinator",
        }),
      }),
    ];

    const auditTrail = await adapter.getAuditTrail({
      receipts,
      payouts,
      scheduledExecutions,
    });

    expect(auditTrail).toHaveLength(receipts.length + payouts.length + scheduledExecutions.length);
    expect(auditTrail.some((entry) => entry.record.type === "receipt")).toBe(true);
    expect(auditTrail.some((entry) => entry.record.type === "execution")).toBe(true);
    expect(auditTrail.some((entry) => entry.record.type === "reward")).toBe(true);
    expect(auditTrail.every((entry) => entry.source === "simulated_mirror")).toBe(true);
    expect(auditTrail.find((entry) => entry.record.type === "execution")?.record.payload).toMatchObject({
      ucpInvoice: {
        intent: "invoice",
      },
    });
    expect(auditTrail.find((entry) => entry.record.type === "reward")?.record.payload).toMatchObject({
      ucpDistribution: {
        intent: "split_distribution",
      },
    });
  });
});
