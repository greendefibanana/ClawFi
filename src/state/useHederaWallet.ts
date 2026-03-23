import { useEffect, useEffectEvent, useRef, useState } from "react";
import { LedgerId } from "@hashgraph/sdk";
import type { DAppConnector, DAppSigner } from "@hashgraph/hedera-wallet-connect";

type WalletConnectionStatus = "unavailable" | "idle" | "connecting" | "connected" | "error";

type WalletState = {
  status: WalletConnectionStatus;
  accountId: string | null;
  error: string | null;
  network: "testnet" | "mainnet";
};

const DEFAULT_WALLET_STATE: WalletState = {
  status: "idle",
  accountId: null,
  error: null,
  network: readWalletNetwork(),
};

export function useHederaWallet() {
  const connectorRef = useRef<DAppConnector | null>(null);
  const signerRef = useRef<DAppSigner | null>(null);
  const [state, setState] = useState<WalletState>(() => {
    const projectId = readWalletConnectProjectId();
    if (!projectId) {
      return {
        ...DEFAULT_WALLET_STATE,
        status: "unavailable",
        error: "VITE_WALLETCONNECT_PROJECT_ID is not configured.",
      };
    }
    return DEFAULT_WALLET_STATE;
  });

  const ensureConnector = useEffectEvent(async () => {
    if (connectorRef.current) {
      return connectorRef.current;
    }

    if (!readWalletConnectProjectId()) {
      throw new Error("VITE_WALLETCONNECT_PROJECT_ID is not configured.");
    }

    const connector = await createConnector();
    await connector.init({ logger: "error" });
    connectorRef.current = connector;
    syncFromConnector(connector);
    return connector;
  });

  useEffect(() => {
    if (!readWalletConnectProjectId()) {
      return;
    }

    let cancelled = false;
    void ensureConnector()
      .then((connector) => {
        if (cancelled || !connector) {
          return;
        }
        syncFromConnector(connector);
      })
      .catch((error) => {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: "error",
            error: error instanceof Error ? error.message : "Unable to initialize WalletConnect.",
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ensureConnector]);

  async function createConnector() {
    const walletModule = await import("@hashgraph/hedera-wallet-connect");
    const projectId = readWalletConnectProjectId();
    const connector = new walletModule.DAppConnector(
      {
        name: "ClawFi",
        description: "Wallet-connected treasury workforce on Hedera",
        url: typeof window !== "undefined" ? window.location.origin : "http://localhost",
        icons: ["https://hashscan.io/favicon.ico"],
      },
      readWalletLedgerId(),
      projectId,
      Object.values(walletModule.HederaJsonRpcMethod),
      [walletModule.HederaSessionEvent.AccountsChanged, walletModule.HederaSessionEvent.ChainChanged],
      [readWalletChainId()],
    );
    return connector;
  }

  function syncFromConnector(connector: DAppConnector) {
    const signer = connector.signers[0] ?? null;
    signerRef.current = signer;
    setState((current) => ({
      ...current,
      status: signer ? "connected" : current.status === "connecting" ? "idle" : current.status,
      accountId: signer ? signer.getAccountId().toString() : null,
      error: null,
      network: readWalletNetwork(),
    }));
  }

  async function connect() {
    setState((current) => ({
      ...current,
      status: "connecting",
      error: null,
    }));

    try {
      const connector = await ensureConnector();
      await connector.openModal();
      syncFromConnector(connector);
      if (!signerRef.current) {
        throw new Error("Wallet connected but no Hedera signer account was returned.");
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Wallet connection failed.",
      }));
      throw error;
    }
  }

  async function disconnect() {
    const connector = connectorRef.current;
    if (!connector) {
      signerRef.current = null;
      setState(DEFAULT_WALLET_STATE);
      return;
    }

    try {
      await connector.disconnectAll();
    } catch {
      // Ignore disconnect failures and clear local session state.
    }

    signerRef.current = null;
    setState(DEFAULT_WALLET_STATE);
  }

  return {
    ...state,
    isAvailable: state.status !== "unavailable",
    connect,
    disconnect,
    getSigner: () => signerRef.current,
  };
}

function readWalletConnectProjectId() {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const value = viteEnv?.VITE_WALLETCONNECT_PROJECT_ID?.trim();
  return value || "";
}

function readWalletNetwork() {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return viteEnv?.VITE_CLAWFI_HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

function readWalletLedgerId() {
  return readWalletNetwork() === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET;
}

function readWalletChainId() {
  return readWalletNetwork() === "mainnet" ? "hedera:mainnet" : "hedera:testnet";
}
