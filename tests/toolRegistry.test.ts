import { describe, expect, it } from "vitest";
import { createHederaCore } from "../src/hedera/adapters/createHederaCore";
import { buildDemoTreasury, demoStrategyConfig } from "../src/data/demoScenario";
import { SimulatedHederaTreasuryAdapter } from "../src/hedera/simulatedHederaAdapter";
import { MockDefiOpportunityProvider } from "../src/providers/mockDefiOpportunityProvider";
import { MockExecutionSimulatorProvider } from "../src/providers/mockExecutionProvider";
import { MockTokenMarketProvider } from "../src/providers/mockTokenMarketProvider";
import { MockWalletProvider } from "../src/providers/mockWalletProvider";
import { createClawfiToolRegistry } from "../src/tools/registerAllTools";

describe("ClawfiToolRegistry", () => {
  it("enforces per-agent tool allowlists", async () => {
    const treasury = buildDemoTreasury(demoStrategyConfig);
    const hederaAdapter = new SimulatedHederaTreasuryAdapter(treasury.portfolio.positions);
    const registry = createClawfiToolRegistry({
      walletProvider: new MockWalletProvider(),
      tokenProvider: new MockTokenMarketProvider(),
      defiProvider: new MockDefiOpportunityProvider(),
      executionProvider: new MockExecutionSimulatorProvider(),
      hederaAdapter,
      hederaCore: createHederaCore({
        mode: treasury.mode,
        treasury: hederaAdapter,
        treasuryState: treasury,
      }),
    });

    await expect(
      registry.invoke({
        name: "getTokenMarketData",
        input: { minLiquidityUsd: 0 },
        context: {
          sessionId: "session-test",
          agentName: "Risk",
          treasury,
          strategyConfig: demoStrategyConfig,
        },
        allowedTools: ["recordDecisionReceipt"],
      }),
    ).rejects.toThrow("is not allowed to call");
  });

  it("records successful tool invocations for auditability", async () => {
    const treasury = buildDemoTreasury(demoStrategyConfig);
    const hederaAdapter = new SimulatedHederaTreasuryAdapter(treasury.portfolio.positions);
    const registry = createClawfiToolRegistry({
      walletProvider: new MockWalletProvider(),
      tokenProvider: new MockTokenMarketProvider(),
      defiProvider: new MockDefiOpportunityProvider(),
      executionProvider: new MockExecutionSimulatorProvider(),
      hederaAdapter,
      hederaCore: createHederaCore({
        mode: treasury.mode,
        treasury: hederaAdapter,
        treasuryState: treasury,
      }),
    });

    const result = await registry.invoke({
      name: "getPortfolioState",
      input: {},
      context: {
        sessionId: "session-test",
        agentName: "Coordinator",
        treasury,
        strategyConfig: demoStrategyConfig,
      },
      allowedTools: ["getPortfolioState"],
    });

    expect(result).toHaveProperty("totalValueUsd");
    expect(registry.getInvocations()).toHaveLength(1);
    expect(registry.getInvocations()[0]?.toolName).toBe("getPortfolioState");
  });
});
