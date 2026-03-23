import { AccountId, Client } from "@hashgraph/sdk";
import { parseOperatorPrivateKey } from "../operatorKey";
import type { HederaTokenAdapter } from "./adapter";

export class RealTokenAdapter implements HederaTokenAdapter {
  private readonly client: Client;
  private readonly operatorId: string;
  private readonly operatorKey: string;

  constructor(config: {
    network: "testnet" | "mainnet";
    operatorId: string;
    operatorKey: string;
  }) {
    this.operatorId = config.operatorId;
    this.operatorKey = config.operatorKey;
    this.client = config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(this.operatorId),
      parseOperatorPrivateKey(this.operatorKey),
    );
  }

  describeRewardAsset(input: { symbol: string }) {
    return Promise.resolve({
      symbol: input.symbol,
      customFeeAware: true,
      feeRoutingSupported: true,
      note: `Real HTS model on ${this.client.networkName}: reward policy can route fees and settlements through Hedera token-service compatible contracts.`,
    });
  }
}
