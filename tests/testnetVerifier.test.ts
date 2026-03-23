import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionEvidence } from "../server/evidence";
import { verifySessionEvidence } from "../server/testnetVerifier";

describe("verifySessionEvidence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes structural checks in simulated mode", async () => {
    const evidence: SessionEvidence = {
      generatedAt: new Date().toISOString(),
      sessionId: "session-1",
      scenarioId: "demo",
      goal: "demo goal",
      mode: "simulated",
      network: "testnet",
      treasuryAccountId: "0.0.1001",
      summary: {
        receiptCount: 1,
        payoutCount: 1,
        taskCount: 1,
        approvedActionCount: 1,
      },
      receipts: [
        {
          id: "receipt-1",
          eventType: "task_created",
          transactionId: "sim-receipt-tx-1",
          topicId: null,
          explorerUrl: null,
        },
      ],
      payouts: [
        {
          id: "payout-1",
          taskId: "task-1",
          agentName: "Coordinator",
          rewardUsd: 10,
          rewardHbar: 90,
          recipientAccountId: "0.0.7010001",
          transactionId: "sim-payout-1",
          explorerUrl: null,
          ucpDistribution: null,
        },
      ],
      scheduledExecutions: [],
      signoffChecklist: [],
    };

    const report = await verifySessionEvidence({
      evidence,
    });

    expect(report.passed).toBe(true);
    expect(report.checks.some((check) => check.id === "simulated_mode_notice")).toBe(true);
  });

  it("checks mirror transaction visibility in real mode", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requestedUrls.push(url);
        if (url.includes("/api/v1/transactions/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                transactions: [{}],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
      }),
    );

    const evidence: SessionEvidence = {
      generatedAt: new Date().toISOString(),
      sessionId: "session-2",
      scenarioId: "demo",
      goal: "demo goal",
      mode: "real_scaffolded",
      network: "testnet",
      treasuryAccountId: "0.0.1001",
      summary: {
        receiptCount: 1,
        payoutCount: 1,
        taskCount: 1,
        approvedActionCount: 1,
      },
      receipts: [
        {
          id: "receipt-1",
          eventType: "allocation_finalized",
          transactionId: "0.0.1001@1729191919.000000001",
          topicId: "0.0.2002",
          explorerUrl: "https://hashscan.io/testnet/transaction/0.0.1001@1729191919.000000001",
        },
      ],
      payouts: [
        {
          id: "payout-1",
          taskId: "task-1",
          agentName: "Coordinator",
          rewardUsd: 10,
          rewardHbar: 90,
          recipientAccountId: "0.0.7010001",
          transactionId: "0.0.1001@1729191919.000000002",
          explorerUrl: "https://hashscan.io/testnet/transaction/0.0.1001@1729191919.000000002",
          ucpDistribution: null,
        },
      ],
      scheduledExecutions: [],
      signoffChecklist: [],
    };

    const report = await verifySessionEvidence({
      evidence,
      mirrorNodeBaseUrl: "https://testnet.mirrornode.hedera.com",
    });

    expect(report.passed).toBe(true);
    expect(report.checks.find((check) => check.id === "mirror_tx_lookup")?.passed).toBe(true);
    expect(requestedUrls).toContain("https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.1001-1729191919-000000001");
    expect(requestedUrls).toContain("https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.1001-1729191919-000000002");
  });
});
