import type { Receipt } from "../../core/models/schemas";
import { createId } from "../../lib/ids";
import type { HederaTreasuryAdapter } from "../treasuryAdapter";
import type { HederaConsensusAdapter } from "./adapter";

export class SimulatedConsensusAdapter implements HederaConsensusAdapter {
  private coordinationTopicId: string | null = null;
  private rfpTopicId: string = "sim-topic-rfp";
  private bidsTopicId: string = "sim-topic-bids";

  constructor(private readonly treasuryAdapter: HederaTreasuryAdapter) {}

  createCoordinationTopic(input: { label: string }) {
    this.coordinationTopicId = `sim-topic-${createId("topic")}-${slug(input.label)}`;
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

  publishMessage(input: { topicId: string; message: Record<string, unknown> }) {
    return this.treasuryAdapter.publishHcsMessage(input.topicId, input.message);
  }

  async publishReceipt(input: { receipt: Receipt; topicId?: string }) {
    const persisted = await this.treasuryAdapter.recordReceipt({
      ...input.receipt,
      topicId: input.topicId ?? input.receipt.topicId ?? this.coordinationTopicId ?? undefined,
    });
    return persisted;
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
