import "../src/env/loadDotEnv";
import type { PlannedAction, Treasury } from "../src/core/models/schemas";
import { buildDemoTreasury, demoStrategyConfig } from "../src/core/scenarios/demoScenario";
import { readTreasuryAccountId } from "../src/hedera/runtimeConfig";
import { createRealAdapterFromEnv } from "../server/hederaAdapterFactory";
import { createLiveExecutionAdapterFromEnv } from "../server/liveExecution";

const referencePriceByTokenId: Record<string, { symbol: string; name: string; priceUsd: number }> = {
  "0.0.456858": { symbol: "USDC", name: "USD Coin", priceUsd: 1 },
  "0.0.1183558": { symbol: "SAUCE", name: "SaucerSwap", priceUsd: 0.047 },
  "0.0.15058": { symbol: "WHBAR", name: "Wrapped HBAR", priceUsd: 0.11 },
  "0.0.731861": { symbol: "SAUCE", name: "SaucerSwap", priceUsd: 0.047 },
  "0.0.3716059": { symbol: "DOVU", name: "DOVU", priceUsd: 0.02 },
};

const actionArg = readArg("action") ?? "both";
const tradeSymbol = (readArg("trade-symbol") ?? "SAUCE").toUpperCase();
const tradeUsd = readPositiveNumberArg("trade-usd", 1);
const defiUsd = readPositiveNumberArg("defi-usd", 1);
const defiAssetSymbol = resolveBonzoAssetLabel();

if (!["trade", "defi", "both"].includes(actionArg)) {
  throw new Error(`Unsupported --action value "${actionArg}". Expected trade, defi, or both.`);
}

const liveExecutionAdapter = createLiveExecutionAdapterFromEnv("real_scaffolded");
if (!liveExecutionAdapter) {
  throw new Error("Live execution adapter is unavailable. Check real mode credentials in the environment.");
}

console.error("Loading live treasury snapshot...");
const treasury = await buildLiveTreasurySnapshot();
const results = [];

if (actionArg === "trade" || actionArg === "both") {
  console.error(`Executing trade smoke for ${tradeSymbol}...`);
  results.push(
    await liveExecutionAdapter.executeAction({
      action: buildTradeAction(tradeSymbol, tradeUsd, treasury.portfolio.totalValueUsd),
      treasury,
      strategyConfig: {
        ...demoStrategyConfig,
        simulateOnly: false,
      },
    }),
  );
}

if (actionArg === "defi" || actionArg === "both") {
  console.error(`Executing DeFi smoke for ${defiAssetSymbol}...`);
  results.push(
    await liveExecutionAdapter.executeAction({
      action: buildDefiAction(defiAssetSymbol, defiUsd, treasury.portfolio.totalValueUsd),
      treasury,
      strategyConfig: {
        ...demoStrategyConfig,
        simulateOnly: false,
      },
    }),
  );
}

console.log(
  JSON.stringify(
    {
      treasuryAccountId: treasury.accountId,
      action: actionArg,
      tradeSymbol,
      defiAssetSymbol,
      liveFlags: {
        trading: process.env.CLAWFI_ENABLE_LIVE_TRADING === "true",
        defi: process.env.CLAWFI_ENABLE_LIVE_DEFI === "true",
      },
      portfolio: treasury.portfolio,
      results,
    },
    null,
    2,
  ),
);

async function buildLiveTreasurySnapshot(): Promise<Treasury> {
  const adapter = createRealAdapterFromEnv();
  const livePositions = await adapter.readBalances();
  const baseTreasury = buildDemoTreasury(demoStrategyConfig);
  const treasuryAccountId = readTreasuryAccountId() ?? process.env.HEDERA_OPERATOR_ID ?? baseTreasury.accountId;
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

  return {
    ...baseTreasury,
    accountId: treasuryAccountId,
    network: process.env.HEDERA_NETWORK ?? baseTreasury.network,
    mode: "real_scaffolded",
    portfolio: {
      positions: enrichedPositions,
      totalValueUsd,
      liquidValueUsd,
    },
  };
}

function buildTradeAction(symbol: string, amountUsd: number, portfolioTotalUsd: number): PlannedAction {
  return {
    id: "smoke-trade",
    actionType: "buy_token",
    title: `Smoke buy ${symbol}`,
    assetSymbol: symbol,
    venue: "SaucerSwap",
    targetAllocationUsd: amountUsd,
    targetAllocationPercent: percentOfTotal(amountUsd, portfolioTotalUsd),
    expectedReturnPercent: 0,
    riskLabel: "medium",
    reason: "Direct live smoke test for SaucerSwap execution.",
    guardrails: ["Smoke-size live contract execution only."],
    status: "approved",
  };
}

function buildDefiAction(symbol: string, amountUsd: number, portfolioTotalUsd: number): PlannedAction {
  return {
    id: "smoke-defi",
    actionType: "allocate_defi",
    title: `Smoke deposit ${symbol} to Bonzo`,
    assetSymbol: symbol,
    venue: "Bonzo",
    targetAllocationUsd: amountUsd,
    targetAllocationPercent: percentOfTotal(amountUsd, portfolioTotalUsd),
    expectedReturnPercent: 0,
    riskLabel: "medium",
    reason: "Direct live smoke test for Bonzo execution.",
    guardrails: ["Smoke-size live contract execution only."],
    status: "approved",
  };
}

function resolveBonzoAssetLabel() {
  const tokenId = process.env.BONZO_DEFI_ASSET_TOKEN_ID?.trim();
  if (tokenId === "0.0.1183558" || tokenId === "0.0.731861") {
    return "SAUCE";
  }
  if (tokenId === "0.0.15058") {
    return "WHBAR";
  }
  if (tokenId === "0.0.456858" || tokenId === "0.0.4355325") {
    return "USDC";
  }
  return "BONZO";
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length).trim() : undefined;
}

function readPositiveNumberArg(name: string, fallback: number) {
  const raw = readArg(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentOfTotal(amountUsd: number, totalValueUsd: number) {
  if (!(totalValueUsd > 0)) {
    return 0;
  }
  return (amountUsd / totalValueUsd) * 100;
}
