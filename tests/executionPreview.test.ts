import { describe, expect, it } from "vitest";
import { demoStrategyConfig } from "../src/data/demoScenario";
import { MockExecutionSimulatorProvider } from "../src/providers/mockExecutionProvider";

describe("MockExecutionSimulatorProvider", () => {
  it("builds a simulation-first execution preview", async () => {
    const provider = new MockExecutionSimulatorProvider();
    const preview = await provider.preview({
      actions: [
        {
          title: "Deploy USDC into Bonzo",
          amountUsd: 25000,
          venue: "Bonzo Finance",
          requiresApproval: true,
        },
      ],
      config: demoStrategyConfig,
    });

    expect(preview.mode).toBe("simulation");
    expect(preview.steps).toHaveLength(1);
    expect(preview.settlementPath).toContain("Simulation only");
  });
});
