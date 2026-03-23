import type { Payout, Receipt, Treasury } from "../src/core/models/schemas";
import { payoutSchema } from "../src/domain/schemas";
import { finalizeRecordedReceipt } from "../src/hedera/receiptFactory";
import type { HederaTreasuryAdapter } from "../src/hedera/treasuryAdapter";

type MirrorTokenBalance = {
  token_id?: string;
  balance?: number | string;
  decimals?: number;
};

type MirrorTokenResponse = {
  tokens?: MirrorTokenBalance[];
  links?: {
    next?: string | null;
  };
};

type MirrorAccountResponse = {
  balance?: {
    balance?: number | string;
  };
};

export class WalletConnectedTreasuryAdapter implements HederaTreasuryAdapter {
  readonly mode = "wallet_connected" as const;

  constructor(
    private readonly config: {
      network: "testnet" | "mainnet";
      treasuryAccountId: string;
      mirrorNodeBaseUrl?: string;
    },
  ) {}

  async readBalances() {
    const hbarPayload = await this.fetchMirrorJson<MirrorAccountResponse>(
      `/api/v1/accounts/${encodeURIComponent(this.config.treasuryAccountId)}`,
    );
    const tinybarBalance = this.toNumber(hbarPayload.balance?.balance);
    const tokenBalances = await this.fetchAllTokenBalances();

    const positions: Treasury["portfolio"]["positions"] = [
      {
        id: "pos-hbar-wallet",
        symbol: "HBAR",
        name: "Hedera",
        assetType: "hbar" as const,
        quantity: tinybarBalance / 100_000_000,
        priceUsd: 0,
        valueUsd: 0,
        source: "Wallet-connected Hedera Mirror Node REST",
      },
    ];

    for (const token of tokenBalances) {
      const tokenId = token.token_id;
      if (!tokenId) {
        continue;
      }

      const raw = this.toNumber(token.balance);
      const decimals = typeof token.decimals === "number" && token.decimals >= 0 ? token.decimals : 0;
      const normalizedQuantity = decimals > 0 ? raw / 10 ** decimals : raw;
      if (normalizedQuantity <= 0) {
        continue;
      }

      positions.push({
        id: `pos-${tokenId}`,
        symbol: tokenId,
        name: tokenId,
        assetType: "token" as const,
        quantity: normalizedQuantity,
        priceUsd: 0,
        valueUsd: 0,
        hederaTokenId: tokenId,
        source: "Wallet-connected Hedera Mirror Node REST",
      });
    }

    return positions;
  }

  recordReceipt(receipt: Receipt) {
    return Promise.resolve(finalizeRecordedReceipt({
      receipt,
      status: "recorded",
    }));
  }

  settlePayout(payout: Payout) {
    return Promise.resolve(payoutSchema.parse({
      ...payout,
      settlementMode: "wallet_connected",
    }));
  }

  getCapabilitySummary() {
    return {
      liveCapabilities: [
        "Mirror Node REST treasury introspection for a connected wallet account",
        "Browser wallet signing is required for live transaction execution",
      ],
      simulatedCapabilities: [
        "Planning receipts are stored locally until wallet-signed execution results are posted back",
      ],
    };
  }

  publishHcsMessage(topicId: string, message: unknown) {
    void topicId;
    void message;
    return Promise.resolve({
      transactionId: "wallet-signature-required",
    });
  }

  private async fetchAllTokenBalances() {
    const all: MirrorTokenBalance[] = [];
    let nextPath: string | null = `/api/v1/accounts/${encodeURIComponent(this.config.treasuryAccountId)}/tokens?limit=100&order=asc`;

    while (nextPath) {
      const payload = await this.fetchMirrorJson<MirrorTokenResponse>(nextPath);
      all.push(...(payload.tokens ?? []));
      nextPath = this.normalizeMirrorNextPath(nextPath, payload.links?.next);
    }

    return all;
  }

  private normalizeMirrorNextPath(currentPath: string, rawNext?: string | null) {
    if (!rawNext) {
      return null;
    }
    if (rawNext.startsWith("http://") || rawNext.startsWith("https://")) {
      return rawNext;
    }
    if (rawNext.startsWith("/")) {
      return rawNext;
    }
    if (rawNext.startsWith("?")) {
      const base = currentPath.split("?")[0];
      return `${base}${rawNext}`;
    }
    return `/${rawNext}`;
  }

  private async fetchMirrorJson<T>(pathOrUrl: string): Promise<T> {
    const mirrorNodeBaseUrl =
      this.config.mirrorNodeBaseUrl ??
      (this.config.network === "mainnet"
        ? "https://mainnet-public.mirrornode.hedera.com"
        : "https://testnet.mirrornode.hedera.com");
    const url =
      pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
        ? pathOrUrl
        : `${mirrorNodeBaseUrl}${pathOrUrl}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Mirror Node request failed (${response.status}) for ${url}`);
    }
    return (await response.json()) as T;
  }

  private toNumber(value: number | string | undefined) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }
}
