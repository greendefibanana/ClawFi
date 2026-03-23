import type { HederaTokenAdapter } from "./adapter";

export class SimulatedTokenAdapter implements HederaTokenAdapter {
  describeRewardAsset(input: { symbol: string }) {
    return Promise.resolve({
      symbol: input.symbol,
      customFeeAware: true,
      feeRoutingSupported: true,
      note: "Simulated HTS/custom-fee-aware model. Real token-service settlement can be layered behind this adapter.",
    });
  }
}
