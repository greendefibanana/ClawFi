export const clawfiOpenclawManifest = {
  id: "clawfi-openclaw",
  name: "clawfi-openclaw",
  version: "0.2.0",
  description:
    "Hedera-native treasury workflow, deterministic policy review, and execution simulation tools for OpenClaw.",
  agents: {
    default: "coordinator",
    list: [
      {
        name: "coordinator",
        label: "Coordinator Agent",
        model: "openai/gpt-4.1-mini",
        tools: {
          allow: [
            "getTreasuryBalances",
            "getPortfolioState",
            "reserveBudget",
            "buildAllocationPlan",
          ],
        },
      },
      {
        name: "token-research",
        label: "Token Research Agent",
        model: "openai/gpt-4.1-mini",
        tools: {
          allow: [
            "getTokenMarketData",
            "scanTokenOpportunities",
            "getTokenLiquidityProfile",
            "buildTokenThesis",
          ],
        },
      },
      {
        name: "defi-strategy",
        label: "DeFi Strategy Agent",
        model: "openai/gpt-4.1-mini",
        tools: {
          allow: [
            "scanDefiOpportunities",
            "compareDefiStrategies",
            "getProtocolRiskSummary",
            "estimateYieldOutcomes",
          ],
        },
      },
      {
        name: "risk",
        label: "Risk Agent",
        model: "openai/gpt-4.1-mini",
        tools: {
          allow: [
            "getPortfolioState",
            "buildAllocationPlan",
            "recordDecisionReceipt",
          ],
        },
      },
      {
        name: "execution",
        label: "Execution Agent",
        model: "openai/gpt-4.1-mini",
        tools: {
          allow: [
            "simulateTradeAction",
            "simulateDefiAction",
            "buildExecutionPreview",
            "createScheduledExecution",
            "getScheduledExecutionStatus",
            "logExecutionEvent",
          ],
        },
      },
      {
        name: "reporter",
        label: "Reporter Agent",
        model: "openai/gpt-4.1-mini",
        tools: {
          allow: [
            "getTreasuryAccountState",
          ],
        },
      },
    ],
  },
} as const;
