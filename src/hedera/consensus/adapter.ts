import type { HederaMode, Receipt } from "../../core/models/schemas";

export interface HederaConsensusAdapter {
  createCoordinationTopic(input: { label: string }): Promise<{ topicId: string; mode: HederaMode }>;
  getRfpTopicId(): string | null;
  getBidsTopicId(): string | null;
  publishReceipt(input: {
    receipt: Receipt;
    topicId?: string;
  }): Promise<Receipt>;
  publishMessage(input: {
    topicId: string;
    message: Record<string, unknown>;
  }): Promise<{ transactionId: string }>;
}
