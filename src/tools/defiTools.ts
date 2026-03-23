import type { DefiOpportunity } from "../core/models/schemas";
import type { ClawfiTool, DefiComparison, ProtocolRiskSummary, YieldEstimate } from "./types";

export const scanDefiOpportunitiesTool: ClawfiTool<{ topN: number }, { opportunities: DefiOpportunity[] }> =
  {
    name: "scanDefiOpportunities",
    description: "Returns ranked DeFi opportunities based on APY quality, protocol risk, and liquidity.",
    async execute({ input, deps }) {
      const opportunities = await deps.defiProvider.listOpportunities();
      const ranked = [...opportunities].sort((left, right) => {
        const leftScore = left.confidence * 0.4 + left.projectedApy * 0.35 + (100 - left.protocolRisk) * 0.25;
        const rightScore = right.confidence * 0.4 + right.projectedApy * 0.35 + (100 - right.protocolRisk) * 0.25;
        return rightScore - leftScore;
      });
      return {
        opportunities: ranked.slice(0, input.topN),
      };
    },
  };

export const compareDefiStrategiesTool: ClawfiTool<{ opportunityIds: string[] }, DefiComparison> = {
  name: "compareDefiStrategies",
  description: "Compares selected DeFi opportunities with concise operator-facing rationale.",
  async execute({ input, deps }) {
    const all = await deps.defiProvider.listOpportunities();
    const ranked = all
      .filter((item) => input.opportunityIds.includes(item.id))
      .sort((left, right) => right.projectedApy - left.projectedApy);
    return {
      ranked,
      reasoning: ranked.map((item) => `${item.protocol}: ${item.projectedApy.toFixed(1)}% APY with risk ${item.protocolRisk}/100.`),
    };
  },
};

export const getProtocolRiskSummaryTool: ClawfiTool<{ opportunityId: string }, ProtocolRiskSummary> = {
  name: "getProtocolRiskSummary",
  description: "Summarizes protocol-level risk for a given DeFi opportunity.",
  async execute({ input, deps }) {
    const opportunities = await deps.defiProvider.listOpportunities();
    const target = opportunities.find((item) => item.id === input.opportunityId);
    if (!target) {
      throw new Error(`Unknown DeFi opportunity: ${input.opportunityId}`);
    }
    return {
      opportunityId: target.id,
      protocol: target.protocol,
      riskScore: target.protocolRisk,
      notes: [
        `Liquidity model: ${target.liquidityModel}`,
        `Lockup: ${target.lockupDays} days`,
      ],
    };
  },
};

export const estimateYieldOutcomesTool: ClawfiTool<{ opportunityId: string; amountUsd: number }, YieldEstimate> = {
  name: "estimateYieldOutcomes",
  description: "Estimates monthly yield impact for a DeFi allocation candidate.",
  async execute({ input, deps }) {
    const opportunities = await deps.defiProvider.listOpportunities();
    const target = opportunities.find((item) => item.id === input.opportunityId);
    if (!target) {
      throw new Error(`Unknown DeFi opportunity: ${input.opportunityId}`);
    }
    return {
      opportunityId: target.id,
      projectedApy: target.projectedApy,
      projectedMonthlyYieldUsd: (input.amountUsd * target.projectedApy) / 1200,
    };
  },
};
