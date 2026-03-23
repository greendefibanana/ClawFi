import type { HederaMode, Treasury } from "../../core/models/schemas";
import { readTreasuryAccountId, readTreasuryKey } from "../runtimeConfig";
import type { HederaTreasuryAdapter } from "../treasuryAdapter";
import type { HederaConsensusAdapter } from "../consensus/adapter";
import { SimulatedConsensusAdapter } from "../consensus/simulatedConsensusAdapter";
import { RealConsensusAdapter } from "../consensus/realConsensusAdapter";
import type { HederaScheduleAdapter } from "../schedule/adapter";
import { SimulatedScheduleAdapter } from "../schedule/simulatedScheduleAdapter";
import { RealScheduleAdapter } from "../schedule/realScheduleAdapter";
import type { HederaTokenAdapter } from "../token/adapter";
import { SimulatedTokenAdapter } from "../token/simulatedTokenAdapter";
import { RealTokenAdapter } from "../token/realTokenAdapter";
import type { HederaMirrorAdapter } from "../mirror/adapter";
import { SimulatedMirrorAdapter } from "../mirror/simulatedMirrorAdapter";
import { RealMirrorAdapter } from "../mirror/realMirrorAdapter";
import { createDefaultRewardPolicy } from "../rewards/engine";
import type { RewardPolicy } from "../../core/models/schemas";

export type HederaCore = {
  mode: HederaMode;
  treasury: HederaTreasuryAdapter;
  consensus: HederaConsensusAdapter;
  schedule: HederaScheduleAdapter;
  token: HederaTokenAdapter;
  mirror: HederaMirrorAdapter;
  rewardPolicy: RewardPolicy;
};

export function createHederaCore(input: {
  mode: HederaMode;
  treasury: HederaTreasuryAdapter;
  treasuryState: Treasury;
}): HederaCore {
  const useRealScaffolds = input.mode === "real_scaffolded";
  const useWalletConnected = input.mode === "wallet_connected";
  const operatorId = process.env.HEDERA_OPERATOR_ID ?? input.treasuryState.accountId;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY ?? "";
  const treasuryAccountId = readTreasuryAccountId() ?? input.treasuryState.accountId;
  const treasuryKey = readTreasuryKey() ?? operatorKey;
  const network = input.treasuryState.network as "testnet" | "mainnet";

  const consensus: HederaConsensusAdapter = useRealScaffolds
    ? new RealConsensusAdapter(input.treasury)
    : new SimulatedConsensusAdapter(input.treasury);

  const schedule: HederaScheduleAdapter = useRealScaffolds
    ? new RealScheduleAdapter({
        network,
        operatorId,
        operatorKey,
        treasuryAccountId,
        treasuryKey,
      })
    : new SimulatedScheduleAdapter();

  const token: HederaTokenAdapter = useRealScaffolds
    ? new RealTokenAdapter({
        network,
        operatorId,
        operatorKey,
      })
    : new SimulatedTokenAdapter();

  const mirror: HederaMirrorAdapter = useRealScaffolds || useWalletConnected
    ? new RealMirrorAdapter(network)
    : new SimulatedMirrorAdapter();

  const roleRewardsUsd = useRealScaffolds || useWalletConnected
    ? {
        Coordinator: 0.03,
        "Token Research": 0.02,
        "DeFi Strategy": 0.02,
        Risk: 0.025,
        Execution: 0.015,
        Reporter: 0.01,
      }
    : {
        Coordinator: 280,
        "Token Research": 180,
        "DeFi Strategy": 180,
        Risk: 220,
        Execution: 140,
        Reporter: 120,
      };

  return {
    mode: input.mode,
    treasury: input.treasury,
    consensus,
    schedule,
    token,
    mirror,
    rewardPolicy: createDefaultRewardPolicy({
      rewardPoolAccountId: input.treasuryState.accountId,
      feeRoutingAccountId: input.treasuryState.accountId,
      roleRewardsUsd,
    }),
  };
}
