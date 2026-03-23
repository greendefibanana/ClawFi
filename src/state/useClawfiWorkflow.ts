import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { demoStrategyConfig } from "../core/scenarios/demoScenario";
import type { HederaMode, StrategyConfig, UserAgentConfig, WorkflowResult } from "../core/models/schemas";
import { mockWorkflowResult } from "../data/mockWorkflowResult";

export type SessionListEntry = {
  sessionId: string;
  scenarioId: string;
  goal: string;
  mode: HederaMode;
  receiptCount: number;
  payoutCount: number;
  createdAt: string | null;
};

export type SessionEvidence = {
  generatedAt: string;
  sessionId: string;
  scenarioId: string;
  goal: string;
  mode: string;
  network: string;
  treasuryAccountId: string;
  summary: {
    receiptCount: number;
    payoutCount: number;
    taskCount: number;
    approvedActionCount: number;
  };
  scheduledExecutions: Array<{
    id: string;
    actionId: string;
    actionTitle: string;
    status: string;
    scheduleId: string | null;
    transactionId: string | null;
  }>;
  signoffChecklist: Array<{
    item: string;
    status: "pass" | "pending";
    notes: string;
  }>;
};

export type WorkflowRunOptions = {
  hederaMode: HederaMode;
  liveExecution: boolean;
  autoApprove: boolean;
  walletAccountId?: string;
};

export type WorkflowStrategyConfig = StrategyConfig;

export type WalletActionResult = {
  actionId: string;
  status: "executed" | "failed" | "skipped";
  transactionId?: string;
  explorerUrl?: string;
  detail: string;
};

export type WalletPayoutResult = {
  taskId: string;
  transactionId: string;
};

type WorkflowState = {
  data: WorkflowResult | null;
  evidence: SessionEvidence | null;
  sessions: SessionListEntry[];
  selectedSessionId: string | null;
  runOptions: WorkflowRunOptions;
  strategyConfig: WorkflowStrategyConfig;
  isLoading: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  isHistoryLoading: boolean;
  error: string | null;
  userAgents: UserAgentConfig[];
};

type RunWorkflowInput = {
  goal?: string;
  userAgents?: UserAgentConfig[];
  runOptions?: Partial<WorkflowRunOptions>;
  strategyConfig?: Partial<WorkflowStrategyConfig>;
};

const defaultRunOptions: WorkflowRunOptions = {
  hederaMode: "simulated",
  liveExecution: false,
  autoApprove: false,
  walletAccountId: undefined,
};

export function useClawfiWorkflow() {
  const [state, setState] = useState<WorkflowState>({
    data: null,
    evidence: null,
    sessions: [],
    selectedSessionId: null,
    runOptions: defaultRunOptions,
    strategyConfig: demoStrategyConfig,
    isLoading: true,
    isApproving: false,
    isRejecting: false,
    isHistoryLoading: false,
    error: null,
    userAgents: [],
  });
  const sessionIdRef = useRef<string | null>(null);
  const userAgentsRef = useRef<UserAgentConfig[]>([]);
  const runOptionsRef = useRef<WorkflowRunOptions>(defaultRunOptions);
  const strategyConfigRef = useRef<WorkflowStrategyConfig>(demoStrategyConfig);

  const loadSessionArtifacts = useCallback(async (sessionId: string) => {
    const baseUrl = getApiBaseUrl();
    const [sessionsResult, evidenceResult] = await Promise.allSettled([
      requestJson<{ sessions: SessionListEntry[] }>(`${baseUrl}/api/sessions`),
      requestJson<SessionEvidence>(`${baseUrl}/api/sessions/${sessionId}/evidence`),
    ]);

    startTransition(() => {
      setState((current) => ({
        ...current,
        sessions: sessionsResult.status === "fulfilled" ? sessionsResult.value.sessions : current.sessions,
        evidence: evidenceResult.status === "fulfilled" ? evidenceResult.value : null,
        isHistoryLoading: false,
      }));
    });
  }, []);

  const setWorkflowState = useCallback(
    (data: WorkflowResult, userAgents: UserAgentConfig[], runOptions: WorkflowRunOptions) => {
      sessionIdRef.current = data.sessionId;
      userAgentsRef.current = userAgents;
      runOptionsRef.current = runOptions;
      strategyConfigRef.current = data.strategyConfig;
      startTransition(() => {
        setState((current) => ({
          ...current,
          data,
          evidence: current.evidence?.sessionId === data.sessionId ? current.evidence : null,
          selectedSessionId: data.sessionId,
          runOptions,
          strategyConfig: data.strategyConfig,
          isLoading: false,
          isApproving: false,
          isRejecting: false,
          isHistoryLoading: true,
          error: null,
          userAgents: data.userAgents?.length ? data.userAgents : userAgents,
        }));
      });
      void loadSessionArtifacts(data.sessionId);
    },
    [loadSessionArtifacts],
  );

  const load = useCallback(
    async (input: RunWorkflowInput = {}, preferLatest = false) => {
      const nextAgents = input.userAgents ?? userAgentsRef.current;
      const nextRunOptions = mergeRunOptions(runOptionsRef.current, input.runOptions);
      const nextStrategyConfig = mergeStrategyConfig(strategyConfigRef.current, input.strategyConfig);
      userAgentsRef.current = nextAgents;
      runOptionsRef.current = nextRunOptions;
      strategyConfigRef.current = nextStrategyConfig;
      setState((current) => ({
        ...current,
        isLoading: true,
        error: null,
        userAgents: nextAgents,
        runOptions: nextRunOptions,
        strategyConfig: nextStrategyConfig,
      }));

      try {
        const data = await loadFromApiOrLocal({
          goal: input.goal,
          userAgents: nextAgents,
          preferLatest,
          runOptions: nextRunOptions,
          strategyConfig: nextStrategyConfig,
        });
        setWorkflowState(data, nextAgents, nextRunOptions);
      } catch (error) {
        sessionIdRef.current = null;
        startTransition(() => {
          setState((current) => ({
            ...current,
            data: null,
            evidence: null,
            selectedSessionId: null,
            isLoading: false,
            isApproving: false,
            isRejecting: false,
            isHistoryLoading: false,
            error: error instanceof Error ? error.message : "Unable to run ClawFi workflow.",
          }));
        });
      }
    },
    [setWorkflowState],
  );

  const approve = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    setState((current) => ({ ...current, isApproving: true, error: null }));

    try {
      const baseUrl = getApiBaseUrl();
      const payload = await requestJson<WorkflowResult | { session: WorkflowResult }>(
        `${baseUrl}/api/sessions/${sessionId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvedBy: "dashboard-operator" }),
        },
      );
      const session = extractSession(payload);
      setWorkflowState(session, userAgentsRef.current, runOptionsRef.current);
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          isApproving: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to approve pending session. Ensure API mode is enabled.",
        }));
      });
    }
  }, [setWorkflowState]);

  const completeWalletApproval = useCallback(async (input: {
    approvedBy: string;
    walletAccountId: string;
    actionResults: WalletActionResult[];
    payoutResults: WalletPayoutResult[];
  }) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      throw new Error("No active session to finalize.");
    }

    setState((current) => ({ ...current, isApproving: true, error: null }));

    try {
      const baseUrl = getApiBaseUrl();
      const payload = await requestJson<WorkflowResult | { session: WorkflowResult }>(
        `${baseUrl}/api/sessions/${sessionId}/wallet-complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const session = extractSession(payload);
      setWorkflowState(session, userAgentsRef.current, runOptionsRef.current);
      return session;
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          isApproving: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to finalize wallet-signed session approval.",
        }));
      });
      throw error;
    }
  }, [setWorkflowState]);

  const reject = useCallback(
    async (reason = "Operator rejected pending execution settlement.") => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      setState((current) => ({ ...current, isRejecting: true, error: null }));

      try {
        const baseUrl = getApiBaseUrl();
        const payload = await requestJson<WorkflowResult | { session: WorkflowResult }>(
          `${baseUrl}/api/sessions/${sessionId}/reject`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rejectedBy: "dashboard-operator",
              reason,
            }),
          },
        );
        const session = extractSession(payload);
        setWorkflowState(session, userAgentsRef.current, runOptionsRef.current);
      } catch (error) {
        startTransition(() => {
          setState((current) => ({
            ...current,
            isRejecting: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to reject pending session. Ensure API mode is enabled.",
          }));
        });
      }
    },
    [setWorkflowState],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      setState((current) => ({
        ...current,
        selectedSessionId: sessionId,
        isHistoryLoading: true,
        error: null,
      }));

      try {
        const baseUrl = getApiBaseUrl();
        const [sessionPayload, evidencePayload, sessionsPayload] = await Promise.all([
          requestJson<WorkflowResult | { session: WorkflowResult }>(`${baseUrl}/api/sessions/${sessionId}`),
          requestJson<SessionEvidence>(`${baseUrl}/api/sessions/${sessionId}/evidence`),
          requestJson<{ sessions: SessionListEntry[] }>(`${baseUrl}/api/sessions`),
        ]);
        const session = extractSession(sessionPayload);
        sessionIdRef.current = session.sessionId;
        strategyConfigRef.current = session.strategyConfig;
        startTransition(() => {
          setState((current) => ({
            ...current,
            data: session,
            evidence: evidencePayload,
            sessions: sessionsPayload.sessions,
            selectedSessionId: session.sessionId,
            isLoading: false,
            isHistoryLoading: false,
            error: null,
            strategyConfig: session.strategyConfig,
            userAgents: session.userAgents?.length ? session.userAgents : current.userAgents,
          }));
        });
      } catch (error) {
        startTransition(() => {
          setState((current) => ({
            ...current,
            isHistoryLoading: false,
            error: error instanceof Error ? error.message : "Unable to load session history entry.",
          }));
        });
      }
    },
    [],
  );

  useEffect(() => {
    void load({}, true);
  }, [load]);

  return {
    ...state,
    rerun: (input?: RunWorkflowInput) => {
      void load(input);
    },
    approve: () => {
      void approve();
    },
    completeWalletApproval,
    reject: (reason?: string) => {
      void reject(reason);
    },
    selectSession: (sessionId: string) => {
      void selectSession(sessionId);
    },
    setRunOptions: (runOptions: Partial<WorkflowRunOptions>) => {
      const merged = mergeRunOptions(runOptionsRef.current, runOptions);
      runOptionsRef.current = merged;
      setState((current) => ({ ...current, runOptions: merged }));
    },
    setStrategyConfig: (strategyConfig: Partial<WorkflowStrategyConfig>) => {
      const merged = mergeStrategyConfig(strategyConfigRef.current, strategyConfig);
      strategyConfigRef.current = merged;
      setState((current) => ({ ...current, strategyConfig: merged }));
    },
    setUserAgents: (agents: UserAgentConfig[]) => {
      userAgentsRef.current = agents;
      setState((current) => ({ ...current, userAgents: agents }));
    },
  };
}

async function loadFromApiOrLocal(input: {
  goal?: string;
  userAgents?: UserAgentConfig[];
  preferLatest?: boolean;
  runOptions: WorkflowRunOptions;
  strategyConfig: WorkflowStrategyConfig;
}): Promise<WorkflowResult> {
  const baseUrl = getApiBaseUrl();

  try {
    if (input.preferLatest) {
      const latest = await requestJson<WorkflowResult | { session: WorkflowResult }>(`${baseUrl}/api/sessions/latest`);
      return extractSession(latest);
    }

    const payload = await requestJson<WorkflowResult | { session: WorkflowResult }>(`${baseUrl}/api/sessions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hederaMode: input.runOptions.hederaMode,
        autoApprove: input.runOptions.hederaMode === "wallet_connected" ? false : input.runOptions.autoApprove,
        strategyConfig: {
          ...input.strategyConfig,
          simulateOnly: !input.runOptions.liveExecution,
          approvalRequired:
            input.runOptions.hederaMode === "wallet_connected" ? true : input.strategyConfig.approvalRequired,
        },
        ...(input.runOptions.walletAccountId ? { walletAccountId: input.runOptions.walletAccountId } : {}),
        ...(input.goal?.trim() ? { goal: input.goal.trim() } : {}),
        ...(input.userAgents?.length ? { userAgents: input.userAgents } : {}),
      }),
    });
    return extractSession(payload);
  } catch (error) {
    if (input.preferLatest && error instanceof ApiError && error.status === 404) {
      return loadFromApiOrLocal({
        goal: input.goal,
        userAgents: input.userAgents,
        preferLatest: false,
        runOptions: input.runOptions,
        strategyConfig: input.strategyConfig,
      });
    }
    if (isRecoverableApiError(error) && isMockFallbackEnabled()) {
      return mockWorkflowResult;
    }
    throw error;
  }
}

function mergeRunOptions(current: WorkflowRunOptions, next?: Partial<WorkflowRunOptions>): WorkflowRunOptions {
  return {
    ...current,
    ...next,
  };
}

function mergeStrategyConfig(
  current: WorkflowStrategyConfig,
  next?: Partial<WorkflowStrategyConfig>,
): WorkflowStrategyConfig {
  return {
    ...current,
    ...next,
  };
}

function getApiBaseUrl() {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const processEnv =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : undefined;
  return viteEnv?.VITE_CLAWFI_API_BASE?.trim() || processEnv?.VITE_CLAWFI_API_BASE?.trim() || "http://127.0.0.1:8787";
}

function isMockFallbackEnabled() {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const processEnv =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : undefined;
  return (
    viteEnv?.VITE_CLAWFI_ALLOW_MOCK_FALLBACK?.trim() === "true" ||
    processEnv?.VITE_CLAWFI_ALLOW_MOCK_FALLBACK?.trim() === "true"
  );
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = resolveRequestTimeoutMs(url, init);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as T | { error?: string }) : null;
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}.`;
      throw new ApiError(response.status, message);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("ClawFi API request timed out before the server finished. For live Hedera runs, keep the page open and allow more time.");
    }
    if (error instanceof TypeError) {
      throw new Error(buildApiUnavailableMessage(url));
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function resolveRequestTimeoutMs(url: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "POST" && /\/api\/sessions\/run$/.test(url)) {
    return 180_000;
  }
  if (method === "POST" && /\/api\/sessions\/[^/]+\/(approve|wallet-complete|reject)$/.test(url)) {
    return 180_000;
  }
  if (method === "GET" && /\/api\/sessions\/[^/]+\/evidence$/.test(url)) {
    return 45_000;
  }
  return 20_000;
}

function buildApiUnavailableMessage(url: string) {
  const apiOrigin = safeResolveOrigin(url);
  return `Unable to reach the ClawFi API at ${apiOrigin}. Start it with npm.cmd run dev:api, then reload the app.`;
}

function safeResolveOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return getApiBaseUrl();
  }
}

function extractSession(payload: WorkflowResult | { session: WorkflowResult }) {
  return "session" in payload ? payload.session : payload;
}

function isRecoverableApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error.status >= 500;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return error instanceof Error && error.message.includes("timed out");
}
