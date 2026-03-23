export interface HederaTokenAdapter {
  describeRewardAsset(input: { symbol: string }): Promise<{
    symbol: string;
    customFeeAware: boolean;
    feeRoutingSupported: boolean;
    note: string;
  }>;
}
