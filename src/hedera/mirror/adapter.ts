import type { AuditQueryResult, MirrorEventView, Payout, Receipt, ScheduledExecution } from "../../core/models/schemas";

export interface HederaMirrorAdapter {
  getMirrorReceiptHistory(input: { receipts: Receipt[] }): Promise<AuditQueryResult>;
  getAuditTrail(input: {
    receipts: Receipt[];
    payouts: Payout[];
    scheduledExecutions: ScheduledExecution[];
  }): Promise<MirrorEventView[]>;
}
