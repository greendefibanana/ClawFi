import { describe, expect, it } from "vitest";
import { runClawFiWorkflow } from "../src/orchestration/runClawfiWorkflow";

describe("runClawFiWorkflow goal intent", () => {
  it("suppresses DeFi actions when the goal explicitly avoids DeFi and favors liquid HBAR exposure", async () => {
    const result = await runClawFiWorkflow({
      goal: "Avoid DeFi, preserve capital, and focus on the most liquid HBAR opportunity with manual approval.",
      autoApprove: false,
    });

    expect(result.actionPlan.actions.length).toBeGreaterThan(0);
    expect(result.actionPlan.actions.every((action) => action.actionType !== "allocate_defi")).toBe(true);
    expect(result.actionPlan.actions.some((action) => action.assetSymbol === "HBAR")).toBe(true);
    expect(result.actionPlan.notes.some((note) => note.includes("Goal intent interpreted"))).toBe(true);
  });

  it("suppresses token buys when the goal explicitly avoids tokens and prefers stablecoin yield", async () => {
    const result = await runClawFiWorkflow({
      goal: "Avoid tokens and deploy stablecoins into the safest USDC yield opportunities with manual approval.",
      autoApprove: false,
    });

    expect(result.actionPlan.actions.length).toBeGreaterThan(0);
    expect(result.actionPlan.actions.every((action) => action.actionType !== "buy_token")).toBe(true);
    expect(result.actionPlan.actions.every((action) => action.assetSymbol.includes("USDC"))).toBe(true);
  });
});
