export type GoalIntent = {
  riskAppetite: "defensive" | "balanced" | "aggressive";
  tokenPreference: "avoid" | "neutral" | "prefer";
  defiPreference: "avoid" | "neutral" | "prefer";
  requireStableAssets: boolean;
  preferLiquidity: boolean;
  targetSymbols: string[];
  targetProtocols: string[];
  approvalPreference: "manual" | "auto" | "neutral";
};

const SYMBOLS = ["HBAR", "SAUCE", "DOVU", "USDC"];
const PROTOCOLS = ["BONZO FINANCE", "BONZO", "HELISWAP", "SAUCERSWAP"];

export function deriveGoalIntent(goal: string): GoalIntent {
  const normalized = goal.toLowerCase();
  const targetSymbols = SYMBOLS.filter((symbol) => normalized.includes(symbol.toLowerCase()));
  const targetProtocols = PROTOCOLS.filter((protocol) => normalized.includes(protocol.toLowerCase()));

  return {
    riskAppetite: detectRiskAppetite(normalized),
    tokenPreference: detectTokenPreference(normalized),
    defiPreference: detectDefiPreference(normalized),
    requireStableAssets:
      hasAny(normalized, ["stable", "stablecoin", "usdc", "preserve capital", "capital preservation", "low risk yield"]),
    preferLiquidity: hasAny(normalized, ["liquid", "liquidity", "same-day", "same day", "fast exit", "instant exit"]),
    targetSymbols,
    targetProtocols,
    approvalPreference: normalized.includes("manual approval")
      ? "manual"
      : normalized.includes("auto-approve") || normalized.includes("auto approve")
        ? "auto"
        : "neutral",
  };
}

export function summarizeGoalIntent(intent: GoalIntent) {
  const segments = [
    `risk=${intent.riskAppetite}`,
    `tokens=${intent.tokenPreference}`,
    `defi=${intent.defiPreference}`,
  ];

  if (intent.requireStableAssets) {
    segments.push("stable-assets");
  }
  if (intent.preferLiquidity) {
    segments.push("liquidity-first");
  }
  if (intent.targetSymbols.length > 0) {
    segments.push(`symbols=${intent.targetSymbols.join("/")}`);
  }
  if (intent.targetProtocols.length > 0) {
    segments.push(`protocols=${intent.targetProtocols.join("/")}`);
  }
  if (intent.approvalPreference !== "neutral") {
    segments.push(`approval=${intent.approvalPreference}`);
  }

  return segments.join(", ");
}

function detectRiskAppetite(normalized: string): GoalIntent["riskAppetite"] {
  if (hasAny(normalized, ["high conviction", "aggressive", "higher risk", "maximize upside", "maximum upside"])) {
    return "aggressive";
  }
  if (hasAny(normalized, ["preserve capital", "capital preservation", "defensive", "low risk", "safest"])) {
    return "defensive";
  }
  return "balanced";
}

function detectTokenPreference(normalized: string): GoalIntent["tokenPreference"] {
  if (hasAny(normalized, ["avoid tokens", "no token", "no tokens", "token-free", "tokens only in watchlist"])) {
    return "avoid";
  }
  if (hasAny(normalized, ["token opportunity", "token opportunities", "accumulate", "rotate into hbar", "rotate into sauce", "buy token"])) {
    return "prefer";
  }
  return "neutral";
}

function detectDefiPreference(normalized: string): GoalIntent["defiPreference"] {
  if (hasAny(normalized, ["avoid defi", "no defi", "skip defi", "without defi"])) {
    return "avoid";
  }
  if (hasAny(normalized, ["yield", "apy", "defi", "lending", "vault", "deploy stablecoins"])) {
    return "prefer";
  }
  return "neutral";
}

function hasAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}
