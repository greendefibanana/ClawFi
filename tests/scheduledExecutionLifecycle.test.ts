import { describe, expect, it } from "vitest";
import { SimulatedScheduleAdapter } from "../src/hedera/schedule/simulatedScheduleAdapter";

describe("SimulatedScheduleAdapter", () => {
  it("tracks scheduled execution lifecycle transitions", async () => {
    const adapter = new SimulatedScheduleAdapter();
    const created = await adapter.createScheduledAction({
      actionId: "action-1",
      actionTitle: "Deploy USDC to Bonzo",
      approvalRequired: true,
      preview: "Awaiting approval",
    });

    expect(created.status).toBe("awaiting_approval");
    expect(created.scheduleId).toBeDefined();

    const statusBefore = await adapter.getScheduledExecutionStatus({
      scheduleId: created.scheduleId ?? created.id,
    });
    expect(statusBefore).toBe("awaiting_approval");

    const approved = await adapter.approveScheduledExecution({
      scheduleId: created.scheduleId ?? created.id,
      approvedBy: "qa-operator",
    });
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("qa-operator");

    const cancelled = await adapter.cancelScheduledExecution({
      scheduleId: created.scheduleId ?? created.id,
      reason: "Operator aborted after review",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.preview).toContain("Cancelled");
  });
});

