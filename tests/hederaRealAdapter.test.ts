import { afterEach, describe, expect, it, vi } from "vitest";
import { RealHederaTreasuryAdapter } from "../src/hedera/sdkAdapter.server";

describe("RealHederaTreasuryAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads HBAR and token balances from Mirror Node REST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/api/v1/accounts/0.0.1001/tokens")) {
          return Promise.resolve(
            new Response(
            JSON.stringify({
              tokens: [
                { token_id: "0.0.456858", balance: "2500000", decimals: 6 },
                { token_id: "0.0.731861", balance: "1000", decimals: 0 },
              ],
              links: { next: null },
            }),
            { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
          JSON.stringify({
            balance: { balance: "1234500000" },
          }),
          { status: 200 },
          ),
        );
      }),
    );

    const adapter = new RealHederaTreasuryAdapter({
      network: "testnet",
      operatorId: "0.0.1001",
      operatorKey: "302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const positions = await adapter.readBalances();
    const hbar = positions.find((entry) => entry.symbol === "HBAR");
    const usdc = positions.find((entry) => entry.hederaTokenId === "0.0.456858");

    expect(hbar?.quantity).toBeCloseTo(12.345);
    expect(usdc?.quantity).toBe(2.5);
    expect(usdc?.source).toContain("Mirror Node");
  });

  it("follows paginated token balance links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/tokens?limit=100&order=asc") && !url.includes("account.id=eq")) {
          return Promise.resolve(
            new Response(
            JSON.stringify({
              tokens: [{ token_id: "0.0.111", balance: "200", decimals: 0 }],
              links: { next: "?limit=100&account.id=eq:0.0.1001&token.id=gt:0.0.111" },
            }),
            { status: 200 },
            ),
          );
        }
        if (url.includes("token.id=gt:0.0.111")) {
          return Promise.resolve(
            new Response(
            JSON.stringify({
              tokens: [{ token_id: "0.0.222", balance: "300", decimals: 0 }],
              links: { next: null },
            }),
            { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
          JSON.stringify({
            balance: { balance: "100000000" },
          }),
          { status: 200 },
          ),
        );
      }),
    );

    const adapter = new RealHederaTreasuryAdapter({
      network: "testnet",
      operatorId: "0.0.1001",
      operatorKey: "302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const positions = await adapter.readBalances();
    const tokenIds = positions.map((entry) => entry.hederaTokenId).filter(Boolean);
    expect(tokenIds).toContain("0.0.111");
    expect(tokenIds).toContain("0.0.222");
  });
});
