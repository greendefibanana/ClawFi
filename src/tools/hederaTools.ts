import { releasePayout, reservePayout } from "../hedera/payouts";
import { reserveAgentReward as reserveRewardReservation } from "../hedera/rewards/engine";
import { createReceipt as makeReceipt } from "../hedera/receiptFactory";
import type { Payout } from "../core/models/schemas";
import type {
  AuditTrailResult,
  ClawfiTool,
  MirrorReceiptHistoryResult,
  ReceiptResult,
  RewardReservationResult,
  ScheduledExecutionResult,
} from "./types";

export const createReceiptTool: ClawfiTool<
  {
    eventType: Parameters<typeof makeReceipt>[0]["eventType"];
    taskId?: string;
    payload: Record<string, unknown>;
  },
  ReceiptResult
> = {
  name: "createReceipt",
  description: "Creates a Hedera-shaped receipt without persistence.",
  execute({ input, context }) {
    return Promise.resolve({
      receipt: makeReceipt({
        eventType: input.eventType,
        taskId: input.taskId,
        payload: input.payload,
        accountId: context.treasury.accountId,
        network: context.treasury.network,
        settlementMode: context.treasury.mode,
      }),
    });
  },
};

export const publishCoordinationReceiptTool: ClawfiTool<
  {
    eventType: Parameters<typeof makeReceipt>[0]["eventType"];
    taskId?: string;
    payload: Record<string, unknown>;
    linkedIds?: Parameters<typeof makeReceipt>[0]["linkedIds"];
  },
  ReceiptResult
> = {
  name: "publishCoordinationReceipt",
  description: "Publishes a coordination receipt through the Hedera consensus abstraction.",
  async execute({ input, context, deps }) {
    const receipt = makeReceipt({
      eventType: input.eventType,
      taskId: input.taskId,
      payload: input.payload,
      linkedIds: input.linkedIds,
      accountId: context.treasury.accountId,
      network: context.treasury.network,
      settlementMode: context.treasury.mode,
    });
    return {
      receipt: await deps.hederaCore.consensus.publishReceipt({ receipt }),
    };
  },
};

export const recordTaskReceiptTool: ClawfiTool<
  {
    taskId: string;
    eventType: "task_created" | "task_assigned" | "task_started" | "task_completed" | "task_failed" | "task_approved";
    payload: Record<string, unknown>;
  },
  ReceiptResult
> = {
  name: "recordTaskReceipt",
  description: "Creates and records task lifecycle receipts via the Hedera adapter.",
  async execute({ input, context, deps }) {
    const receipt = makeReceipt({
      eventType: input.eventType,
      taskId: input.taskId,
      payload: input.payload,
      linkedIds: {
        taskId: input.taskId,
      },
      accountId: context.treasury.accountId,
      network: context.treasury.network,
      settlementMode: context.treasury.mode,
    });
    return {
      receipt: await deps.hederaCore.consensus.publishReceipt({ receipt }),
    };
  },
};

export const recordDecisionReceiptTool: ClawfiTool<
  { eventType: "risk_review_completed" | "risk_rejected" | "allocation_finalized"; payload: Record<string, unknown> },
  ReceiptResult
> = {
  name: "recordDecisionReceipt",
  description: "Records risk and allocation decision receipts.",
  async execute({ input, context, deps }) {
    const receipt = makeReceipt({
      eventType: input.eventType,
      payload: input.payload,
      accountId: context.treasury.accountId,
      network: context.treasury.network,
      settlementMode: context.treasury.mode,
    });
    return {
      receipt: await deps.hederaCore.consensus.publishReceipt({ receipt }),
    };
  },
};

export const createScheduledExecutionTool: ClawfiTool<
  {
    actionId: string;
    actionTitle: string;
    preview: string;
    approvalRequired: boolean;
    ucpInvoice?: import("../core/models/schemas").ScheduledExecution["ucpInvoice"];
    innerTx?: unknown;
  },
  ScheduledExecutionResult
> = {
  name: "createScheduledExecution",
  description: "Creates a Hedera-style scheduled execution lifecycle record.",
  async execute({ input, deps }) {
    return {
      scheduledExecution: await deps.hederaCore.schedule.createScheduledAction({
        actionId: input.actionId,
        actionTitle: input.actionTitle,
        approvalRequired: input.approvalRequired,
        preview: input.preview,
        ucpInvoice: input.ucpInvoice,
        innerTx: input.innerTx as import("@hashgraph/sdk").Transaction | undefined,
      }),
    };
  },
};

export const getScheduledExecutionStatusTool: ClawfiTool<{ scheduleId: string }, { status: string }> = {
  name: "getScheduledExecutionStatus",
  description: "Gets the latest scheduled execution lifecycle status.",
  async execute({ input, deps }) {
    const status = await deps.hederaCore.schedule.getScheduledExecutionStatus({
      scheduleId: input.scheduleId,
    });
    return { status };
  },
};

export const reserveAgentRewardTool: ClawfiTool<
  {
    task: {
      id: string;
      agentName: string;
      title: string;
      rewardUsd: number;
      status: "assigned" | "completed" | "failed";
      allowedTools: string[];
      promptPreview: string;
    };
  },
  RewardReservationResult
> = {
  name: "reserveAgentReward",
  description: "Reserves reward budget for an assigned/active agent task.",
  execute({ input, deps }) {
    return Promise.resolve({
      reservation: reserveRewardReservation({
        task: input.task,
        policy: deps.hederaCore.rewardPolicy,
      }),
    });
  },
};

export const settleAgentRewardTool: ClawfiTool<
  {
    task: {
      id: string;
      agentName: string;
      rewardUsd: number;
      status: "completed";
    };
    recipientAccountId: string;
    hbarPriceUsd: number;
  },
  { payout: Payout }
> = {
  name: "settleAgentReward",
  description: "Reserves, releases, and settles a reward payout through Hedera abstraction.",
  async execute({ input, context, deps }) {
    const reserved = reservePayout({
      task: {
        ...input.task,
        title: "",
        allowedTools: [],
        promptPreview: "",
      },
      senderAccountId: context.treasury.accountId,
      recipientAccountId: input.recipientAccountId,
      hbarPriceUsd: input.hbarPriceUsd,
      settlementMode: context.treasury.mode,
    });
    const released = releasePayout(reserved);
    return {
      payout: await deps.hederaAdapter.settlePayout(released),
    };
  },
};

export const checkAgentStakeTool: ClawfiTool<{ agentName: string }, { staked: boolean; balance: number }> = {
  name: "checkAgentStake",
  description: "Checks if an agent has the required $CLAW stake (1,000 CLAW) to participate in the marketplace.",
  async execute({ deps }) {
    const tokenId = process.env.CLAWFI_REWARD_TOKEN_ID;
    if (!tokenId) return { staked: true, balance: 1000 }; // Fallback for demo if token not set

    const balances = await deps.hederaAdapter.readBalances();
    // In a real decentralized setup, we'd check the agent's specific account.
    // For the demo, we check if the treasury has associated the token and has a pool.
    const clawBalance = balances.find(b => b.hederaTokenId === tokenId)?.quantity ?? 0;
    
    return {
      staked: clawBalance >= 1000,
      balance: clawBalance
    };
  }
};

export const slashAgentStakeTool: ClawfiTool<{ agentName: string; amount: number; reason: string }, { slashed: boolean; transactionId: string }> = {
  name: "slashAgentStake",
  description: "Slashes an agent's stake for malicious or hallucinated proposals.",
  async execute({ input, deps }) {
    // In real mode, this would be a Burn or Transfer to a dead address.
    const result = await deps.hederaAdapter.publishHcsMessage(
      deps.hederaCore.consensus.getBidsTopicId() || "0.0.unknown",
      {
        type: "slash",
        agentName: input.agentName,
        amount: input.amount,
        reason: input.reason,
        timestamp: new Date().toISOString()
      }
    );
    return { slashed: true, transactionId: result.transactionId };
  }
};

export const getTreasuryAccountStateTool: ClawfiTool<Record<string, never>, { accountId: string; network: string; mode: string }> =
  {
    name: "getTreasuryAccountState",
    description: "Returns the treasury account identity and integration mode.",
    execute({ context }) {
      return Promise.resolve({
        accountId: context.treasury.accountId,
        network: context.treasury.network,
        mode: context.treasury.mode,
      });
    },
  };

export const logExecutionEventTool: ClawfiTool<
  {
    eventType: "execution_simulated" | "execution_prepared" | "execution_scheduled" | "execution_approved" | "execution_cancelled";
    taskId?: string;
    payload: Record<string, unknown>;
  },
  ReceiptResult
> = {
  name: "logExecutionEvent",
  description: "Records execution lifecycle events as Hedera receipts.",
  async execute({ input, context, deps }) {
    const receipt = makeReceipt({
      eventType: input.eventType,
      taskId: input.taskId,
      payload: input.payload,
      accountId: context.treasury.accountId,
      network: context.treasury.network,
      settlementMode: context.treasury.mode,
    });
    return {
      receipt: await deps.hederaCore.consensus.publishReceipt({ receipt }),
    };
  },
};

export const getMirrorReceiptHistoryTool: ClawfiTool<
  { receipts: import("../core/models/schemas").Receipt[] },
  MirrorReceiptHistoryResult
> = {
  name: "getMirrorReceiptHistory",
  description: "Returns mirror-style receipt history views for auditability.",
  async execute({ input, deps }) {
    return {
      history: await deps.hederaCore.mirror.getMirrorReceiptHistory({
        receipts: input.receipts,
      }),
    };
  },
};

export const getAuditTrailTool: ClawfiTool<
  {
    receipts: import("../core/models/schemas").Receipt[];
    payouts: import("../core/models/schemas").Payout[];
    scheduledExecutions: import("../core/models/schemas").ScheduledExecution[];
  },
  AuditTrailResult
> = {
  name: "getAuditTrail",
  description: "Returns unified mirror-style audit records across receipts, schedule, and rewards.",
  async execute({ input, deps }) {
    return {
      auditTrail: await deps.hederaCore.mirror.getAuditTrail({
        receipts: input.receipts,
        payouts: input.payouts,
        scheduledExecutions: input.scheduledExecutions,
      }),
    };
  },
};
