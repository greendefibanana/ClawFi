import type { HederaMode, Payout, Receipt, Treasury } from "../domain/schemas";

export interface HederaTreasuryAdapter {
  readonly mode: HederaMode;
  readBalances(): Promise<Treasury["portfolio"]["positions"]>;
  recordReceipt(receipt: Receipt): Promise<Receipt>;
  settlePayout(payout: Payout): Promise<Payout>;
  getCapabilitySummary(): {
    liveCapabilities: string[];
    simulatedCapabilities: string[];
  };
  publishHcsMessage(topicId: string, message: unknown): Promise<{ transactionId: string }>;
}
