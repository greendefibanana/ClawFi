import type { UcpData } from "../domain/schemas";

export function createExecutionUcpInvoice(input: {
  accountId: string;
  actionTitle: string;
  estimatedNetworkFeesUsd: number;
}): UcpData {
  const amount = normalizeUsdAmount(input.estimatedNetworkFeesUsd);
  return {
    ucpVersion: "1.0",
    intent: "invoice",
    senderId: input.accountId,
    amount,
    currency: "USD",
    memo: `Execution quote for ${input.actionTitle}`,
  };
}

export function createPayoutUcpDistribution(input: {
  senderId: string;
  recipientId: string;
  amountUsd: number;
  taskId: string;
  agentName: string;
}): UcpData {
  const amount = normalizeUsdAmount(input.amountUsd);
  return {
    ucpVersion: "1.0",
    intent: "split_distribution",
    senderId: input.senderId,
    recipientId: input.recipientId,
    amount,
    currency: "USD",
    memo: `ClawFi task reward for ${input.agentName} (${input.taskId})`,
    splitStrategy: [
      {
        recipientId: input.recipientId,
        amount,
        role: input.agentName,
      },
    ],
  };
}

function normalizeUsdAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}
