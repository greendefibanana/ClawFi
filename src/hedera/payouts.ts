import { payoutSchema, type AgentTask, type HederaMode, type Payout } from "../domain/schemas";
import { createId } from "../lib/ids";
import { createPayoutUcpDistribution } from "./ucp";

export function reservePayout(input: {
  task: AgentTask;
  senderAccountId: string;
  recipientAccountId: string;
  hbarPriceUsd: number;
  settlementMode: HederaMode;
}) {
  const hbarPriceUsd = Number.isFinite(input.hbarPriceUsd) && input.hbarPriceUsd > 0 ? input.hbarPriceUsd : 0.11;
  return payoutSchema.parse({
    id: createId("payout"),
    taskId: input.task.id,
    agentName: input.task.agentName,
    rewardUsd: input.task.rewardUsd,
    rewardHbar: input.task.rewardUsd / hbarPriceUsd,
    status: "reserved",
    recipientAccountId: input.recipientAccountId,
    settlementMode: input.settlementMode,
    ucpDistribution: createPayoutUcpDistribution({
      senderId: input.senderAccountId,
      recipientId: input.recipientAccountId,
      amountUsd: input.task.rewardUsd,
      taskId: input.task.id,
      agentName: input.task.agentName,
    }),
  });
}

export function releasePayout(payout: Payout) {
  return payoutSchema.parse({
    ...payout,
    status: "released",
  });
}
