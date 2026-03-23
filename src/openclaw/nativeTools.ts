import { runServerSession } from "../../server/runSession";
import { buildDemoTreasury, demoStrategyConfig, seededDefiOpportunities, seededTokenOpportunities } from "../data/demoScenario";
import { buildDefiActions } from "../engines/defiStrategyEngine";
import { reviewActionPlan } from "../engines/riskEngine";
import { buildTokenTradingActions } from "../engines/tokenTradingEngine";
import {
  plannedActionSchema,
  strategyConfigSchema,
  type PlannedAction,
  type StrategyConfig,
} from "../domain/schemas";
import { deriveGoalIntent } from "../orchestration/goalIntent";

type JsonSchema = Record<string, unknown>;

type OpenClawToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
};

export type OpenClawNativeToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
  optional?: boolean;
  execute(id: string, params: Record<string, unknown>): Promise<OpenClawToolResult>;
};

const strategyConfigParameterSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reservePercent: { type: "number", minimum: 0, maximum: 100 },
    tradingPercent: { type: "number", minimum: 0, maximum: 100 },
    defiPercent: { type: "number", minimum: 0, maximum: 100 },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    maxTokenExposurePercent: { type: "number", minimum: 0, maximum: 100 },
    maxProtocolExposurePercent: { type: "number", minimum: 0, maximum: 100 },
    minLiquidityThresholdUsd: { type: "number", minimum: 0 },
    maxSlippageBps: { type: "number", minimum: 0 },
    targetYieldApy: { type: "number", minimum: 0 },
    simulateOnly: { type: "boolean" },
    approvalRequired: { type: "boolean" },
  },
};

const plannedActionParameterSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    actionType: {
      type: "string",
      enum: ["buy_token", "allocate_defi", "hold_reserve", "pay_reward"],
    },
    title: { type: "string" },
    assetSymbol: { type: "string" },
    venue: { type: "string" },
    targetAllocationUsd: { type: "number", minimum: 0 },
    targetAllocationPercent: { type: "number", minimum: 0 },
    expectedReturnPercent: { type: "number" },
    riskLabel: { type: "string", enum: ["low", "medium", "high"] },
    reason: { type: "string" },
    opportunityId: { type: "string" },
    guardrails: { type: "array", items: { type: "string" } },
    status: {
      type: "string",
      enum: ["draft", "approved", "resized", "rejected", "simulated"],
    },
  },
  required: [
    "id",
    "actionType",
    "title",
    "assetSymbol",
    "venue",
    "targetAllocationUsd",
    "targetAllocationPercent",
    "expectedReturnPercent",
    "riskLabel",
    "reason",
    "guardrails",
    "status",
  ],
};

function textResult(text: string, structuredContent?: unknown): OpenClawToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent === undefined ? {} : { structuredContent }),
  };
}

function resolveStrategyConfig(input: unknown): StrategyConfig {
  return strategyConfigSchema.parse({
    ...demoStrategyConfig,
    ...(isObject(input) ? input : {}),
  });
}

function parseDraftActions(input: unknown): PlannedAction[] {
  const actions = Array.isArray(input) ? input : [];
  return actions.map((action) => plannedActionSchema.parse(action));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildNativeOpenClawTools(): OpenClawNativeToolDefinition[] {
  return [
    {
      name: "clawfi_get_policy_defaults",
      description: "Returns ClawFi's default strategy policy object for OpenClaw agents.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      execute() {
        return Promise.resolve(textResult(
          "Loaded ClawFi default policy controls for reserve split, exposure caps, slippage, and approvals.",
          { strategyConfig: demoStrategyConfig },
        ));
      },
    },
    {
      name: "clawfi_get_demo_context",
      description:
        "Returns the demo treasury plus seeded Hedera token and DeFi opportunities under the requested policy.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          strategyConfig: strategyConfigParameterSchema,
        },
      },
      execute(_id, params) {
        const strategyConfig = resolveStrategyConfig(params.strategyConfig);
        const treasury = buildDemoTreasury(strategyConfig);
        return Promise.resolve(textResult(
          `Prepared demo treasury context with ${seededTokenOpportunities.length} token opportunities and ${seededDefiOpportunities.length} DeFi opportunities.`,
          {
            strategyConfig,
            treasury,
            tokenOpportunities: seededTokenOpportunities,
            defiOpportunities: seededDefiOpportunities,
          },
        ));
      },
    },
    {
      name: "clawfi_build_candidate_plan",
      description:
        "Builds deterministic draft token and DeFi allocation actions from the seeded Hedera opportunity set.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          goal: { type: "string" },
          strategyConfig: strategyConfigParameterSchema,
        },
      },
      execute(_id, params) {
        const strategyConfig = resolveStrategyConfig(params.strategyConfig);
        const treasury = buildDemoTreasury(strategyConfig);
        const goal = typeof params.goal === "string" ? params.goal : "";
        const intent = deriveGoalIntent(goal);
        const token = buildTokenTradingActions({
          treasury,
          config: strategyConfig,
          opportunities: seededTokenOpportunities,
          intent,
        });
        const defi = buildDefiActions({
          treasury,
          config: strategyConfig,
          opportunities: seededDefiOpportunities,
          intent,
        });
        const draftActions = [...token.actions, ...defi.actions];
        return Promise.resolve(textResult(
          `Built ${draftActions.length} deterministic draft actions from the seeded Hedera market context.`,
          {
            goal,
            strategyConfig,
            treasury,
            draftActions,
            tokenShortlist: token.shortlistedOpportunities,
            defiShortlist: defi.shortlistedOpportunities,
          },
        ));
      },
    },
    {
      name: "clawfi_review_action_plan",
      description:
        "Runs ClawFi's deterministic policy engine against draft actions and returns approvals, rejections, and resizes.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          draftActions: {
            type: "array",
            items: plannedActionParameterSchema,
          },
          strategyConfig: strategyConfigParameterSchema,
        },
        required: ["draftActions"],
      },
      execute(_id, params) {
        const strategyConfig = resolveStrategyConfig(params.strategyConfig);
        const treasury = buildDemoTreasury(strategyConfig);
        const draftActions = parseDraftActions(params.draftActions);
        const review = reviewActionPlan({
          draftActions,
          treasury,
          config: strategyConfig,
          tokenOpportunities: seededTokenOpportunities,
          defiOpportunities: seededDefiOpportunities,
        });
        return Promise.resolve(textResult(
          `Policy review finished with status ${review.riskDecision.status} across ${draftActions.length} draft actions.`,
          {
            strategyConfig,
            treasury,
            ...review,
          },
        ));
      },
    },
    {
      name: "clawfi_run_workflow",
      description:
        "Runs the full ClawFi treasury workflow and returns the action plan, risk decision, execution preview, receipts, and payouts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          goal: { type: "string" },
          hederaMode: {
            type: "string",
            enum: ["simulated", "real_scaffolded", "wallet_connected"],
          },
          autoApprove: { type: "boolean" },
          walletAccountId: { type: "string" },
          strategyConfig: strategyConfigParameterSchema,
        },
      },
      async execute(_id, params) {
        const strategyConfig = resolveStrategyConfig(params.strategyConfig);
        const result = await runServerSession({
          goal: typeof params.goal === "string" ? params.goal : undefined,
          hederaMode:
            params.hederaMode === "real_scaffolded" || params.hederaMode === "wallet_connected"
              ? params.hederaMode
              : "simulated",
          autoApprove: typeof params.autoApprove === "boolean" ? params.autoApprove : false,
          walletAccountId: typeof params.walletAccountId === "string" ? params.walletAccountId : undefined,
          strategyConfig,
        });
        return textResult(
          `ClawFi completed a ${result.hederaStatus.mode} workflow with ${result.actionPlan.actions.length} surviving actions and policy state ${result.actionPlan.approvalState}.`,
          {
            sessionId: result.sessionId,
            hederaStatus: result.hederaStatus,
            strategyConfig: result.strategyConfig,
            actionPlan: result.actionPlan,
            riskDecision: result.riskDecision,
            executionPreview: result.executionPreview,
            simulationResult: result.simulationResult,
            receipts: result.receipts,
            payouts: result.payouts,
          },
        );
      },
    },
  ];
}
