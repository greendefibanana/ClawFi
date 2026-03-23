import { describe, expect, it } from "vitest";
import { runClawFiWorkflow } from "../src/orchestration/runClawfiWorkflow";

describe("runClawFiWorkflow", () => {
  it("runs the end-to-end simulated Hedera treasury workflow", async () => {
    const result = await runClawFiWorkflow();

    expect(result.hederaStatus.mode).toBe("simulated");
    expect(result.sessionId).toMatch(/^session-/);
    expect(result.openclawAlignment.pluginName).toBe("clawfi-openclaw");
    expect(result.actionPlan.actions.length).toBeGreaterThan(0);
    expect(result.toolInvocations.length).toBeGreaterThan(0);
    expect(result.receipts.some((receipt) => receipt.eventType === "task_assigned")).toBe(true);
    expect(result.receipts.some((receipt) => receipt.eventType === "execution_scheduled")).toBe(true);
    expect(result.receipts.some((receipt) => receipt.eventType === "allocation_finalized")).toBe(true);
    expect(result.scheduledExecutions.length).toBeGreaterThan(0);
    expect(result.auditTrail.length).toBeGreaterThan(0);
    expect(result.payouts.every((payout) => payout.status === "settled")).toBe(true);
  });
});
