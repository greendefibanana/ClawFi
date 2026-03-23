import type { AIModelProvider } from "./interfaces";

export class MockAiModelProvider implements AIModelProvider {
  mode = "mock" as const;

  generateNarrative(input: { systemPrompt: string; userPrompt: string; facts: string[] }) {
    const condensedFacts = input.facts.slice(0, 4).join(" ");
    return Promise.resolve(`${input.systemPrompt} ${input.userPrompt} ${condensedFacts}`.trim());
  }

  generateJSON<T>(input: { systemPrompt: string; userPrompt: string; facts: string[]; schema?: Record<string, unknown> }): Promise<T> {
    const tradingBudgetUsd = extractDollarFact(input.facts, "Trading Budget") ?? 1000;
    const defiBudgetUsd = extractDollarFact(input.facts, "DeFi Budget") ?? 2000;
    const totalValueUsd = extractDollarFact(input.facts, "Total Value") ?? (tradingBudgetUsd + defiBudgetUsd);
    const safeTradingUsd = clampUsd(Math.min(tradingBudgetUsd * 0.55, totalValueUsd * 0.18), tradingBudgetUsd);
    const safeDefiUsd = clampUsd(Math.min(defiBudgetUsd * 0.45, totalValueUsd * 0.12), defiBudgetUsd);
    const tokenPercent = toPercent(safeTradingUsd, totalValueUsd);
    const defiPercent = toPercent(safeDefiUsd, totalValueUsd);

    if (input.userPrompt.includes("token allocation")) {
      return Promise.resolve({
        actions: [
          createMockAction({
            id: "mock-1",
            title: "Mock Token Buy",
            actionType: "buy_token",
            assetSymbol: "SAUCE",
            venue: "SaucerSwap",
            targetAllocationUsd: safeTradingUsd,
            targetAllocationPercent: tokenPercent,
            expectedReturnPercent: 10,
            riskLabel: "medium",
            reason: "Allocate a limited trading sleeve to a liquid Hedera ecosystem token.",
            opportunityId: "opp-sauce",
            status: "draft",
          }),
        ],
        theses: [{ opportunityId: "opp-hbar", thesis: "Mock thesis", suggestedSizingPercent: 100 }]
      } as unknown as T);
    }
    if (input.userPrompt.includes("DeFi allocation")) {
      return Promise.resolve({
        actions: [
          createMockAction({
            id: "mock-2",
            title: "Mock SAUCE Lending Deposit",
            actionType: "allocate_defi",
            assetSymbol: "SAUCE",
            venue: "Bonzo",
            targetAllocationUsd: safeDefiUsd,
            targetAllocationPercent: defiPercent,
            expectedReturnPercent: 8,
            riskLabel: "low",
            reason: "Recycle a smaller portion of acquired SAUCE into a supported Bonzo lending sleeve.",
            opportunityId: "defi-bonzo-sauce",
            status: "draft",
          }),
        ],
      } as unknown as T);
    }
    if (input.userPrompt.includes("allocation plan")) {
      return Promise.resolve({
        riskDecision: { status: "approved", findings: [], rejectedOpportunityIds: [] },
        actionPlan: {
          actions: [
            createMockAction({
              id: "mock-1",
              title: "Mock Token Buy",
              actionType: "buy_token",
              assetSymbol: "SAUCE",
              venue: "SaucerSwap",
              targetAllocationUsd: safeTradingUsd,
              targetAllocationPercent: tokenPercent,
              expectedReturnPercent: 10,
              riskLabel: "medium",
              reason: "Token sleeve remains within concentration and liquidity constraints.",
              opportunityId: "opp-sauce",
              status: "approved",
            }),
            createMockAction({
              id: "mock-2",
              title: "Mock SAUCE Lending Deposit",
              actionType: "allocate_defi",
              assetSymbol: "SAUCE",
              venue: "Bonzo",
              targetAllocationUsd: safeDefiUsd,
              targetAllocationPercent: defiPercent,
              expectedReturnPercent: 8,
              riskLabel: "low",
              reason: "Bonzo lending sleeve remains within the configured DeFi budget and uses a supported asset.",
              opportunityId: "defi-bonzo-sauce",
              status: "approved",
            }),
          ],
          notes: [],
        }
      } as unknown as T);
    }
    return Promise.resolve({} as T);
  }
}

function createMockAction(input: {
  id: string;
  title: string;
  actionType: "buy_token" | "allocate_defi" | "hold_reserve" | "pay_reward";
  assetSymbol: string;
  venue: string;
  targetAllocationUsd: number;
  targetAllocationPercent: number;
  expectedReturnPercent: number;
  riskLabel: "low" | "medium" | "high";
  reason: string;
  opportunityId?: string;
  status: "draft" | "approved" | "resized" | "rejected" | "simulated";
}) {
  return {
    ...input,
    guardrails: [
      "Respect maximum slippage threshold.",
      "Respect treasury concentration and reserve coverage policy.",
    ],
  };
}

function extractDollarFact(facts: string[], label: string) {
  const match = facts
    .map((fact) => fact.match(new RegExp(`${label}: \\$(\\d+(?:\\.\\d+)?)`, "i")))
    .find(Boolean);
  return match ? Number.parseFloat(match[1]) : null;
}

function clampUsd(value: number, ceiling: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return Math.min(ceiling, 10);
  }
  return Math.max(5, Math.min(ceiling, Number.parseFloat(value.toFixed(2))));
}

function toPercent(amountUsd: number, totalValueUsd: number) {
  if (!Number.isFinite(totalValueUsd) || totalValueUsd <= 0) {
    return 0;
  }
  return Number.parseFloat(((amountUsd / totalValueUsd) * 100).toFixed(2));
}
