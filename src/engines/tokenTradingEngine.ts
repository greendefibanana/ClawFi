import {
  plannedActionSchema,
  type PlannedAction,
  type StrategyConfig,
  type TokenOpportunity,
  type Treasury,
} from "../domain/schemas";
import { createId } from "../lib/ids";
import type { GoalIntent } from "../orchestration/goalIntent";

const riskCaps = {
  low: 45,
  medium: 62,
  high: 80,
} as const;

export function buildTokenTradingActions(input: {
  treasury: Treasury;
  config: StrategyConfig;
  opportunities: TokenOpportunity[];
  intent?: GoalIntent;
}) {
  if (input.intent?.tokenPreference === "avoid") {
    return {
      actions: [],
      shortlistedOpportunities: [],
    };
  }

  const budget = input.treasury.budgets.tradingBudgetUsd;
  const filtered = input.opportunities
    .filter((opportunity) => opportunity.riskScore <= riskCaps[input.config.riskLevel])
    .filter((opportunity) => opportunity.liquidityUsd >= input.config.minLiquidityThresholdUsd)
    .filter((opportunity) => opportunity.slippageBps <= input.config.maxSlippageBps)
    .sort((left, right) => scoreToken(right, input.intent) - scoreToken(left, input.intent))
    .slice(0, 2);

  const totalWeight =
    filtered.reduce((sum, opportunity) => sum + opportunity.confidence + opportunity.momentumScore, 0) || 1;

  const actions = filtered.map<PlannedAction>((opportunity) => {
    const allocationUsd = budget * ((opportunity.confidence + opportunity.momentumScore) / totalWeight);

    return plannedActionSchema.parse({
      id: createId("action"),
      actionType: "buy_token",
      title: `Accumulate ${opportunity.symbol}`,
      assetSymbol: opportunity.symbol,
      venue: "HashPack + SaucerSwap route",
      targetAllocationUsd: allocationUsd,
      targetAllocationPercent: (allocationUsd / input.treasury.portfolio.totalValueUsd) * 100,
      expectedReturnPercent: opportunity.expectedUpsidePercent,
      riskLabel: input.config.riskLevel,
      reason: opportunity.thesis,
      opportunityId: opportunity.id,
      guardrails: [
        `Cap single-token exposure below ${input.config.maxTokenExposurePercent}% of treasury.`,
        `Maintain slippage below ${input.config.maxSlippageBps} bps.`,
      ],
      status: "draft",
    });
  });

  return {
    actions,
    shortlistedOpportunities: filtered,
  };
}

function scoreToken(opportunity: TokenOpportunity, intent?: GoalIntent) {
  const targetSymbolBonus = intent?.targetSymbols.includes(opportunity.symbol) ? 22 : 0;
  const liquidityBonus = intent?.preferLiquidity ? Math.min(opportunity.liquidityUsd / 1_000_000, 12) : 0;
  const defensivePenalty = intent?.riskAppetite === "defensive" ? opportunity.riskScore * 0.18 : 0;
  const aggressiveBonus = intent?.riskAppetite === "aggressive" ? opportunity.expectedUpsidePercent * 0.2 : 0;
  const tokenPreferenceBonus = intent?.tokenPreference === "prefer" ? 8 : 0;

  return (
    opportunity.confidence * 0.45 +
    opportunity.momentumScore * 0.3 +
    opportunity.expectedUpsidePercent * 0.25 -
    opportunity.riskScore * 0.18 +
    targetSymbolBonus +
    liquidityBonus +
    aggressiveBonus +
    tokenPreferenceBonus -
    defensivePenalty
  );
}
