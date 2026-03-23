import type {
  DefiOpportunity,
  ExecutionPreview,
  SimulationResult,
  StrategyConfig,
  TokenOpportunity,
  Treasury,
} from "../domain/schemas";

export interface WalletProvider {
  readTreasury(config: StrategyConfig): Promise<Treasury>;
}

export interface TokenMarketProvider {
  listOpportunities(): Promise<TokenOpportunity[]>;
}

export interface DefiOpportunityProvider {
  listOpportunities(): Promise<DefiOpportunity[]>;
}

export interface AIModelProvider {
  mode: string;
  generateNarrative(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    model?: string;
    apiKey?: string;
  }): Promise<string>;
  generateJSON<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    schema: Record<string, unknown>;
    model?: string;
    apiKey?: string;
  }): Promise<T>;
}

export interface ExecutionSimulatorProvider {
  simulate(input: {
    treasury: Treasury;
    actionPlanActions: Array<{
      title: string;
      amountUsd: number;
      expectedReturnPercent: number;
    }>;
  }): Promise<
    Pick<
      SimulationResult,
      | "projectedMonthlyYieldUsd"
      | "projectedMonthlyPnLRangeUsd"
      | "stressScenarioDrawdownUsd"
      | "liquidityCoveragePercent"
    >
  >;
  preview(input: {
    actions: Array<{
      title: string;
      amountUsd: number;
      venue: string;
      requiresApproval: boolean;
      actionType: string;
      assetSymbol: string;
    }>;
    config: StrategyConfig;
    treasury: Treasury;
  }): Promise<ExecutionPreview>;
}
