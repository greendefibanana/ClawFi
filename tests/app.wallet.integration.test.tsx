import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowResult } from "../src/core/models/schemas";
import { mockWorkflowResult } from "../src/data/mockWorkflowResult";

const walletMocks = vi.hoisted(() => {
  const signer = { id: "mock-wallet-signer" };
  return {
    signer,
    state: {
      status: "connected" as const,
      accountId: "0.0.7001",
      error: null,
      isAvailable: true,
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      getSigner: vi.fn(() => signer),
    },
    executeWalletApproval: vi.fn(),
  };
});

vi.mock("../src/state/useHederaWallet", () => ({
  useHederaWallet: () => walletMocks.state,
}));

vi.mock("../src/wallet/walletExecution", () => ({
  executeWalletApproval: walletMocks.executeWalletApproval,
}));

import App from "../src/App";

function buildSession(overrides: Partial<WorkflowResult> = {}): WorkflowResult {
  const base = structuredClone(mockWorkflowResult);
  return {
    ...base,
    sessionId: `session-${Math.random().toString(16).slice(2, 10)}`,
    ...overrides,
    treasury: {
      ...base.treasury,
      ...overrides.treasury,
    },
    actionPlan: {
      ...base.actionPlan,
      ...overrides.actionPlan,
    },
    strategyConfig: {
      ...base.strategyConfig,
      ...overrides.strategyConfig,
    },
    hederaStatus: {
      ...base.hederaStatus,
      ...overrides.hederaStatus,
    },
    scheduledExecutions: overrides.scheduledExecutions ?? base.scheduledExecutions,
    payouts: overrides.payouts ?? base.payouts,
    rewardReservations: overrides.rewardReservations ?? base.rewardReservations,
  };
}

function buildEvidence(session: WorkflowResult) {
  return {
    generatedAt: new Date().toISOString(),
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    goal: session.goal,
    mode: session.hederaStatus.mode,
    network: session.treasury.network,
    treasuryAccountId: session.treasury.accountId,
    summary: {
      receiptCount: session.receipts.length,
      payoutCount: session.payouts.length,
      taskCount: session.tasks.length,
      approvedActionCount: session.actionPlan.actions.length,
    },
    scheduledExecutions: session.scheduledExecutions.map((entry) => ({
      id: entry.id,
      actionId: entry.actionId,
      actionTitle: entry.actionTitle,
      status: entry.status,
      scheduleId: entry.scheduleId ?? null,
      transactionId: entry.transactionId ?? null,
    })),
    signoffChecklist: [
      {
        item: "Wallet approval posted back to API",
        status: "pass" as const,
        notes: `${session.scheduledExecutions.length} wallet-managed actions tracked.`,
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveFetchUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function parseJsonBody(init?: RequestInit) {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
}

function isActionResultEntry(value: unknown): value is { actionId: string; status: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "actionId" in value &&
    typeof value.actionId === "string" &&
    "status" in value &&
    typeof value.status === "string"
  );
}

function isPayoutResultEntry(value: unknown): value is { taskId: string } {
  return typeof value === "object" && value !== null && "taskId" in value && typeof value.taskId === "string";
}

describe("App wallet integration", () => {
  beforeEach(() => {
    walletMocks.state.status = "connected";
    walletMocks.state.accountId = "0.0.7001";
    walletMocks.state.error = null;
    walletMocks.state.isAvailable = true;
    walletMocks.state.getSigner.mockReturnValue(walletMocks.signer);
    walletMocks.executeWalletApproval.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("runs a wallet-connected session from the frontend and finalizes it through the wallet completion endpoint", async () => {
    const initialSession = buildSession({
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "pending",
      },
      payouts: [],
    });
    const pendingWalletSession = buildSession({
      goal: "Run this from my browser wallet.",
      treasury: {
        ...mockWorkflowResult.treasury,
        accountId: "0.0.7001",
        mode: "wallet_connected",
      },
      hederaStatus: {
        ...mockWorkflowResult.hederaStatus,
        mode: "wallet_connected",
      },
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "pending",
        notes: ["Awaiting browser wallet approval."],
      },
      payouts: [],
    });
    const approvedWalletSession = buildSession({
      sessionId: pendingWalletSession.sessionId,
      goal: pendingWalletSession.goal,
      treasury: pendingWalletSession.treasury,
      hederaStatus: pendingWalletSession.hederaStatus,
      actionPlan: {
        ...pendingWalletSession.actionPlan,
        approvalState: "approved",
        notes: [...pendingWalletSession.actionPlan.notes, "Approved and executed through a connected browser wallet."],
      },
      scheduledExecutions: pendingWalletSession.scheduledExecutions.map((entry, index) => ({
        ...entry,
        status: "executed",
        transactionId: `0.0.7001@${1730000000 + index}.00000000${index + 1}`,
      })),
      payouts: pendingWalletSession.tasks
        .filter((task) => task.status === "completed")
        .map((task, index) => ({
          id: `pay-wallet-${index}`,
          taskId: task.id,
          agentName: task.agentName,
          rewardUsd: task.rewardUsd,
          rewardHbar: Math.max(1, task.rewardUsd / 0.11),
          status: "settled" as const,
          recipientAccountId: pendingWalletSession.treasury.accountId,
          settlementMode: "wallet_connected" as const,
          transactionId: `0.0.7001@${1730000100 + index}.00000000${index + 1}`,
        })),
    });

    let activeWalletSession = pendingWalletSession;

    walletMocks.executeWalletApproval.mockResolvedValue({
      approvedBy: "0.0.7001",
      walletAccountId: "0.0.7001",
      actionResults: pendingWalletSession.actionPlan.actions.map((action, index) => ({
        actionId: action.id,
        status: "executed" as const,
        transactionId: `0.0.7001@${1730000000 + index}.00000000${index + 1}`,
        explorerUrl: `https://hashscan.io/testnet/transaction/0.0.7001@${1730000000 + index}.00000000${index + 1}`,
        detail: `Executed ${action.title} from the connected wallet.`,
      })),
      payoutResults: pendingWalletSession.tasks
        .filter((task) => task.status === "completed")
        .map((task, index) => ({
          taskId: task.id,
          transactionId: `0.0.7001@${1730000100 + index}.00000000${index + 1}`,
        })),
    });

    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/api/sessions/latest")) {
        return Promise.resolve(jsonResponse({ error: "No sessions found." }, 404));
      }
      if (url.endsWith("/api/sessions/run")) {
        const body = parseJsonBody(init) ?? {};
        if (body.hederaMode === "wallet_connected") {
          return Promise.resolve(jsonResponse({ session: pendingWalletSession }, 201));
        }
        return Promise.resolve(jsonResponse({ session: initialSession }, 201));
      }
      if (url.endsWith(`/api/sessions/${pendingWalletSession.sessionId}/wallet-complete`)) {
        activeWalletSession = approvedWalletSession;
        return Promise.resolve(jsonResponse({ session: approvedWalletSession }, 200));
      }
      if (url.endsWith(`/api/sessions/${initialSession.sessionId}/evidence`)) {
        return Promise.resolve(jsonResponse(buildEvidence(initialSession), 200));
      }
      if (url.endsWith(`/api/sessions/${pendingWalletSession.sessionId}/evidence`)) {
        return Promise.resolve(jsonResponse(buildEvidence(activeWalletSession), 200));
      }
      if (url.endsWith("/api/sessions")) {
        return Promise.resolve(jsonResponse({
          sessions: [
            {
              sessionId: activeWalletSession.sessionId,
              scenarioId: activeWalletSession.scenarioId,
              goal: activeWalletSession.goal,
              mode: activeWalletSession.hederaStatus.mode,
              receiptCount: activeWalletSession.receipts.length,
              payoutCount: activeWalletSession.payouts.length,
              createdAt: activeWalletSession.activityLog[0]?.timestamp ?? null,
            },
          ],
        }));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findAllByRole("button", { name: /approve/i }, { timeout: 10_000 });

    fireEvent.click(screen.getByRole("button", { name: /strategy controls/i }));
    fireEvent.change(screen.getByLabelText(/hedera mode/i), { target: { value: "wallet_connected" } });
    fireEvent.click(screen.getByRole("button", { name: /save policies/i }));

    const input = screen.getByLabelText(/strategy goal/i);
    fireEvent.change(input, { target: { value: pendingWalletSession.goal } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getAllByText(pendingWalletSession.goal).length).toBeGreaterThan(1);
    });

    const [approveButton] = screen.getAllByRole("button", { name: /approve/i });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(walletMocks.executeWalletApproval).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          resolveFetchUrl(call[0]).endsWith(`/api/sessions/${pendingWalletSession.sessionId}/wallet-complete`),
        ),
      ).toBe(true);
    });

    const approvalArgs = walletMocks.executeWalletApproval.mock.calls[0]?.[0] as
      | {
          session: WorkflowResult;
          signer: unknown;
          walletAccountId: string;
        }
      | undefined;
    expect(approvalArgs?.session.sessionId).toBe(pendingWalletSession.sessionId);
    expect(approvalArgs?.session.treasury.accountId).toBe("0.0.7001");
    expect(approvalArgs?.signer).toBe(walletMocks.signer);
    expect(approvalArgs?.walletAccountId).toBe("0.0.7001");

    const walletRunCall = fetchMock.mock.calls
      .filter((call) => resolveFetchUrl(call[0]).endsWith("/api/sessions/run"))
      .find((call) => parseJsonBody(call[1])?.hederaMode === "wallet_connected");
    const walletRunBody = parseJsonBody(walletRunCall?.[1]);
    expect(walletRunBody?.hederaMode).toBe("wallet_connected");
    expect(walletRunBody?.autoApprove).toBe(false);
    expect(walletRunBody?.walletAccountId).toBe("0.0.7001");

    const walletCompleteCall = fetchMock.mock.calls.find((call) =>
      resolveFetchUrl(call[0]).endsWith(`/api/sessions/${pendingWalletSession.sessionId}/wallet-complete`),
    );
    const walletCompleteBody = parseJsonBody(walletCompleteCall?.[1]);
    const actionResults = Array.isArray(walletCompleteBody?.actionResults) ? walletCompleteBody.actionResults : [];
    const payoutResults = Array.isArray(walletCompleteBody?.payoutResults) ? walletCompleteBody.payoutResults : [];
    expect(walletCompleteBody?.approvedBy).toBe("0.0.7001");
    expect(walletCompleteBody?.walletAccountId).toBe("0.0.7001");
    expect(
      actionResults.some(
        (entry) =>
          isActionResultEntry(entry) &&
          entry.actionId === pendingWalletSession.actionPlan.actions[0]?.id &&
          entry.status === "executed",
      ),
    ).toBe(true);
    expect(
      payoutResults.some((entry) => isPayoutResultEntry(entry) && entry.taskId === pendingWalletSession.tasks[0]?.id),
    ).toBe(true);
  }, 20_000);
});
