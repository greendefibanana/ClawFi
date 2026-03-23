import { describe, expect, it } from "vitest";
import { releasePayout, reservePayout } from "../src/hedera/payouts";

describe("reservePayout", () => {
  it("creates a first-class UCP distribution on the payout object", () => {
    const reserved = reservePayout({
      task: {
        id: "task-1",
        agentName: "Coordinator",
        title: "Coordinate session",
        status: "completed",
        rewardUsd: 0.5,
        allowedTools: [],
        promptPreview: "preview",
      },
      senderAccountId: "0.0.7001001",
      recipientAccountId: "0.0.7010001",
      hbarPriceUsd: 0.1,
      settlementMode: "simulated",
    });

    expect(reserved.ucpDistribution).toMatchObject({
      intent: "split_distribution",
      senderId: "0.0.7001001",
      recipientId: "0.0.7010001",
      amount: 0.5,
      currency: "USD",
    });

    const released = releasePayout(reserved);
    expect(released.ucpDistribution).toEqual(reserved.ucpDistribution);
  });
});
