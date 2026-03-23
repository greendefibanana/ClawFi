import { scheduledExecutionSchema, type ScheduledExecution } from "../../core/models/schemas";
import { createId, isoNow } from "../../lib/ids";
import type { HederaScheduleAdapter } from "./adapter";

export class SimulatedScheduleAdapter implements HederaScheduleAdapter {
  private readonly schedules = new Map<string, ScheduledExecution>();

  createScheduledAction(input: {
    actionId: string;
    actionTitle: string;
    approvalRequired: boolean;
    preview: string;
    ucpInvoice?: import("../../core/models/schemas").ScheduledExecution["ucpInvoice"];
  }) {
    const now = isoNow();
    const scheduled = scheduledExecutionSchema.parse({
      id: createId("sched"),
      actionId: input.actionId,
      actionTitle: input.actionTitle,
      status: input.approvalRequired ? "awaiting_approval" : "scheduled",
      approvalRequired: input.approvalRequired,
      scheduleId: createId("schedule"),
      preview: input.preview,
      ucpInvoice: input.ucpInvoice,
      createdAt: now,
      updatedAt: now,
    });
    this.schedules.set(scheduled.scheduleId ?? scheduled.id, scheduled);
    return Promise.resolve(scheduled);
  }

  getScheduledExecutionStatus(input: { scheduleId: string }) {
    const existing = this.schedules.get(input.scheduleId);
    return Promise.resolve(existing?.status ?? "failed");
  }

  approveScheduledExecution(input: { scheduleId: string; approvedBy: string }) {
    const existing = this.schedules.get(input.scheduleId);
    if (!existing) {
      throw new Error(`Scheduled execution ${input.scheduleId} not found.`);
    }
    const approved = scheduledExecutionSchema.parse({
      ...existing,
      status: "approved",
      approvedBy: input.approvedBy,
      approvedAt: isoNow(),
      updatedAt: isoNow(),
    });
    this.schedules.set(input.scheduleId, approved);
    return Promise.resolve(approved);
  }

  cancelScheduledExecution(input: { scheduleId: string; reason: string }) {
    const existing = this.schedules.get(input.scheduleId);
    if (!existing) {
      throw new Error(`Scheduled execution ${input.scheduleId} not found.`);
    }
    const cancelled = scheduledExecutionSchema.parse({
      ...existing,
      status: "cancelled",
      preview: `${existing.preview} | Cancelled: ${input.reason}`,
      updatedAt: isoNow(),
    });
    this.schedules.set(input.scheduleId, cancelled);
    return Promise.resolve(cancelled);
  }
}
