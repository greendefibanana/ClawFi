import { describe, expect, it } from "vitest";
import { buildDemoTreasury, demoStrategyConfig, seededTokenOpportunities } from "../src/data/demoScenario";
import { buildTokenTradingActions } from "../src/engines/tokenTradingEngine";

describe("buildTokenTradingActions", () => {
  it("selects two treasury-compatible token opportunities inside policy", () => {
    const result = buildTokenTradingActions({
      treasury: buildDemoTreasury(demoStrategyConfig),
      config: demoStrategyConfig,
      opportunities: seededTokenOpportunities,
    });

    expect(result.shortlistedOpportunities).toHaveLength(2);
    expect(result.shortlistedOpportunities.map((item) => item.symbol)).toEqual(["HBAR", "SAUCE"]);
    expect(result.actions.every((action) => action.targetAllocationUsd > 0)).toBe(true);
  });
});
