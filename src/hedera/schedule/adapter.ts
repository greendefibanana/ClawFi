import type { ScheduledExecution, ScheduledExecutionStatus } from "../../core/models/schemas";
import type { Transaction } from "@hashgraph/sdk";

export interface HederaScheduleAdapter {
  createScheduledAction(input: {
    actionId: string;
    actionTitle: string;
    approvalRequired: boolean;
    preview: string;
    ucpInvoice?: ScheduledExecution["ucpInvoice"];
    innerTx?: Transaction;
  }): Promise<ScheduledExecution>;
  getScheduledExecutionStatus(input: { scheduleId: string }): Promise<ScheduledExecutionStatus>;
  approveScheduledExecution(input: { scheduleId: string; approvedBy: string }): Promise<ScheduledExecution>;
  cancelScheduledExecution(input: { scheduleId: string; reason: string }): Promise<ScheduledExecution>;
}
