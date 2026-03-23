import { auditQueryResultSchema, mirrorEventViewSchema, type MirrorEventView, type Payout, type Receipt, type ScheduledExecution } from "../../core/models/schemas";
import { createId, isoNow } from "../../lib/ids";
import type { HederaMirrorAdapter } from "./adapter";

export class SimulatedMirrorAdapter implements HederaMirrorAdapter {
  getMirrorReceiptHistory(input: { receipts: Receipt[] }) {
    const records = input.receipts.map((receipt) =>
      mirrorEventViewSchema.parse({
        id: createId("mirror"),
        source: "simulated_mirror",
        network: receipt.network,
        record: {
          id: receipt.id,
          timestamp: receipt.timestamp,
          type: "receipt",
          summary: receipt.summary,
          status: receipt.status,
          transactionId: receipt.transactionId,
          topicId: receipt.topicId,
          payload: receipt.payload,
        },
      }),
    );
    return Promise.resolve(auditQueryResultSchema.parse({
      source: "simulated_mirror",
      records,
    }));
  }

  async getAuditTrail(input: {
    receipts: Receipt[];
    payouts: Payout[];
    scheduledExecutions: ScheduledExecution[];
  }): Promise<MirrorEventView[]> {
    const receiptViews = (await this.getMirrorReceiptHistory({ receipts: input.receipts })).records;
    const payoutViews = input.payouts.map((payout) =>
      mirrorEventViewSchema.parse({
        id: createId("mirror"),
        source: "simulated_mirror",
        network: "testnet",
        record: {
          id: payout.id,
          timestamp: isoNow(),
          type: "reward",
          summary: `Reward settled for ${payout.agentName}`,
          status: payout.status,
          transactionId: payout.transactionId,
          payload: {
            taskId: payout.taskId,
            rewardUsd: payout.rewardUsd,
            rewardHbar: payout.rewardHbar,
            recipientAccountId: payout.recipientAccountId,
            ucpDistribution: payout.ucpDistribution,
          },
        },
      }),
    );
    const scheduleViews = input.scheduledExecutions.map((scheduled) =>
      mirrorEventViewSchema.parse({
        id: createId("mirror"),
        source: "simulated_mirror",
        network: "testnet",
        record: {
          id: scheduled.id,
          timestamp: scheduled.updatedAt,
          type: "execution",
          summary: `Scheduled execution ${scheduled.status} for ${scheduled.actionTitle}`,
          status: scheduled.status,
          transactionId: scheduled.transactionId,
          payload: {
            scheduleId: scheduled.scheduleId,
            actionId: scheduled.actionId,
            approvalRequired: scheduled.approvalRequired,
            preview: scheduled.preview,
            ucpInvoice: scheduled.ucpInvoice,
          },
        },
      }),
    );
    return [...receiptViews, ...scheduleViews, ...payoutViews].sort((left, right) =>
      right.record.timestamp.localeCompare(left.record.timestamp),
    );
  }
}
