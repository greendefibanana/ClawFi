import {
  plannedActionSchema,
  type DefiOpportunity,
  type PlannedAction,
  type StrategyConfig,
  type Treasury,
} from "../domain/schemas";
import { createId } from "../lib/ids";
import type { GoalIntent } from "../orchestration/goalIntent";

const riskCaps = {
  low: 40,
  medium: 58,
  high: 75,
} as const;

export function buildDefiActions(input: {
  treasury: Treasury;
  config: StrategyConfig;
  opportunities: DefiOpportunity[];
  intent?: GoalIntent;
}) {
  if (input.intent?.defiPreference === "avoid") {
    return {
      actions: [],
      shortlistedOpportunities: [],
    };
  }

  const budget = input.treasury.budgets.defiBudgetUsd;
  const filtered = input.opportunities
    .filter((opportunity) => opportunity.projectedApy >= input.config.targetYieldApy)
    .filter((opportunity) => opportunity.protocolRisk <= riskCaps[input.config.riskLevel])
    .filter((opportunity) => opportunity.liquidityUsd >= input.config.minLiquidityThresholdUsd)
    .filter((opportunity) => !input.intent?.requireStableAssets || opportunity.asset.toLowerCase().includes("usdc"))
    .sort((left, right) => scoreDefi(right, input.intent) - scoreDefi(left, input.intent))
    .slice(0, 2);

  const totalWeight =
    filtered.reduce((sum, opportunity) => sum + opportunity.confidence + opportunity.projectedApy, 0) || 1;

  const actions = filtered.map<PlannedAction>((opportunity) => {
    const allocationUsd = budget * ((opportunity.confidence + opportunity.projectedApy) / totalWeight);

    return plannedActionSchema.parse({
      id: createId("action"),
      actionType: "allocate_defi",
      title: `Deploy ${opportunity.asset} into ${opportunity.protocol}`,
      assetSymbol: opportunity.asset,
      venue: opportunity.protocol,
      targetAllocationUsd: allocationUsd,
      targetAllocationPercent: (allocationUsd / input.treasury.portfolio.totalValueUsd) * 100,
      expectedReturnPercent: opportunity.projectedApy,
      riskLabel: input.config.riskLevel,
      reason: opportunity.thesis,
      opportunityId: opportunity.id,
      guardrails: [
        `Cap single-protocol exposure below ${input.config.maxProtocolExposurePercent}% of treasury.`,
        "Keep stable deployment liquid and same-day unwind capable.",
      ],
      status: "draft",
    });
  });

  return {
    actions,
    shortlistedOpportunities: filtered,
  };
}

function scoreDefi(opportunity: DefiOpportunity, intent?: GoalIntent) {
  const targetProtocolBonus = intent?.targetProtocols.some((protocol) =>
    opportunity.protocol.toLowerCase().includes(protocol.toLowerCase()),
  )
    ? 18
    : 0;
  const stableAssetBonus =
    intent?.requireStableAssets && opportunity.asset.toLowerCase().includes("usdc") ? 12 : 0;
  const liquidityBonus = intent?.preferLiquidity ? Math.min(opportunity.liquidityUsd / 1_000_000, 10) : 0;
  const defensiveBonus = intent?.riskAppetite === "defensive" ? (100 - opportunity.protocolRisk) * 0.18 : 0;
  const aggressiveBonus = intent?.riskAppetite === "aggressive" ? opportunity.projectedApy * 0.18 : 0;
  const defiPreferenceBonus = intent?.defiPreference === "prefer" ? 8 : 0;

  return (
    opportunity.confidence * 0.4 +
    opportunity.projectedApy * 0.35 +
    (100 - opportunity.protocolRisk) * 0.25 +
    targetProtocolBonus +
    stableAssetBonus +
    liquidityBonus +
    defensiveBonus +
    aggressiveBonus +
    defiPreferenceBonus
  );
}
