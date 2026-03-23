import { describe, expect, it } from "vitest";
import { createReceipt } from "../src/hedera/receiptFactory";

describe("receipt canonicalization", () => {
  it("produces stable canonical payload and hash across equivalent payload shapes", () => {
    const first = createReceipt({
      eventType: "task_completed",
      accountId: "0.0.7001001",
      network: "testnet",
      settlementMode: "simulated",
      taskId: "task-1",
      linkedIds: {
        taskId: "task-1",
        agentName: "Token Research",
      },
      payload: {
        status: "completed",
        metrics: {
          confidence: 91,
          retries: 0,
        },
      },
    });

    const second = createReceipt({
      eventType: "task_completed",
      accountId: "0.0.7001001",
      network: "testnet",
      settlementMode: "simulated",
      taskId: "task-1",
      linkedIds: {
        agentName: "Token Research",
        taskId: "task-1",
      },
      payload: {
        metrics: {
          retries: 0,
          confidence: 91,
        },
        status: "completed",
      },
    });

    expect(first.canonicalPayload).toBe(second.canonicalPayload);
    expect(first.canonicalHash).toBe(second.canonicalHash);
    expect(first.summary).toContain("task");
  });
});
