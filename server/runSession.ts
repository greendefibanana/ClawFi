import { buildDemoTreasury, demoStrategyConfig } from "../src/core/scenarios/demoScenario";
import type { HederaMode, UserAgentConfig, WorkflowResult } from "../src/core/models/schemas";
import { strategyConfigSchema } from "../src/core/models/schemas";
import { readTreasuryAccountId } from "../src/hedera/runtimeConfig";
import { SimulatedHederaTreasuryAdapter } from "../src/hedera/simulatedHederaAdapter";
import type { HederaTreasuryAdapter } from "../src/hedera/treasuryAdapter";
import { runClawFiWorkflow } from "../src/orchestration/runClawfiWorkflow";
import { approveSessionSettlement } from "./approval";
import { createRealAdapterFromEnv, resolveDefaultMode } from "./hederaAdapterFactory";
import { WalletConnectedTreasuryAdapter } from "./walletTreasuryAdapter";

const referencePriceByTokenId: Record<string, { symbol: string; name: string; priceUsd: number }> = {
  "0.0.456858": { symbol: "USDC", name: "USD Coin", priceUsd: 1 },
  "0.0.1183558": { symbol: "SAUCE", name: "SaucerSwap", priceUsd: 0.047 },
  "0.0.15058": { symbol: "WHBAR", name: "Wrapped HBAR", priceUsd: 0.11 },
  "0.0.731861": { symbol: "SAUCE", name: "SaucerSwap", priceUsd: 0.047 },
  "0.0.3716059": { symbol: "DOVU", name: "DOVU", priceUsd: 0.02 },
};

export type RunSessionInput = {
  goal?: string;
  hederaMode?: HederaMode;
  strategyConfig?: unknown;
  autoApprove?: boolean;
  userAgents?: UserAgentConfig[];
  walletAccountId?: string;
};

export async function runServerSession(input: RunSessionInput = {}): Promise<WorkflowResult> {
  const hederaMode = input.hederaMode ?? resolveDefaultMode();
  const strategyConfig = strategyConfigSchema.parse(input.strategyConfig ?? demoStrategyConfig);
  const autoApprove = input.autoApprove ?? true;
  const userAgents = input.userAgents ?? [];

  if (hederaMode === "real_scaffolded") {
    const adapter = createRealAdapterFromEnv();
    const livePositions = await adapter.readBalances();
    const treasury = buildDemoTreasury(strategyConfig);
    const treasuryAccountId = readTreasuryAccountId() ?? process.env.HEDERA_OPERATOR_ID ?? treasury.accountId;
    const enrichedPositions = livePositions.map((position) => {
      const reference = position.hederaTokenId ? referencePriceByTokenId[position.hederaTokenId] : undefined;
      const symbol = position.symbol === "HBAR" ? "HBAR" : reference?.symbol ?? position.symbol;
      const name = position.name === "Hedera" ? "Hedera" : reference?.name ?? position.name;
      const priceUsd = position.symbol === "HBAR" ? 0.11 : reference?.priceUsd ?? position.priceUsd;
      const valueUsd = position.quantity * priceUsd;
      return {
        ...position,
        symbol,
        name,
        priceUsd,
        valueUsd,
      };
    });
    const totalValueUsd = enrichedPositions.reduce((sum, position) => sum + position.valueUsd, 0);
    const liquidValueUsd = enrichedPositions.reduce((sum, position) => sum + position.valueUsd, 0);

    const workflow = await runClawFiWorkflow({
      goal: input.goal,
      strategyConfig,
      treasuryOverride: {
        ...treasury,
        accountId: treasuryAccountId,
        network: process.env.HEDERA_NETWORK ?? treasury.network,
        mode: "real_scaffolded",
        portfolio: {
          positions: enrichedPositions,
          totalValueUsd,
          liquidValueUsd,
        },
      },
      hederaAdapterOverride: adapter,
      hederaMode,
      autoApprove,
      userAgents,
    });
    if (!strategyConfig.simulateOnly && autoApprove) {
      return approveSessionSettlement({
        session: workflow,
        approvedBy: "auto-approver",
        allowAlreadyApproved: true,
      });
    }
    return workflow;
  }

  if (hederaMode === "wallet_connected") {
    if (!input.walletAccountId?.trim()) {
      throw new Error("Wallet-connected mode requires walletAccountId from the browser wallet session.");
    }

    const adapter = new WalletConnectedTreasuryAdapter({
      network: process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet",
      treasuryAccountId: input.walletAccountId.trim(),
      mirrorNodeBaseUrl: process.env.HEDERA_MIRROR_NODE_URL,
    });
    const livePositions = await adapter.readBalances();
    const treasury = buildDemoTreasury(strategyConfig);
    const enrichedPositions = livePositions.map((position) => {
      const reference = position.hederaTokenId ? referencePriceByTokenId[position.hederaTokenId] : undefined;
      const symbol = position.symbol === "HBAR" ? "HBAR" : reference?.symbol ?? position.symbol;
      const name = position.name === "Hedera" ? "Hedera" : reference?.name ?? position.name;
      const priceUsd = position.symbol === "HBAR" ? 0.11 : reference?.priceUsd ?? position.priceUsd;
      const valueUsd = position.quantity * priceUsd;
      return {
        ...position,
        symbol,
        name,
        priceUsd,
        valueUsd,
      };
    });
    const totalValueUsd = enrichedPositions.reduce((sum, position) => sum + position.valueUsd, 0);
    const liquidValueUsd = enrichedPositions.reduce((sum, position) => sum + position.valueUsd, 0);

    return runClawFiWorkflow({
      goal: input.goal,
      strategyConfig,
      treasuryOverride: {
        ...treasury,
        accountId: input.walletAccountId.trim(),
        network: process.env.HEDERA_NETWORK ?? treasury.network,
        mode: "wallet_connected",
        portfolio: {
          positions: enrichedPositions,
          totalValueUsd,
          liquidValueUsd,
        },
      },
      hederaAdapterOverride: adapter,
      hederaMode,
      autoApprove: false,
      userAgents,
    });
  }

  const treasury = buildDemoTreasury(strategyConfig);
  const adapter: HederaTreasuryAdapter = new SimulatedHederaTreasuryAdapter(treasury.portfolio.positions);
  const workflow = await runClawFiWorkflow({
    goal: input.goal,
    strategyConfig,
    treasuryOverride: treasury,
    hederaAdapterOverride: adapter,
    hederaMode,
    autoApprove,
    userAgents,
  });
  if (!strategyConfig.simulateOnly && autoApprove) {
    return approveSessionSettlement({
      session: workflow,
      approvedBy: "auto-approver",
      allowAlreadyApproved: true,
    });
  }
  return workflow;
}
