import { rewardPolicySchema, rewardReservationSchema, type AgentTask, type RewardPolicy, type RewardReservation } from "../../core/models/schemas";
import { createId, isoNow } from "../../lib/ids";

export function createDefaultRewardPolicy(input: {
  rewardPoolAccountId: string;
  feeRoutingAccountId?: string;
  roleRewardsUsd?: Record<string, number>;
}): RewardPolicy {
  return rewardPolicySchema.parse({
    rewardAssetSymbol: "HBAR",
    rewardPoolAccountId: input.rewardPoolAccountId,
    feeRoutingAccountId: input.feeRoutingAccountId,
    roleRewardsUsd: input.roleRewardsUsd ?? {},
  });
}

export function reserveAgentReward(input: {
  task: AgentTask;
  policy: RewardPolicy;
}): RewardReservation {
  const overrideReward = input.policy.roleRewardsUsd[input.task.agentName];
  const rewardUsd = typeof overrideReward === "number" ? overrideReward : input.task.rewardUsd;
  const now = isoNow();
  return rewardReservationSchema.parse({
    id: createId("rsv"),
    taskId: input.task.id,
    agentName: input.task.agentName,
    rewardUsd,
    status: "reserved",
    createdAt: now,
    updatedAt: now,
  });
}

export function releaseAgentReward(reservation: RewardReservation) {
  return rewardReservationSchema.parse({
    ...reservation,
    status: "released",
    updatedAt: isoNow(),
  });
}

export function cancelAgentReward(reservation: RewardReservation) {
  return rewardReservationSchema.parse({
    ...reservation,
    status: "cancelled",
    updatedAt: isoNow(),
  });
}
