import { describe, expect, it } from "vitest";
import { approveSessionSettlement } from "../server/approval";
import { runServerSession } from "../server/runSession";

describe("approval flow", () => {
  it("keeps payouts pending until manual approval and settles after approval", async () => {
    const pendingSession = await runServerSession({
      hederaMode: "simulated",
      autoApprove: false,
    });

    expect(pendingSession.actionPlan.approvalState).toBe("pending");
    expect(pendingSession.payouts.length).toBe(0);

    const approvedSession = await approveSessionSettlement({
      session: pendingSession,
      approvedBy: "qa-operator",
    });

    expect(approvedSession.actionPlan.approvalState).not.toBe("pending");
    expect(approvedSession.payouts.length).toBeGreaterThan(0);
    expect(approvedSession.receipts.some((entry) => entry.eventType === "reward_settled")).toBe(true);
    expect(approvedSession.receipts.some((entry) => entry.eventType === "task_approved")).toBe(true);
    expect(approvedSession.receipts.some((entry) => entry.eventType === "execution_approved")).toBe(true);
    expect(approvedSession.scheduledExecutions.every((entry) => entry.status !== "awaiting_approval")).toBe(true);
    expect(approvedSession.rewardReservations.every((entry) => entry.status !== "reserved")).toBe(true);
    expect(
      approvedSession.receipts.some(
        (entry) => entry.eventType === "execution_simulated" || entry.eventType === "execution_prepared",
      ),
    ).toBe(true);
  });
});
