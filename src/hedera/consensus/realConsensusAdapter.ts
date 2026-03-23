import type { Receipt } from "../../core/models/schemas";
import { createId } from "../../lib/ids";
import type { HederaTreasuryAdapter } from "../treasuryAdapter";
import type { HederaConsensusAdapter } from "./adapter";

export class RealConsensusAdapter implements HederaConsensusAdapter {
  private coordinationTopicId: string | null = process.env.HEDERA_RECEIPT_TOPIC_ID ?? null;
  private rfpTopicId: string | null = process.env.HEDERA_RFP_TOPIC_ID ?? null;
  private bidsTopicId: string | null = process.env.HEDERA_BIDS_TOPIC_ID ?? null;

  constructor(private readonly treasuryAdapter: HederaTreasuryAdapter) {}

  createCoordinationTopic(input: { label: string }) {
    if (!this.coordinationTopicId) {
      this.coordinationTopicId = `real-topic-${createId("topic")}-${slug(input.label)}`;
    }
    return Promise.resolve({
      topicId: this.coordinationTopicId,
      mode: this.treasuryAdapter.mode,
    });
  }

  getRfpTopicId() {
    return this.rfpTopicId;
  }

  getBidsTopicId() {
    return this.bidsTopicId;
  }

  publishReceipt(input: { receipt: Receipt; topicId?: string }) {
    const topicId = input.topicId ?? input.receipt.topicId ?? this.coordinationTopicId ?? undefined;
    return this.treasuryAdapter.recordReceipt({
      ...input.receipt,
      topicId,
    });
  }

  publishMessage(input: { topicId: string; message: Record<string, unknown> }) {
    return this.treasuryAdapter.publishHcsMessage(input.topicId, input.message);
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

