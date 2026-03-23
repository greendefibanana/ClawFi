import { Hbar } from "@hashgraph/sdk";
import type { AccountBalance, Client } from "@hashgraph/sdk";
import type { Payout, Position, Receipt } from "../domain/schemas";
import { payoutSchema } from "../domain/schemas";
import { parseTreasuryPrivateKey } from "./operatorKey";
import { finalizeRecordedReceipt } from "./receiptFactory";
import type { HederaTreasuryAdapter } from "./treasuryAdapter";

type HederaSdkModule = typeof import("@hashgraph/sdk");
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

export class RealHederaTreasuryAdapter implements HederaTreasuryAdapter {
  readonly mode = "real_scaffolded" as const;

  private readonly network: "testnet" | "mainnet";
  private readonly treasuryAccountId: string;
  private readonly treasuryKey: string;
  private readonly receiptTopicId?: string;
  private readonly mirrorNodeBaseUrl: string;

  constructor(config: {
    network: "testnet" | "mainnet";
    operatorId: string;
    operatorKey: string;
    treasuryAccountId?: string;
    treasuryKey?: string;
    receiptTopicId?: string;
    mirrorNodeBaseUrl?: string;
  }) {
    this.network = config.network;
    this.treasuryAccountId = config.treasuryAccountId ?? config.operatorId;
    this.treasuryKey = config.treasuryKey ?? config.operatorKey;
    this.receiptTopicId = config.receiptTopicId;
    this.mirrorNodeBaseUrl =
      config.mirrorNodeBaseUrl ??
      (this.network === "mainnet"
        ? "https://mainnet-public.mirrornode.hedera.com"
        : "https://testnet.mirrornode.hedera.com");
  }

  async readBalances() {
    try {
      return await this.readBalancesFromMirrorNode();
    } catch (error) {
      // Keep SDK fallback for resiliency while Mirror Node infrastructure is being validated.
      const sdk = await import("@hashgraph/sdk");
      const client = this.createTreasuryClient(sdk);
      const treasuryAccountId = sdk.AccountId.fromString(this.treasuryAccountId);
      const balance = await new sdk.AccountBalanceQuery().setAccountId(treasuryAccountId).execute(client);
      return this.balanceToPositions(balance, "Live Hedera account query (SDK fallback)");
    }
  }

  async recordReceipt(receipt: Receipt) {
    if (!this.receiptTopicId) {
      throw new Error("Real receipt recording requires a Hedera Consensus Service topic ID.");
    }

    const sdk = await import("@hashgraph/sdk");
    const client = this.createTreasuryClient(sdk);
    const topicId = sdk.TopicId.fromString(this.receiptTopicId);
    const response = await new sdk.TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(receipt))
      .execute(client);
    const transactionReceipt = await response.getReceipt(client);

    if (transactionReceipt.status.toString() !== "SUCCESS") {
      throw new Error(`Receipt topic submit failed with status ${transactionReceipt.status.toString()}.`);
    }

    return finalizeRecordedReceipt({
      receipt,
      status: "indexed",
      transactionId: response.transactionId.toString(),
      topicId: topicId.toString(),
      explorerUrl: this.hashscanUrl(response.transactionId.toString()),
    });
  }

  async settlePayout(payout: Payout) {
    const sdk = await import("@hashgraph/sdk");
    const client = this.createTreasuryClient(sdk);
    const operatorAccountId = sdk.AccountId.fromString(this.treasuryAccountId);
    const recipientAccountId = sdk.AccountId.fromString(payout.recipientAccountId);
    const transferAmount = Hbar.fromTinybars(Math.round(payout.rewardHbar * 100_000_000));
    const response = await new sdk.TransferTransaction()
      .setMaxTransactionFee(new Hbar(0.01))
      .addHbarTransfer(operatorAccountId, transferAmount.negated())
      .addHbarTransfer(recipientAccountId, transferAmount)
      .execute(client);

    await response.getReceipt(client);

    return payoutSchema.parse({
      ...payout,
      status: "settled",
      settlementMode: "real_scaffolded",
      transactionId: response.transactionId.toString(),
    });
  }

  async publishHcsMessage(topicId: string, message: any) {
    const sdk = await import("@hashgraph/sdk");
    const client = this.createTreasuryClient(sdk);
    const hcsTopicId = sdk.TopicId.fromString(topicId);
    const response = await new sdk.TopicMessageSubmitTransaction()
      .setTopicId(hcsTopicId)
      .setMessage(JSON.stringify(message))
      .execute(client);
    await response.getReceipt(client);
    return { transactionId: response.transactionId.toString() };
  }

  getCapabilitySummary() {
    return {
      liveCapabilities: [
        "Mirror Node REST treasury introspection for HBAR and token balances",
        "TransferTransaction for HBAR-denominated reward payouts",
        "TopicMessageSubmitTransaction for auditable task and decision receipts",
      ],
      simulatedCapabilities: [
        "Fallback to the simulated adapter when credentials are unavailable",
      ],
    };
  }

  private createTreasuryClient(sdk: HederaSdkModule): Client {
    const client = this.network === "mainnet" ? sdk.Client.forMainnet() : sdk.Client.forTestnet();
    client.setOperator(sdk.AccountId.fromString(this.treasuryAccountId), parseTreasuryPrivateKey(this.treasuryKey));
    return client;
  }

  private async readBalancesFromMirrorNode() {
    const hbarPayload = await this.fetchMirrorJson<MirrorAccountResponse>(
      `/api/v1/accounts/${encodeURIComponent(this.treasuryAccountId)}`,
    );
    const tinybarBalance = this.toNumber(hbarPayload.balance?.balance);
    const tokenBalances = await this.fetchAllTokenBalances();

    const positions: Position[] = [
      {
        id: "pos-hbar-live",
        symbol: "HBAR",
        name: "Hedera",
        assetType: "hbar",
        quantity: tinybarBalance / 100_000_000,
        priceUsd: 0,
        valueUsd: 0,
        source: "Live Hedera Mirror Node REST",
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
        assetType: "token",
        quantity: normalizedQuantity,
        priceUsd: 0,
        valueUsd: 0,
        hederaTokenId: tokenId,
        source: "Live Hedera Mirror Node REST",
      });
    }

    return positions;
  }

  private async fetchAllTokenBalances() {
    const all: MirrorTokenBalance[] = [];
    let nextPath: string | null = `/api/v1/accounts/${encodeURIComponent(this.treasuryAccountId)}/tokens?limit=100&order=asc`;

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
    const url =
      pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
        ? pathOrUrl
        : `${this.mirrorNodeBaseUrl}${pathOrUrl}`;
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

  private balanceToPositions(balance: AccountBalance, source: string) {
    const positions: Position[] = [
      {
        id: "pos-hbar-live",
        symbol: "HBAR",
        name: "Hedera",
        assetType: "hbar" as const,
        quantity: balance.hbars.toTinybars().toNumber() / 100_000_000,
        priceUsd: 0,
        valueUsd: 0,
        source,
      },
    ];

    for (const [tokenId, amount] of balance.tokens) {
      positions.push({
        id: `pos-${tokenId.toString()}`,
        symbol: tokenId.toString(),
        name: tokenId.toString(),
        assetType: "token" as const,
        quantity: amount.toNumber(),
        priceUsd: 0,
        valueUsd: 0,
        hederaTokenId: tokenId.toString(),
        source,
      });
    }

    return positions;
  }

  private hashscanUrl(transactionId: string) {
    const networkSegment = this.network === "mainnet" ? "mainnet" : "testnet";
    return `https://hashscan.io/${networkSegment}/transaction/${transactionId}`;
  }
}
