import { payoutSchema } from "../domain/schemas";
import type { Payout, Receipt, Treasury } from "../domain/schemas";
import { createId } from "../lib/ids";
import { finalizeRecordedReceipt } from "./receiptFactory";
import type { HederaTreasuryAdapter } from "./treasuryAdapter";

export class SimulatedHederaTreasuryAdapter implements HederaTreasuryAdapter {
  readonly mode = "simulated" as const;

  constructor(private readonly positions: Treasury["portfolio"]["positions"]) {}

  readBalances() {
    return Promise.resolve(this.positions);
  }

  recordReceipt(receipt: Receipt) {
    return Promise.resolve(
      finalizeRecordedReceipt({
        receipt,
        status: "indexed",
        transactionId: receipt.transactionId ?? `sim-receipt-${createId("tx")}`,
        explorerUrl: receipt.explorerUrl ?? "Simulated Hedera receipt log",
      }),
    );
  }

  settlePayout(payout: Payout) {
    return Promise.resolve(
      payoutSchema.parse({
      ...payout,
      status: "settled",
      transactionId: payout.transactionId ?? `sim-payout-${createId("tx")}`,
      }),
    );
  }

  publishHcsMessage(_topicId: string, _message: unknown) {
    void _topicId;
    void _message;
    return Promise.resolve({ transactionId: `sim-hcs-${createId("tx")}` });
  }

  getCapabilitySummary() {
    return {
      liveCapabilities: [
        "Account balance reads when operator credentials exist",
        "HBAR reward settlement via TransferTransaction",
        "Receipt anchoring via Hedera Consensus Service topics",
      ],
      simulatedCapabilities: [
        "Treasury balances are seeded from realistic Hedera-native demo data",
        "Payouts resolve to deterministic simulated Hedera transfer IDs",
        "Receipts are recorded with Hedera-shaped transaction and topic metadata",
      ],
    };
  }
}
