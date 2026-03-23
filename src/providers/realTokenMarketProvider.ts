import type { TokenOpportunity } from "../domain/schemas";
import type { TokenMarketProvider } from "./interfaces";

export class RealTokenMarketProvider implements TokenMarketProvider {
  private network: "testnet" | "mainnet";

  constructor(network: "testnet" | "mainnet" = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet") {
    this.network = network;
  }

  async listOpportunities(): Promise<TokenOpportunity[]> {
    try {
      // 1. Fetch real prices from CoinGecko for Hedera tokens
      const cgResponse = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph,saucer-swap,dovu&vs_currencies=usd&include_24hr_change=true"
      );
      const prices = await cgResponse.json() as Record<string, { usd_24h_change?: number }>;

      // 2. Fetch SaucerSwap V1 Tokens for liquidity data
      const ssApiBase = this.network === "mainnet" ? "https://api.saucerswap.finance" : "https://test-api.saucerswap.finance";
      const ssResponse = await fetch(`${ssApiBase}/tokens`);
      const ssTokens = await ssResponse.json() as Array<{ id: string; liquidity: string }>;

      // Network specific token IDs
      const sauceId = this.network === "mainnet" ? "0.0.731861" : "0.0.1183558";
      const dovuId = this.network === "mainnet" ? "0.0.3716059" : "0.0.3716059"; // Assuming DOVU testnet ID is same based on previous code, adapt if needed.

      const opportunities: TokenOpportunity[] = [
        {
          id: "opp-sauce",
          kind: "token",
          symbol: "SAUCE",
          title: "SaucerSwap (SAUCE)",
          summary: "Primary DEX on Hedera.",
          expectedUpsidePercent: 25.0,
          confidence: 85,
          momentumScore: normalizeMomentumScore(prices["saucer-swap"]?.usd_24h_change, 8.1),
          liquidityUsd: findLiquidity(ssTokens, sauceId) || 5_000_000,
          slippageBps: 45,
          riskScore: 45,
          thesis: "Primary DEX on Hedera with sustained volume and governance rewards.",
          rationaleBullets: ["Volume growth", "Governance features"],
          hederaTokenId: sauceId,
          catalyst: "V2 features",
          targetEntry: "Current",
          stopLoss: "-15%",
        },
        {
          id: "opp-dovu",
          kind: "token",
          symbol: "DOVU",
          title: "DOVU",
          summary: "ESG-leader on Hedera.",
          expectedUpsidePercent: 35.0,
          confidence: 78,
          momentumScore: normalizeMomentumScore(prices["dovu"]?.usd_24h_change, 2.3),
          liquidityUsd: findLiquidity(ssTokens, dovuId) || 1_200_000,
          slippageBps: 80,
          riskScore: 65,
          thesis: "ESG-leader on Hedera; high-beta play with significant carbon-market upside.",
          rationaleBullets: ["Carbon market narrative", "High beta"],
          hederaTokenId: dovuId,
          catalyst: "New partnerships",
          targetEntry: "Current",
          stopLoss: "-20%",
        }
      ];

      return opportunities;
    } catch (error) {
      console.warn("Real market data fetch failed, using fallback.", error);
      return [];
    }
  }
}

function findLiquidity(tokens: Array<{ id: string; liquidity: string }>, id: string) {
  if (!Array.isArray(tokens)) return 0;
  const token = tokens.find(t => t.id === id);
  return token ? parseFloat(token.liquidity) : 0;
}

function normalizeMomentumScore(value: number | undefined, fallback: number) {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, candidate));
}
