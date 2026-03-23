import { agentPrompts } from "../agents/prompts";
import { AgentRuntime, type AgentDefinition } from "../agents/runtime";
import { demoGoal, demoStrategyConfig } from "../core/scenarios/demoScenario";
import {
  actionPlanSchema,
  activityLogEntrySchema,
  rewardReservationSchema,
  scheduledExecutionSchema,
  simulationResultSchema,
  strategyConfigSchema,
  treasurySchema,
  workflowResultSchema,
  type ActivityLogEntry,
  type HederaMode,
  type PlannedAction,
  type Receipt,
  type RewardReservation,
  type ScheduledExecution,
  type StrategyConfig,
  type Treasury,
  type UserAgentConfig,
  type WorkflowResult,
} from "../core/models/schemas";
import { createHederaCore } from "../hedera/adapters/createHederaCore";
import { reviewActionPlan } from "../risk-engine/policyEngine";
import type { ExecutionPreview, SimulationResult } from "../domain/schemas";

import { createReceipt } from "../hedera/receiptFactory";
import { cancelAgentReward, releaseAgentReward } from "../hedera/rewards/engine";
import { resolveAgentRecipientAccountId } from "../hedera/runtimeConfig";
import { SimulatedHederaTreasuryAdapter } from "../hedera/simulatedHederaAdapter";
import type { HederaTreasuryAdapter } from "../hedera/treasuryAdapter";
import { createExecutionUcpInvoice } from "../hedera/ucp";
import { createId, isoNow } from "../lib/ids";
import { clawfiOpenclawManifest } from "../openclaw/manifest";
import { AiProviderFactory } from "../providers/aiProviderFactory";
import { buildDefiActions } from "../engines/defiStrategyEngine";
import { buildTokenTradingActions } from "../engines/tokenTradingEngine";
import { MockDefiOpportunityProvider } from "../providers/mockDefiOpportunityProvider";
import { MockTokenMarketProvider } from "../providers/mockTokenMarketProvider";
import type { DefiOpportunityProvider, TokenMarketProvider } from "../providers/interfaces";

function createReasoningHash(input: { prompt: string; facts: string[] }) {
  const text = `${input.prompt}|${input.facts.join("|")}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
import { RealDefiOpportunityProvider } from "../providers/realDefiOpportunityProvider";
import { MockExecutionSimulatorProvider } from "../providers/mockExecutionProvider";
import { RealExecutionProvider } from "../providers/realExecutionProvider";
import { RealTokenMarketProvider } from "../providers/realTokenMarketProvider";
import { MockWalletProvider } from "../providers/mockWalletProvider";
import { createClawfiToolRegistry } from "../tools/registerAllTools";
import type { ClawfiToolName } from "../tools/types";
import { deriveGoalIntent, summarizeGoalIntent } from "./goalIntent";

export type WorkflowRunOptions = {
  goal?: string;
  strategyConfig?: StrategyConfig;
  treasuryOverride?: Treasury;
  hederaAdapterOverride?: HederaTreasuryAdapter;
  hederaMode?: HederaMode;
  autoApprove?: boolean;
  userAgents?: UserAgentConfig[];
};

export async function runClawFiWorkflow(options: WorkflowRunOptions = {}): Promise<WorkflowResult> {
  const sessionId = createId("session");
  const walletProvider = new MockWalletProvider();
  const hederaAdapterMode = options.hederaMode ?? "simulated"; // Or based on adapter
  const strategyConfig = strategyConfigSchema.parse(options.strategyConfig ?? demoStrategyConfig);
  const tokenProvider: TokenMarketProvider =
    hederaAdapterMode === "real_scaffolded" ? new RealTokenMarketProvider() : new MockTokenMarketProvider();
  const defiProvider: DefiOpportunityProvider =
    hederaAdapterMode === "real_scaffolded" ? new RealDefiOpportunityProvider() : new MockDefiOpportunityProvider();
  const executionProvider = hederaAdapterMode === "real_scaffolded" ? new RealExecutionProvider() : new MockExecutionSimulatorProvider();
  
  const aiProvider = new AiProviderFactory();
  const seedTreasury = options.treasuryOverride ?? (await walletProvider.readTreasury(strategyConfig));
  const envGeminiKey = process.env.GEMINI_API_KEY?.trim();
  const defaultAiAnalyst: UserAgentConfig[] =
    envGeminiKey && (!options.userAgents || options.userAgents.length === 0)
      ? [
          {
            id: "agent-default-gemini-analyst",
            name: "Gemini Strategy Analyst",
            role: "Strategy Analyst",
            provider: "gemini",
            model: "gemini-2.5-flash",
            apiKey: envGeminiKey,
            rewardUsd: 100,
            allowedTools: ["scanDefiOpportunities", "compareDefiStrategies", "buildTokenThesis"],
            systemPrompt:
              "You are ClawFi's strategy analyst. Interpret the treasury objective, call out tradeoffs, and suggest the best next allocation posture in concise, practical language.",
          },
        ]
      : [];
  const userAgents = options.userAgents?.length ? options.userAgents : defaultAiAnalyst;
  const hederaAdapter =
    options.hederaAdapterOverride ?? new SimulatedHederaTreasuryAdapter(seedTreasury.portfolio.positions);
  const treasury = reconcileTreasuryWithConfig({
    treasury: seedTreasury,
    strategyConfig,
    mode: options.hederaMode ?? hederaAdapter.mode,
  });
  const hederaCore = createHederaCore({
    mode: options.hederaMode ?? hederaAdapter.mode,
    treasury: hederaAdapter,
    treasuryState: treasury,
  });
  const goal = options.goal ?? demoGoal;
  const goalIntent = deriveGoalIntent(goal);
  const autoApprove = options.autoApprove ?? true;
  const requiresManualApproval = strategyConfig.approvalRequired && !autoApprove;
  const preferredNarrativeAgent =
    userAgents.find((agent) => agent.provider !== "mock" && agent.apiKey?.trim()) ??
    userAgents.find((agent) => agent.apiKey?.trim());

  const toolRegistry = createClawfiToolRegistry({
    walletProvider,
    tokenProvider,
    defiProvider,
    executionProvider,
    hederaAdapter,
    hederaCore,
  });
  const runtime = new AgentRuntime({
    sessionId,
    registry: toolRegistry,
    toolContext: {
      treasury,
      strategyConfig,
    },
  });

  const activityLog: ActivityLogEntry[] = [
    activityLogEntrySchema.parse({
      id: createId("log"),
      timestamp: isoNow(),
      actor: "System",
      stage: "goal_received",
      message: "OpenClaw-aligned ClawFi session created for Hedera-aware treasury orchestration.",
      tone: "system",
    }),
  ];
  const coordinationTopic = await hederaCore.consensus.createCoordinationTopic({
    label: "clawfi-coordination",
  });
  const receipts: WorkflowResult["receipts"] = [];
  const scheduledExecutions: ScheduledExecution[] = [];
  const rewardReservations: RewardReservation[] = [];
const coordinatorDefinition: AgentDefinition<
  { goal: string },
  {
    taskBreakdown: string[];
    treasuryStateSummary: string;
    budgetSummary?: string;
  }
> = {
  name: "Coordinator",
  title: "Route treasury goal and synthesize outputs",
  prompt: agentPrompts.coordinator,
  rewardUsd: 280,
  allowedTools: ["getTreasuryBalances", "getPortfolioState", "reserveBudget", "buildAllocationPlan", "checkAgentStake"],
  async execute(_input, context) {
    await context.callTool<{ agentName: string }, { staked: boolean; balance: number }>("checkAgentStake", { agentName: "Specialists" });
    const balances = await context.callTool<Record<string, never>, { balances: Array<{ symbol: string }> }>(
        "getTreasuryBalances",
        {},
      );
      const portfolio = await context.callTool<Record<string, never>, { totalValueUsd: number }>(
        "getPortfolioState",
        {},
      );
      await context.callTool("reserveBudget", {});

      return {
        summary: `Coordinator decomposed the goal into token, DeFi, risk, execution, and reporting tasks with ${summarizeGoalIntent(goalIntent)} intent.`,
        confidence: 93,
        output: {
          taskBreakdown: [
            "Collect treasury, policy, and budget state.",
            "Run token and DeFi specialist analyses through allowlisted tools.",
            "Apply deterministic risk policy and produce execution previews.",
          ],
          treasuryStateSummary: `${balances.balances.length} assets across a ${portfolio.totalValueUsd.toFixed(0)} USD treasury.`,
          budgetSummary: summarizeGoalIntent(goalIntent),
        },
      };
    },
  };

  const coordinatorRun = await runtime.run(coordinatorDefinition, { goal }, activityLog);
  const rfpTopicId = hederaCore.consensus.getRfpTopicId();
  if (rfpTopicId) {
    await hederaCore.consensus.publishMessage({
      topicId: rfpTopicId,
      message: {
        type: "rfp",
        sessionId,
        goal,
        budgets: coordinatorRun.output?.budgetSummary,
        timestamp: isoNow(),
      },
    });
  }

  const bidsTopicId = hederaCore.consensus.getBidsTopicId();

  const tokenDefinition: AgentDefinition<
    { goal: string },
    {
      shortlistedOpportunities: Awaited<ReturnType<TokenMarketProvider["listOpportunities"]>>;
      actions: PlannedAction[];
      theses: Array<{
        opportunityId: string;
        thesis: string;
        suggestedSizingPercent: number;
      }>;
    }
  > = {
    name: "Token Research",
    title: "Analyze token opportunities",
    prompt: agentPrompts.tokenResearch,
    rewardUsd: 180,
    allowedTools: [
      "getTokenMarketData",
      "scanTokenOpportunities",
      "getTokenLiquidityProfile",
      "buildTokenThesis",
    ],
    async execute(_, context) {
      const marketData = await context.callTool<
        { minLiquidityUsd?: number },
        { opportunities: Awaited<ReturnType<TokenMarketProvider["listOpportunities"]>> }
      >("getTokenMarketData", { minLiquidityUsd: strategyConfig.minLiquidityThresholdUsd });
      const shortlist = buildTokenTradingActions({
        treasury,
        config: strategyConfig,
        opportunities: marketData.opportunities,
        intent: goalIntent,
      }).shortlistedOpportunities;
      const theses = await Promise.all(
        shortlist.map((opportunity) =>
          context.callTool<{ opportunityId: string }, { opportunityId: string; thesis: string; suggestedSizingPercent: number }>(
            "buildTokenThesis",
            { opportunityId: opportunity.id },
          ),
        ),
      );
      const actions = buildTokenTradingActions({
        treasury,
        config: strategyConfig,
        opportunities: shortlist,
        intent: goalIntent,
      }).actions;

      if (bidsTopicId) {
        await hederaCore.consensus.publishMessage({
          topicId: bidsTopicId,
          message: {
            type: "bid",
            agentName: "Token Research",
            sessionId,
            proposedActionCount: actions.length,
            timestamp: isoNow(),
          },
        });
      }

      return {
        summary: `Token agent shortlisted ${actions.length} Hedera token opportunities for ${summarizeGoalIntent(goalIntent)}.`,
        confidence: 87,
        output: {
          shortlistedOpportunities: shortlist,
          actions,
          theses,
        },
      };
    },
  };

  const defiDefinition: AgentDefinition<
    { goal: string },
    {
      shortlistedOpportunities: Awaited<ReturnType<DefiOpportunityProvider["listOpportunities"]>>;
      actions: PlannedAction[];
    }
  > = {
    name: "DeFi Strategy",
    title: "Analyze DeFi opportunities",
    prompt: agentPrompts.defiStrategy,
    rewardUsd: 180,
    allowedTools: [
      "scanDefiOpportunities",
      "compareDefiStrategies",
      "getProtocolRiskSummary",
      "estimateYieldOutcomes",
    ],
    async execute(_, context) {
      const marketData = await context.callTool<
        { topN: number },
        { opportunities: Awaited<ReturnType<DefiOpportunityProvider["listOpportunities"]>> }
      >("scanDefiOpportunities", { topN: 5 });
      const shortlist = buildDefiActions({
        treasury,
        config: strategyConfig,
        opportunities: marketData.opportunities,
        intent: goalIntent,
      }).shortlistedOpportunities;
      const actions = buildDefiActions({
        treasury,
        config: strategyConfig,
        opportunities: shortlist,
        intent: goalIntent,
      }).actions;

      if (bidsTopicId) {
        await hederaCore.consensus.publishMessage({
          topicId: bidsTopicId,
          message: {
            type: "bid",
            agentName: "DeFi Strategy",
            sessionId,
            proposedActionCount: actions.length,
            timestamp: isoNow(),
          },
        });
      }

      return {
        summary: `DeFi agent shortlisted ${actions.length} treasury-compatible yield sleeves for ${summarizeGoalIntent(goalIntent)}.`,
        confidence: 89,
        output: {
          shortlistedOpportunities: shortlist,
          actions,
        },
      };
    },
  };

  const [tokenRun, defiRun, ...userRuns] = await Promise.all([
    runtime.run(tokenDefinition, { goal }, activityLog),
    runtime.run(defiDefinition, { goal }, activityLog),
    ...userAgents.map((config) => {
      const definition: AgentDefinition<{ goal: string }, { narrative: string }> = {
        name: config.name,
        title: config.role,
        prompt: config.systemPrompt,
        rewardUsd: config.rewardUsd,
        allowedTools: config.allowedTools as ClawfiToolName[],
        async execute() {
          const facts = [
            `User goal: ${goal}`,
            `Agent role: ${config.role}`,
            `Treasury balance: ${treasury.portfolio.totalValueUsd}`,
            `Trading budget: ${treasury.budgets.tradingBudgetUsd}`,
            `DeFi budget: ${treasury.budgets.defiBudgetUsd}`,
            `Risk level: ${strategyConfig.riskLevel}`,
            `Goal intent: ${summarizeGoalIntent(goalIntent)}`,
            `Allowed tools: ${config.allowedTools.join(", ") || "none"}`,
            `Top token opportunities: ${tokenProvider instanceof MockTokenMarketProvider ? "demo market" : "live provider"} available`,
            `Top DeFi opportunities: ${defiProvider instanceof MockDefiOpportunityProvider ? "demo market" : "live provider"} available`,
          ];
          const result = await aiProvider.generateNarrative({
            systemPrompt: config.systemPrompt,
            userPrompt:
              `Act as ${config.name}, a ${config.role}. Produce a concise recommendation for this treasury goal, ` +
              `state what you would do next, and mention whether the current setup appears simulated or live.`,
            facts,
            model: config.model,
            apiKey: config.apiKey,
            provider: config.provider,
          });
          return {
            summary: `${config.name} (${config.provider}) recommendation ready.`,
            confidence: 90,
            output: { narrative: result },
          };
        },
      };
      return runtime.run(definition, { goal }, activityLog);
    }),
  ]);

  if (!tokenRun.output || !defiRun.output) {
    throw new Error("Specialist agents did not return valid opportunity outputs.");
  }
  const tokenOutput = tokenRun.output;
  const defiOutput = defiRun.output;

  const riskDefinition: AgentDefinition<
    {
      tokenOpportunityIds: string[];
      defiOpportunityIds: string[];
    },
    ReturnType<typeof reviewActionPlan>
  > = {
    name: "Risk",
    title: "Review draft allocation plan",
    prompt: agentPrompts.risk,
    rewardUsd: 220,
    allowedTools: ["buildAllocationPlan", "getPortfolioState", "recordDecisionReceipt", "slashAgentStake"],
    async execute(input, context) {
      const draft = await context.callTool<
        { tokenOpportunityIds: string[]; defiOpportunityIds: string[] },
        { actions: PlannedAction[] }
      >("buildAllocationPlan", {
        tokenOpportunityIds: input.tokenOpportunityIds,
        defiOpportunityIds: input.defiOpportunityIds,
      });
      const facts = [
        `Draft Plan: ${JSON.stringify(draft.actions)}`,
        `Risk Policy: ${strategyConfig.riskLevel}`,
        `Treasury Mode: ${treasury.mode}`,
        `Total Value: $${treasury.portfolio.totalValueUsd}`,
      ];
      const reasoningHash = createReasoningHash({ prompt: agentPrompts.risk, facts });
      const review = reviewActionPlan({
        draftActions: draft.actions,
        treasury,
        config: strategyConfig,
        tokenOpportunities: tokenOutput.shortlistedOpportunities,
        defiOpportunities: defiOutput.shortlistedOpportunities,
      });

      if (review.riskDecision.status === "rejected") {
        await context.callTool<{ agentName: string; amount: number; reason: string }, { slashed: boolean }>("slashAgentStake", {
          agentName: "Malicious Proposer",
          amount: 500,
          reason: "Proposal violated critical risk constraints or attempted malicious trade."
        });
      }

      await context.callTool<
        { eventType: "risk_review_completed" | "risk_rejected" | "allocation_finalized"; payload: Record<string, unknown> },
        { receipt: { id: string } }
      >("recordDecisionReceipt", {
        eventType: "risk_review_completed",
        payload: {
          status: review.riskDecision.status,
          actionCount: review.actionPlan.actions.length,
          reasoningHash,
        },
      });

      return {
        summary: review.riskDecision.status === "approved"
            ? "Risk agent approved the plan without changes."
            : "Risk agent approved the plan with changes and explicit rejections.",
        confidence: 91,
        output: review,
      };
    },
  };

  const riskRun = await runtime.run(
    riskDefinition,
    {
      tokenOpportunityIds: tokenRun.output.shortlistedOpportunities.map((item) => item.id),
      defiOpportunityIds: defiRun.output.shortlistedOpportunities.map((item) => item.id),
    },
    activityLog,
  );

  const executionDefinition: AgentDefinition<
    { actions: PlannedAction[] },
    {
      executionPreview: ExecutionPreview;
      simulationResult: SimulationResult;
      scheduledExecutions: ScheduledExecution[];
      executionReceipts: Receipt[];
    }
  > = {
    name: "Execution",
    title: "Prepare simulation and execution preview",
    prompt: agentPrompts.execution,
    rewardUsd: 140,
    allowedTools: [
      "simulateTradeAction",
      "simulateDefiAction",
      "buildExecutionPreview",
      "createScheduledExecution",
      "getScheduledExecutionStatus",
      "logExecutionEvent",
    ],
    async execute(input, context) {
      for (const action of input.actions) {
        if (action.actionType === "buy_token") {
          await context.callTool<
            { actionId: string; amountUsd: number; expectedReturnPercent: number },
            { actionId: string }
          >("simulateTradeAction", {
            actionId: action.id,
            amountUsd: action.targetAllocationUsd,
            expectedReturnPercent: action.expectedReturnPercent,
          });
        } else {
          await context.callTool<
            { actionId: string; amountUsd: number; expectedReturnPercent: number },
            { actionId: string }
          >("simulateDefiAction", {
            actionId: action.id,
            amountUsd: action.targetAllocationUsd,
            expectedReturnPercent: action.expectedReturnPercent,
          });
        }
      }

      const executionPreview = await context.callTool<
        {
          actions: Array<{
            title: string;
            amountUsd: number;
            venue: string;
            requiresApproval: boolean;
            actionType: string;
            assetSymbol: string;
          }>;
        },
        ExecutionPreview
      >("buildExecutionPreview", {
        actions: input.actions.map((action) => ({
          title: action.title,
          amountUsd: action.targetAllocationUsd,
          venue: action.venue,
          requiresApproval: strategyConfig.approvalRequired,
          actionType: action.actionType,
          assetSymbol: action.assetSymbol,
        })),
      });

      const simulationCore = await executionProvider.simulate({
        treasury,
        actionPlanActions: input.actions.map((action) => ({
          title: action.title,
          amountUsd: action.targetAllocationUsd,
          expectedReturnPercent: action.expectedReturnPercent,
        })),
      });

      const executionSimulatedReceipt = await context.callTool<
        {
          eventType: "execution_simulated" | "execution_prepared" | "execution_scheduled" | "execution_approved" | "execution_cancelled";
          taskId?: string;
          payload: Record<string, unknown>;
        },
        { receipt: Receipt }
      >("logExecutionEvent", {
        eventType: "execution_simulated",
        payload: {
          stepCount: executionPreview.steps.length,
          mode: executionPreview.mode,
        },
      });
      const executionPreparedReceipt = await context.callTool<
        {
          eventType: "execution_simulated" | "execution_prepared" | "execution_scheduled" | "execution_approved" | "execution_cancelled";
          taskId?: string;
          payload: Record<string, unknown>;
        },
        { receipt: Receipt }
      >("logExecutionEvent", {
        eventType: "execution_prepared",
        payload: {
          settlementPath: executionPreview.settlementPath,
        },
      });

      const schedules: ScheduledExecution[] = [];
      const scheduleReceipts: Receipt[] = [];
      for (const action of input.actions) {
        const scheduledPreviewStep = executionPreview.steps.find(
          (step: { id: string; title: string }) => step.id === action.title || step.title === action.title,
        );
        const ucpInvoice = createExecutionUcpInvoice({
          accountId: treasury.accountId,
          actionTitle: action.title,
          estimatedNetworkFeesUsd: scheduledPreviewStep?.estimatedCostUsd ?? 0,
        });
        const scheduled = await context.callTool<
          {
            actionId: string;
            actionTitle: string;
            preview: string;
            approvalRequired: boolean;
            ucpInvoice?: ScheduledExecution["ucpInvoice"];
            innerTx?: unknown;
          },
          { scheduledExecution: ScheduledExecution }
        >("createScheduledExecution", {
          actionId: action.id,
          actionTitle: action.title,
          preview: `Awaiting Hedera schedule approval flow for ${action.title}.`,
          approvalRequired: strategyConfig.approvalRequired,
          ucpInvoice,
          innerTx: (scheduledPreviewStep as unknown as { innerTx: unknown })?.innerTx,
        });
        schedules.push(scheduledExecutionSchema.parse(scheduled.scheduledExecution));
        const scheduleReceipt = await context.callTool<
          {
            eventType: "execution_simulated" | "execution_prepared" | "execution_scheduled" | "execution_approved" | "execution_cancelled";
            taskId?: string;
            payload: Record<string, unknown>;
          },
          { receipt: Receipt }
        >("logExecutionEvent", {
          eventType: "execution_scheduled",
          payload: {
            actionId: action.id,
            actionTitle: action.title,
            scheduleId: scheduled.scheduledExecution.scheduleId ?? scheduled.scheduledExecution.id,
            status: scheduled.scheduledExecution.status,
            estimatedNetworkFeesUsd: scheduled.scheduledExecution.ucpInvoice?.amount ?? 0,
            ucpInvoice: scheduled.scheduledExecution.ucpInvoice,
          },
        });
        scheduleReceipts.push(scheduleReceipt.receipt);
      }

      return {
        summary: "Execution agent produced a simulation-first preview with deterministic action-level estimates.",
        confidence: 86,
        output: {
          executionPreview,
          simulationResult: simulationResultSchema.parse({
            ...simulationCore,
            summary:
              "The simulated plan preserves reserve coverage above target while projecting positive monthly carry from yield sleeves and token beta.",
          }),
          scheduledExecutions: schedules,
          executionReceipts: [
            executionSimulatedReceipt.receipt,
            executionPreparedReceipt.receipt,
            ...scheduleReceipts,
          ],
        },
      };
    },
  };

  const executionRun = await runtime.run(
    executionDefinition,
    { actions: riskRun.output?.actionPlan.actions ?? [] },
    activityLog,
  );

  const reporterDefinition: AgentDefinition<
    { riskStatus: string; rejected: string[]; actionCount: number; userNarratives: string[] },
    { narrative: string }
  > = {
    name: "Reporter",
    title: "Generate operator-facing rationale",
    prompt: agentPrompts.reporter,
    rewardUsd: 120,
    allowedTools: ["getTreasuryAccountState"],
    async execute(input, context) {
      const accountState = await context.callTool<Record<string, never>, { accountId: string; network: string }>(
        "getTreasuryAccountState",
        {},
      );
      const narrative = await aiProvider.generateNarrative({
        systemPrompt:
          "Reporter Agent: explain the approved ClawFi strategy in clear treasury language.",
        userPrompt:
          "Summarize approved allocations, rejected opportunities, OpenClaw tool governance, and Hedera receipts/rewards.",
        facts: [
          `${input.actionCount} actions survived policy review.`,
          `Risk status: ${input.riskStatus}.`,
          `Rejected opportunities: ${input.rejected.join(", ") || "none"}.`,
          `Treasury account ${accountState.accountId} on ${accountState.network}.`,
          `Settlement mode: ${treasury.mode}.`,
          `Goal intent: ${summarizeGoalIntent(goalIntent)}.`,
          ...input.userNarratives.map((n, i) => `Custom Agent ${i + 1} finding: ${n}`),
        ],
        provider: preferredNarrativeAgent?.provider,
        model: preferredNarrativeAgent?.model,
        apiKey: preferredNarrativeAgent?.apiKey,
      });

      return {
        summary: "Reporter agent generated the final operator narrative.",
        confidence: 82,
        output: { narrative },
      };
    },
  };

  const reporterRun = await runtime.run(
    reporterDefinition,
    {
      riskStatus: riskRun.output?.riskDecision?.status ?? "rejected",
      rejected: riskRun.output?.riskDecision?.rejectedOpportunityIds ?? [],
      actionCount: riskRun.output?.actionPlan?.actions?.length ?? 0,
      userNarratives: userRuns.map((r) => r.result.summary),
    },
    activityLog,
  );

  if (!riskRun.output || !executionRun.output || !reporterRun.output) {
    throw new Error("One or more downstream agents failed to produce typed outputs.");
  }



  const finalActionPlan = requiresManualApproval
    ? actionPlanSchema.parse({
        ...riskRun.output.actionPlan,
        approvalState: "pending",
        notes: [
          ...riskRun.output.actionPlan.notes, 
          "Manual approval is required before execution settlements.",
          `HCS Audit: Reasoning Hashes verified for all participating agents.`,
          `Goal intent interpreted as ${summarizeGoalIntent(goalIntent)}.`
        ],
      })
    : riskRun.output.actionPlan;

  const tasks = [
    coordinatorRun.task,
    tokenRun.task,
    defiRun.task,
    ...userRuns.map((run) => run.task),
    riskRun.task,
    executionRun.task,
    reporterRun.task,
  ];
  const agentResults = [
    coordinatorRun.result,
    tokenRun.result,
    defiRun.result,
    ...userRuns.map((run) => run.result),
    riskRun.result,
    executionRun.result,
    reporterRun.result,
  ];
  scheduledExecutions.push(...executionRun.output.scheduledExecutions.map((entry) => scheduledExecutionSchema.parse(entry)));

  receipts.push(
    await hederaCore.consensus.publishReceipt({
      topicId: coordinationTopic.topicId,
      receipt: createReceipt({
        eventType: "token_analysis_generated",
        accountId: treasury.accountId,
        network: treasury.network,
        settlementMode: hederaAdapter.mode,
        payload: {
          shortlisted: tokenRun.output.shortlistedOpportunities.length,
          theses: tokenRun.output.theses.length,
        },
      }),
    }),
  );
  receipts.push(
    await hederaCore.consensus.publishReceipt({
      topicId: coordinationTopic.topicId,
      receipt: createReceipt({
        eventType: "defi_analysis_generated",
        accountId: treasury.accountId,
        network: treasury.network,
        settlementMode: hederaAdapter.mode,
        payload: {
          shortlisted: defiRun.output.shortlistedOpportunities.length,
        },
      }),
    }),
  );
  receipts.push(
    await hederaCore.consensus.publishReceipt({
      topicId: coordinationTopic.topicId,
      receipt: createReceipt({
        eventType: "risk_review_completed",
        accountId: treasury.accountId,
        network: treasury.network,
        settlementMode: hederaAdapter.mode,
        payload: {
          status: riskRun.output.riskDecision.status,
          findings: riskRun.output.riskDecision.findings.length,
        },
      }),
    }),
  );

  for (const task of tasks) {
    const taskStatusForReservation =
      task.status === "failed" ? "failed" : task.status === "completed" ? "completed" : "assigned";
    const reservedReward = await toolRegistry.invoke<
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
      { reservation: RewardReservation }
    >({
      name: "reserveAgentReward",
      input: {
        task: {
          ...task,
          status: taskStatusForReservation,
        },
      },
      context: {
        sessionId,
        agentName: "System",
        treasury,
        strategyConfig,
      },
      allowedTools: ["reserveAgentReward"],
    });
    rewardReservations.push(rewardReservationSchema.parse(reservedReward.reservation));
    receipts.push(
      await hederaCore.consensus.publishReceipt({
        topicId: coordinationTopic.topicId,
        receipt: createReceipt({
          eventType: "reward_reserved",
          accountId: treasury.accountId,
          network: treasury.network,
          settlementMode: hederaAdapter.mode,
          taskId: task.id,
          linkedIds: {
            taskId: task.id,
            agentName: task.agentName,
            rewardId: reservedReward.reservation.id,
          },
          payload: {
            agentName: task.agentName,
            rewardUsd: reservedReward.reservation.rewardUsd,
            reservationId: reservedReward.reservation.id,
          },
        }),
      }),
    );

    receipts.push(
      await hederaCore.consensus.publishReceipt({
        topicId: coordinationTopic.topicId,
        receipt: createReceipt({
          eventType: "task_created",
          accountId: treasury.accountId,
          network: treasury.network,
          settlementMode: hederaAdapter.mode,
          taskId: task.id,
          linkedIds: {
            taskId: task.id,
            agentName: task.agentName,
          },
          payload: {
            agentName: task.agentName,
            title: task.title,
          },
        }),
      }),
    );
    receipts.push(
      await hederaCore.consensus.publishReceipt({
        topicId: coordinationTopic.topicId,
        receipt: createReceipt({
          eventType: "task_assigned",
          accountId: treasury.accountId,
          network: treasury.network,
          settlementMode: hederaAdapter.mode,
          taskId: task.id,
          linkedIds: {
            taskId: task.id,
            agentName: task.agentName,
          },
          payload: {
            agentName: task.agentName,
            sessionId,
          },
        }),
      }),
    );
    receipts.push(
      await hederaCore.consensus.publishReceipt({
        topicId: coordinationTopic.topicId,
        receipt: createReceipt({
          eventType: "task_started",
          accountId: treasury.accountId,
          network: treasury.network,
          settlementMode: hederaAdapter.mode,
          taskId: task.id,
          linkedIds: {
            taskId: task.id,
            agentName: task.agentName,
          },
          payload: {
            agentName: task.agentName,
          },
        }),
      }),
    );
    receipts.push(
      await hederaCore.consensus.publishReceipt({
        topicId: coordinationTopic.topicId,
        receipt: createReceipt({
          eventType: task.status === "failed" ? "task_failed" : "task_completed",
          accountId: treasury.accountId,
          network: treasury.network,
          settlementMode: hederaAdapter.mode,
          taskId: task.id,
          linkedIds: {
            taskId: task.id,
            agentName: task.agentName,
          },
          payload: {
            agentName: task.agentName,
            status: task.status,
          },
        }),
      }),
    );
    if (!requiresManualApproval) {
      receipts.push(
        await hederaCore.consensus.publishReceipt({
          topicId: coordinationTopic.topicId,
          receipt: createReceipt({
            eventType: "task_approved",
            accountId: treasury.accountId,
            network: treasury.network,
            settlementMode: hederaAdapter.mode,
            taskId: task.id,
            linkedIds: {
              taskId: task.id,
              agentName: task.agentName,
            },
            payload: {
              agentName: task.agentName,
              approved: task.status === "completed",
            },
          }),
        }),
      );
    }
  }

  for (const opportunityId of riskRun.output.riskDecision.rejectedOpportunityIds) {
    receipts.push(
      await hederaCore.consensus.publishReceipt({
        topicId: coordinationTopic.topicId,
        receipt: createReceipt({
          eventType: "risk_rejected",
          accountId: treasury.accountId,
          network: treasury.network,
          settlementMode: hederaAdapter.mode,
          payload: {
            opportunityId,
            reason: "Rejected by policy engine for risk or slippage constraints.",
          },
        }),
      }),
    );
  }

  receipts.push(
    await hederaCore.consensus.publishReceipt({
      topicId: coordinationTopic.topicId,
      receipt: createReceipt({
        eventType: "allocation_finalized",
        accountId: treasury.accountId,
        network: treasury.network,
        settlementMode: hederaAdapter.mode,
        payload: {
          approvalState: finalActionPlan.approvalState,
          actionCount: finalActionPlan.actions.length,
        },
      }),
    }),
  );

  for (const receipt of executionRun.output.executionReceipts) {
    receipts.push(receipt);
  }

  const hbarPosition = treasury.portfolio.positions.find((position) => position.symbol === "HBAR");
  const hbarPriceUsd =
    typeof hbarPosition?.priceUsd === "number" && hbarPosition.priceUsd > 0 ? hbarPosition.priceUsd : 0.11;
  const payouts: WorkflowResult["payouts"] = [];
  const reservationByTask = new Map(rewardReservations.map((reservation) => [reservation.taskId, reservation]));
  for (const task of tasks.filter((item) => item.status === "failed")) {
    const reservation = reservationByTask.get(task.id);
    if (reservation) {
      const cancelled = cancelAgentReward(reservation);
      reservationByTask.set(task.id, cancelled);
    }
  }

  if (!requiresManualApproval) {
    for (const task of tasks.filter((item) => item.status === "completed")) {
      const reservedReward = reservationByTask.get(task.id);
      const payout = await toolRegistry.invoke<
        {
          task: { id: string; agentName: string; rewardUsd: number; status: "completed" };
          recipientAccountId: string;
          hbarPriceUsd: number;
        },
        { payout: WorkflowResult["payouts"][number] }
      >({
        name: "settleAgentReward",
        input: {
          task: {
            id: task.id,
            agentName: task.agentName,
            rewardUsd: reservedReward?.rewardUsd ?? task.rewardUsd,
            status: "completed",
          },
          recipientAccountId: resolveAgentRecipientAccountId({
            agentName: task.agentName,
            mode: hederaAdapter.mode,
            fallbackAccountId: treasury.accountId,
          }),
          hbarPriceUsd,
        },
        context: {
          sessionId,
          agentName: "System",
          treasury,
          strategyConfig,
        },
        allowedTools: ["settleAgentReward"],
      });

      payouts.push(payout.payout);
      const existingReservation = reservationByTask.get(task.id);
      if (existingReservation) {
        const released = releaseAgentReward(existingReservation);
        reservationByTask.set(task.id, released);
      }
      receipts.push(
        await hederaCore.consensus.publishReceipt({
          topicId: coordinationTopic.topicId,
          receipt: createReceipt({
            eventType: "reward_settled",
            accountId: treasury.accountId,
            network: treasury.network,
            settlementMode: hederaAdapter.mode,
            taskId: task.id,
            linkedIds: {
              taskId: task.id,
              agentName: task.agentName,
              rewardId: reservationByTask.get(task.id)?.id,
            },
            payload: {
              agentName: task.agentName,
              rewardUsd: payout.payout.rewardUsd,
              rewardHbar: payout.payout.rewardHbar,
              payoutId: payout.payout.id,
              recipientAccountId: payout.payout.recipientAccountId,
              ucpDistribution: payout.payout.ucpDistribution,
            },
          }),
        }),
      );
    }
  } else {
    activityLog.push(
      activityLogEntrySchema.parse({
        id: createId("log"),
        timestamp: isoNow(),
        actor: "System",
        stage: "approval_pending",
        message:
          "Execution settlements are blocked pending explicit approval. Use server approval endpoint to finalize rewards.",
        tone: "warning",
      }),
    );
  }

  const finalizedRewardReservations = Array.from(reservationByTask.values()).map((item) =>
    rewardReservationSchema.parse(item),
  );
  const auditResult = await toolRegistry.invoke<
    {
      receipts: Receipt[];
      payouts: WorkflowResult["payouts"];
      scheduledExecutions: ScheduledExecution[];
    },
    { auditTrail: WorkflowResult["auditTrail"] }
  >({
    name: "getAuditTrail",
    input: {
      receipts,
      payouts,
      scheduledExecutions,
    },
    context: {
      sessionId,
      agentName: "System",
      treasury,
      strategyConfig,
    },
    allowedTools: ["getAuditTrail"],
  });
  const auditTrail = auditResult.auditTrail;

  return workflowResultSchema.parse({
    scenarioId: "hedera-openclaw-treasury-workforce",
    goal,
    sessionId,
    treasury,
    strategyConfig,
    tokenOpportunities: await tokenProvider.listOpportunities(),
    defiOpportunities: await defiProvider.listOpportunities(),
    actionPlan: finalActionPlan,
    riskDecision: riskRun.output.riskDecision,
    executionPreview: executionRun.output.executionPreview,
    simulationResult: executionRun.output.simulationResult,
    scheduledExecutions,
    receipts,
    rewardReservations: finalizedRewardReservations,
    payouts,
    auditTrail,
    tasks,
    agentResults,
    toolInvocations: toolRegistry.getInvocations(),
    activityLog,
    reporterNarrative: reporterRun.output.narrative,
    userAgents,
    openclawAlignment: {
      pluginName: clawfiOpenclawManifest.name,
      runtimePattern: "Manifest-defined, session-scoped, tool-allowlisted multi-agent orchestration.",
      extensionMode: "OpenClaw-style extension adapter inside a standalone demo UI.",
      toolPolicy: "Each agent can only invoke explicit allowlisted tools.",
    },
    hederaStatus: {
      mode: hederaAdapter.mode,
      settlementSummary: requiresManualApproval
        ? "Approval is pending. Rewards will be settled after explicit approval."
        : "HBAR payouts are settled immediately and logged as Hedera-native receipts.",
      receiptSummary:
        "Task lifecycle, risk decisions, execution, and payouts emit Hedera-shaped receipts.",
      coordinationSummary: `Coordination receipts published to ${coordinationTopic.topicId}.`,
      marketplaceSummary: `RFP Topic: ${rfpTopicId} | Bids Topic: ${bidsTopicId}`,
      scheduledSummary: `${scheduledExecutions.length} scheduled actions generated for approval-centric execution.`,
      ...hederaAdapter.getCapabilitySummary(),
    },
  });
}

function reconcileTreasuryWithConfig(input: {
  treasury: Treasury;
  strategyConfig: StrategyConfig;
  mode: HederaMode;
}) {
  const totalValueUsd = input.treasury.portfolio.totalValueUsd;
  const reserveBudgetUsd = totalValueUsd * (input.strategyConfig.reservePercent / 100);
  const tradingBudgetUsd = totalValueUsd * (input.strategyConfig.tradingPercent / 100);
  const defiBudgetUsd = totalValueUsd * (input.strategyConfig.defiPercent / 100);

  return treasurySchema.parse({
    ...input.treasury,
    mode: input.mode,
    budgets: {
      ...input.treasury.budgets,
      reserveBudgetUsd,
      tradingBudgetUsd,
      defiBudgetUsd,
    },
    reserveCoveragePercent: reserveBudgetUsd > 0 ? (input.treasury.idleStablecoinUsd / reserveBudgetUsd) * 100 : 0,
  });
}
