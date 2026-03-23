import { describe, expect, it } from "vitest";
import { demoStrategyConfig } from "../src/core/scenarios/demoScenario";
import { runServerSession } from "../server/runSession";

describe("runServerSession", () => {
  it("runs a simulated backend session and returns workflow artifacts", async () => {
    const session = await runServerSession({
      hederaMode: "simulated",
    });

    expect(session.sessionId).toMatch(/^session-/);
    expect(session.hederaStatus.mode).toBe("simulated");
    expect(session.receipts.length).toBeGreaterThan(0);
    expect(session.payouts.length).toBeGreaterThan(0);
  });

  it("auto-finalizes non-simulate-only runs and appends execution receipts", async () => {
    const session = await runServerSession({
      hederaMode: "simulated",
      autoApprove: true,
      strategyConfig: {
        ...demoStrategyConfig,
        simulateOnly: false,
      },
    });

    expect(session.actionPlan.approvalState).not.toBe("pending");
    expect(session.receipts.some((entry) => entry.eventType === "execution_simulated")).toBe(true);
  });
});
