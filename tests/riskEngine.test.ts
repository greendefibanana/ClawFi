import { describe, expect, it } from "vitest";
import { buildDemoTreasury, demoStrategyConfig, seededDefiOpportunities, seededTokenOpportunities } from "../src/data/demoScenario";
import { plannedActionSchema } from "../src/domain/schemas";
import { reviewActionPlan } from "../src/engines/riskEngine";

describe("reviewActionPlan", () => {
  it("rejects a high-slippage opportunity and resizes concentration breaches", () => {
    const treasury = buildDemoTreasury(demoStrategyConfig);
    const draftActions = [
      plannedActionSchema.parse({
        id: "action-1",
        actionType: "buy_token",
        title: "Accumulate DOVU",
        assetSymbol: "DOVU",
        venue: "SaucerSwap",
        targetAllocationUsd: 16000,
        targetAllocationPercent: 7,
        expectedReturnPercent: 32,
        riskLabel: "medium",
        reason: "Test action",
        opportunityId: "token-dovu-satellite",
        guardrails: [],
        status: "draft",
      }),
      plannedActionSchema.parse({
        id: "action-2",
        actionType: "allocate_defi",
        title: "Deploy into Bonzo",
        assetSymbol: "USDC",
        venue: "Bonzo Finance",
        targetAllocationUsd: 55000,
        targetAllocationPercent: 24,
        expectedReturnPercent: 10.8,
        riskLabel: "medium",
        reason: "Test action",
        opportunityId: "defi-bonzo-usdc",
        guardrails: [],
        status: "draft",
      }),
    ];

    const result = reviewActionPlan({
      draftActions,
      treasury,
      config: demoStrategyConfig,
      tokenOpportunities: seededTokenOpportunities,
      defiOpportunities: seededDefiOpportunities,
    });

    expect(result.riskDecision.rejectedOpportunityIds).toContain("token-dovu-satellite");
    expect(result.riskDecision.resizedActions).toHaveLength(1);
    expect(result.actionPlan.actions).toHaveLength(1);
    expect(result.actionPlan.actions[0]?.status).toBe("resized");
  });
});
