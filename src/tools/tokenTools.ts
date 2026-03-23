import { buildTokenTradingActions } from "../engines/tokenTradingEngine";
import type { TokenOpportunity } from "../core/models/schemas";
import type { ClawfiTool, TokenLiquidityProfile, TokenMarketData, TokenThesis } from "./types";

export const getTokenMarketDataTool: ClawfiTool<{ minLiquidityUsd?: number }, TokenMarketData> = {
  name: "getTokenMarketData",
  description: "Fetches token opportunities and aggregate market depth for the active scenario.",
  async execute({ input, deps }) {
    const opportunities = await deps.tokenProvider.listOpportunities();
    const minLiquidityUsd = input.minLiquidityUsd ?? 0;
    const filtered = opportunities.filter((item) => item.liquidityUsd >= minLiquidityUsd);
    return {
      opportunities: filtered,
      totalTrackedLiquidityUsd: filtered.reduce((sum, item) => sum + item.liquidityUsd, 0),
    };
  },
};

export const scanTokenOpportunitiesTool: ClawfiTool<{ topN: number }, { opportunities: TokenOpportunity[] }> =
  {
    name: "scanTokenOpportunities",
    description: "Returns ranked token opportunities based on confidence, momentum, upside, and risk.",
    async execute({ input, deps }) {
      const opportunities = await deps.tokenProvider.listOpportunities();
      const ranked = [...opportunities].sort((left, right) => {
        const leftScore = left.confidence * 0.4 + left.momentumScore * 0.3 + left.expectedUpsidePercent * 0.2 - left.riskScore * 0.1;
        const rightScore =
          right.confidence * 0.4 + right.momentumScore * 0.3 + right.expectedUpsidePercent * 0.2 - right.riskScore * 0.1;
        return rightScore - leftScore;
      });
      return {
        opportunities: ranked.slice(0, input.topN),
      };
    },
  };

export const getTokenLiquidityProfileTool: ClawfiTool<{ opportunityId: string }, TokenLiquidityProfile> = {
  name: "getTokenLiquidityProfile",
  description: "Builds a quick liquidity and slippage profile for a token opportunity.",
  async execute({ input, deps }) {
    const opportunities = await deps.tokenProvider.listOpportunities();
    const target = opportunities.find((item) => item.id === input.opportunityId);
    if (!target) {
      throw new Error(`Unknown token opportunity: ${input.opportunityId}`);
    }

    return {
      opportunityId: target.id,
      liquidityUsd: target.liquidityUsd,
      slippageBps: target.slippageBps,
      assessment: target.liquidityUsd > 10_000_000 ? "deep" : target.liquidityUsd > 2_000_000 ? "moderate" : "thin",
    };
  },
};

export const buildTokenThesisTool: ClawfiTool<{ opportunityId: string }, TokenThesis> = {
  name: "buildTokenThesis",
  description: "Generates a structured token thesis with risk notes and sizing guidance.",
  async execute({ input, deps, context }) {
    const opportunities = await deps.tokenProvider.listOpportunities();
    const target = opportunities.find((item) => item.id === input.opportunityId);
    if (!target) {
      throw new Error(`Unknown token opportunity: ${input.opportunityId}`);
    }

    const actions = buildTokenTradingActions({
      treasury: context.treasury,
      config: context.strategyConfig,
      opportunities: [target],
    }).actions;

    return {
      opportunityId: target.id,
      thesis: target.thesis,
      riskNotes: target.rationaleBullets,
      suggestedSizingPercent: actions[0]?.targetAllocationPercent ?? 0,
    };
  },
};
