import type { HederaMode, Treasury } from "../src/core/models/schemas";
import { readTreasuryAccountId, readTreasuryKey } from "../src/hedera/runtimeConfig";
import { RealHederaTreasuryAdapter } from "../src/hedera/sdkAdapter.server";
import { SimulatedHederaTreasuryAdapter } from "../src/hedera/simulatedHederaAdapter";
import type { HederaTreasuryAdapter } from "../src/hedera/treasuryAdapter";
import { WalletConnectedTreasuryAdapter } from "./walletTreasuryAdapter";

export function resolveDefaultMode(): HederaMode {
  const fromEnv = process.env.HEDERA_MODE;
  return fromEnv === "real_scaffolded" ? "real_scaffolded" : "simulated";
}

export function createRealAdapterFromEnv() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error("Real Hedera mode requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.");
  }
  return new RealHederaTreasuryAdapter({
    network: process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet",
    operatorId,
    operatorKey,
    treasuryAccountId: readTreasuryAccountId(),
    treasuryKey: readTreasuryKey(),
    receiptTopicId: process.env.HEDERA_RECEIPT_TOPIC_ID,
    mirrorNodeBaseUrl: process.env.HEDERA_MIRROR_NODE_URL,
  });
}

export function createAdapterForMode(input: {
  mode: HederaMode;
  treasury: Treasury;
}): HederaTreasuryAdapter {
  if (input.mode === "real_scaffolded") {
    return createRealAdapterFromEnv();
  }
  if (input.mode === "wallet_connected") {
    return new WalletConnectedTreasuryAdapter({
      network: input.treasury.network === "mainnet" ? "mainnet" : "testnet",
      treasuryAccountId: input.treasury.accountId,
      mirrorNodeBaseUrl: process.env.HEDERA_MIRROR_NODE_URL,
    });
  }
  return new SimulatedHederaTreasuryAdapter(input.treasury.portfolio.positions);
}
