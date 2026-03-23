import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { mockWorkflowResult } from "../src/data/mockWorkflowResult";
import type { WorkflowResult } from "../src/core/models/schemas";

function buildSession(overrides: Partial<WorkflowResult> = {}): WorkflowResult {
  const base = structuredClone(mockWorkflowResult);
  return {
    ...base,
    sessionId: `session-${Math.random().toString(16).slice(2, 10)}`,
    ...overrides,
    actionPlan: {
      ...base.actionPlan,
      ...overrides.actionPlan,
    },
    strategyConfig: {
      ...base.strategyConfig,
      ...overrides.strategyConfig,
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
        item: "Task and decision receipts emitted",
        status: "pass" as const,
        notes: `${session.receipts.length} receipts captured.`,
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

describe("App integration", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows an actionable message when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch"))));

    render(<App />);

    expect(
      await screen.findByText(
        "Unable to reach the ClawFi API at http://127.0.0.1:8787. Start it with npm.cmd run dev:api, then reload the app.",
      ),
    ).toBeInTheDocument();
  });

  it("creates a pending session after the initial latest-session miss and settles it from the approval rail", async () => {
    const pendingSession = buildSession({
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "pending",
      },
      payouts: [],
    });
    const approvedSession = buildSession({
      sessionId: pendingSession.sessionId,
      actionPlan: {
        ...pendingSession.actionPlan,
        approvalState: "approved",
      },
    });

    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/api/sessions/latest")) return Promise.resolve(jsonResponse({ error: "No sessions found." }, 404));
      if (url.endsWith("/api/sessions/run")) return Promise.resolve(jsonResponse({ session: pendingSession }, 201));
      if (url.endsWith(`/api/sessions/${pendingSession.sessionId}/approve`)) return Promise.resolve(jsonResponse({ session: approvedSession }, 200));
      if (url.endsWith(`/api/sessions/${pendingSession.sessionId}/evidence`)) {
        const target = init?.method === "POST" ? approvedSession : pendingSession;
        return Promise.resolve(jsonResponse(buildEvidence(target), 200));
      }
      if (url.endsWith("/api/sessions")) {
        return Promise.resolve(jsonResponse({
          sessions: [
            {
              sessionId: pendingSession.sessionId,
              scenarioId: pendingSession.scenarioId,
              goal: pendingSession.goal,
              mode: pendingSession.hederaStatus.mode,
              receiptCount: pendingSession.receipts.length,
              payoutCount: pendingSession.payouts.length,
              createdAt: pendingSession.activityLog[0]?.timestamp ?? null,
            },
          ],
        }));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText(/approval required before execution/i, undefined, { timeout: 10_000 })).toBeInTheDocument();

    const [approveButton] = await screen.findAllByRole("button", { name: /approve/i }, { timeout: 10_000 });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => resolveFetchUrl(call[0]).endsWith(`/api/sessions/${pendingSession.sessionId}/approve`))).toBe(true);
    });

    const runCall = fetchMock.mock.calls.find((call) => resolveFetchUrl(call[0]).endsWith("/api/sessions/run"));
    expect(runCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(parseJsonBody(runCall?.[1])).toMatchObject({
      hederaMode: "simulated",
      autoApprove: false,
      strategyConfig: {
        simulateOnly: true,
        approvalRequired: true,
      },
    });
  }, 20_000);

  it("submits run options and the operator goal through the session run API", async () => {
    const pendingSession = buildSession({
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "pending",
      },
      payouts: [],
    });
    const customGoal = "Rotate treasury into the safest Hedera yield above 8% APY with manual approval.";
    const rerunSession = buildSession({
      goal: customGoal,
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "approved_with_changes",
      },
      strategyConfig: {
        ...mockWorkflowResult.strategyConfig,
        simulateOnly: false,
      },
      payouts: mockWorkflowResult.payouts,
    });

    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/api/sessions/latest")) return Promise.resolve(jsonResponse({ error: "No sessions found." }, 404));
      if (url.endsWith("/api/sessions/run")) {
        const body = parseJsonBody(init) ?? {};
        if (body.goal === customGoal) {
          return Promise.resolve(jsonResponse({ session: rerunSession }, 201));
        }
        return Promise.resolve(jsonResponse({ session: pendingSession }, 201));
      }
      if (url.endsWith(`/api/sessions/${pendingSession.sessionId}/evidence`)) return Promise.resolve(jsonResponse(buildEvidence(pendingSession), 200));
      if (url.endsWith(`/api/sessions/${rerunSession.sessionId}/evidence`)) return Promise.resolve(jsonResponse(buildEvidence(rerunSession), 200));
      if (url.endsWith("/api/sessions")) {
        return Promise.resolve(jsonResponse({
          sessions: [
            {
              sessionId: rerunSession.sessionId,
              scenarioId: rerunSession.scenarioId,
              goal: rerunSession.goal,
              mode: rerunSession.hederaStatus.mode,
              receiptCount: rerunSession.receipts.length,
              payoutCount: rerunSession.payouts.length,
              createdAt: rerunSession.activityLog[0]?.timestamp ?? null,
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
    fireEvent.change(screen.getByLabelText(/hedera mode/i), { target: { value: "real_scaffolded" } });
    fireEvent.click(screen.getByLabelText(/enable live execution branch/i));
    fireEvent.click(screen.getByLabelText(/auto-approve settlement/i));
    fireEvent.click(screen.getByRole("button", { name: /save policies/i }));

    const input = screen.getByLabelText(/strategy goal/i);
    fireEvent.change(input, { target: { value: customGoal } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getAllByText(customGoal).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(pendingSession.goal)).toBeInTheDocument();

    const runCalls = fetchMock.mock.calls.filter((call) => resolveFetchUrl(call[0]).endsWith("/api/sessions/run"));
    const rerunCall = runCalls.at(-1);
    expect(rerunCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(parseJsonBody(rerunCall?.[1])).toEqual({
      hederaMode: "real_scaffolded",
      autoApprove: true,
      strategyConfig: {
        ...mockWorkflowResult.strategyConfig,
        simulateOnly: false,
        approvalRequired: true,
      },
      goal: customGoal,
    });
  }, 20_000);

  it("submits edited policy controls through the session run API", async () => {
    const pendingSession = buildSession({
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "pending",
      },
      payouts: [],
    });
    const customGoal = "Keep a tighter treasury mandate with lower slippage and lower DeFi exposure.";
    const policySession = buildSession({
      goal: customGoal,
      strategyConfig: {
        ...mockWorkflowResult.strategyConfig,
        reservePercent: 50,
        tradingPercent: 35,
        defiPercent: 15,
        riskLevel: "low",
        maxSlippageBps: 40,
        targetYieldApy: 6,
        approvalRequired: false,
      },
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "approved_with_changes",
      },
    });

    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/api/sessions/latest")) return Promise.resolve(jsonResponse({ error: "No sessions found." }, 404));
      if (url.endsWith("/api/sessions/run")) {
        const body = parseJsonBody(init) ?? {};
        if (body.goal === customGoal) {
          return Promise.resolve(jsonResponse({ session: policySession }, 201));
        }
        return Promise.resolve(jsonResponse({ session: pendingSession }, 201));
      }
      if (url.endsWith(`/api/sessions/${pendingSession.sessionId}/evidence`)) {
        return Promise.resolve(jsonResponse(buildEvidence(pendingSession), 200));
      }
      if (url.endsWith(`/api/sessions/${policySession.sessionId}/evidence`)) {
        return Promise.resolve(jsonResponse(buildEvidence(policySession), 200));
      }
      if (url.endsWith("/api/sessions")) {
        return Promise.resolve(jsonResponse({
          sessions: [
            {
              sessionId: policySession.sessionId,
              scenarioId: policySession.scenarioId,
              goal: policySession.goal,
              mode: policySession.hederaStatus.mode,
              receiptCount: policySession.receipts.length,
              payoutCount: policySession.payouts.length,
              createdAt: policySession.activityLog[0]?.timestamp ?? null,
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
    fireEvent.click(screen.getByRole("button", { name: /^low$/i }));
    fireEvent.change(screen.getByLabelText(/target apy %/i), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/max slippage bps/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/^reserve %$/i), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText(/^trading %$/i), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText(/^defi %$/i), { target: { value: "15" } });
    fireEvent.click(screen.getByLabelText(/require operator approval before settlement/i));
    fireEvent.click(screen.getByRole("button", { name: /save policies/i }));

    const input = screen.getByLabelText(/strategy goal/i);
    fireEvent.change(input, { target: { value: customGoal } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.getAllByText(customGoal).length).toBeGreaterThan(0);
    });

    const rerunCall = fetchMock.mock.calls
      .filter((call) => resolveFetchUrl(call[0]).endsWith("/api/sessions/run"))
      .at(-1);

    expect(parseJsonBody(rerunCall?.[1])).toMatchObject({
      hederaMode: "simulated",
      autoApprove: false,
      strategyConfig: {
        reservePercent: 50,
        tradingPercent: 35,
        defiPercent: 15,
        riskLevel: "low",
        maxSlippageBps: 40,
        targetYieldApy: 6,
        approvalRequired: false,
        simulateOnly: true,
      },
      goal: customGoal,
    });
  }, 20_000);

  it("rejects a pending session and loads session history evidence", async () => {
    const pendingSession = buildSession({
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "pending",
      },
      payouts: [],
    });
    const rejectedSession = buildSession({
      sessionId: pendingSession.sessionId,
      actionPlan: {
        ...pendingSession.actionPlan,
        approvalState: "rejected",
      },
      scheduledExecutions: pendingSession.scheduledExecutions.map((entry) => ({
        ...entry,
        status: "cancelled",
      })),
      rewardReservations: pendingSession.rewardReservations.map((entry) => ({
        ...entry,
        status: "cancelled",
      })),
      payouts: [],
    });

    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/api/sessions/latest")) return Promise.resolve(jsonResponse({ error: "No sessions found." }, 404));
      if (url.endsWith("/api/sessions/run")) return Promise.resolve(jsonResponse({ session: pendingSession }, 201));
      if (url.endsWith(`/api/sessions/${pendingSession.sessionId}/reject`)) return Promise.resolve(jsonResponse({ session: rejectedSession }, 200));
      if (url.endsWith(`/api/sessions/${pendingSession.sessionId}/evidence`)) {
        return Promise.resolve(jsonResponse(buildEvidence(rejectedSession), 200));
      }
      if (url.endsWith("/api/sessions")) {
        return Promise.resolve(jsonResponse({
          sessions: [
            {
              sessionId: rejectedSession.sessionId,
              scenarioId: rejectedSession.scenarioId,
              goal: rejectedSession.goal,
              mode: rejectedSession.hederaStatus.mode,
              receiptCount: rejectedSession.receipts.length,
              payoutCount: rejectedSession.payouts.length,
              createdAt: rejectedSession.activityLog[0]?.timestamp ?? null,
            },
          ],
        }));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const [rejectButton] = await screen.findAllByRole("button", { name: /reject/i }, { timeout: 10_000 });
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => resolveFetchUrl(call[0]).endsWith(`/api/sessions/${pendingSession.sessionId}/reject`))).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /audit log/i }));
    await screen.findByText(/Task and decision receipts emitted/i, undefined, { timeout: 10_000 });
  }, 20_000);

  it("surfaces backend connectivity failures instead of silently rendering mock protocol data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed"))),
    );

    render(<App />);

    await screen.findByText(
      "Unable to reach the ClawFi API at http://127.0.0.1:8787. Start it with npm.cmd run dev:api, then reload the app.",
      undefined,
      { timeout: 10_000 },
    );
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  }, 20_000);

  it("shows the live execution receipt link in chat using the execution transaction payload", async () => {
    const executedSession = buildSession({
      actionPlan: {
        ...mockWorkflowResult.actionPlan,
        approvalState: "approved",
      },
      scheduledExecutions: mockWorkflowResult.scheduledExecutions.map((entry, index) => ({
        ...entry,
        status: "executed",
        transactionId: `0.0.7001@1730000200.00000000${index + 1}`,
      })),
      receipts: mockWorkflowResult.receipts.map((entry, index, all) =>
        index === all.length - 1
          ? {
              ...entry,
              network: "testnet",
              payload: {
                ...entry.payload,
                transactionId: "0.0.7001@1730000200.000000001",
                explorerUrl: "https://hashscan.io/testnet/transaction/0.0.7001@1730000200.000000001",
              },
            }
          : entry,
      ),
    });

    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/api/sessions/latest")) return Promise.resolve(jsonResponse({ error: "No sessions found." }, 404));
      if (url.endsWith("/api/sessions/run")) return Promise.resolve(jsonResponse({ session: executedSession }, 201));
      if (url.endsWith(`/api/sessions/${executedSession.sessionId}/evidence`)) {
        return Promise.resolve(jsonResponse(buildEvidence(executedSession), 200));
      }
      if (url.endsWith("/api/sessions")) {
        return Promise.resolve(jsonResponse({
          sessions: [
            {
              sessionId: executedSession.sessionId,
              scenarioId: executedSession.scenarioId,
              goal: executedSession.goal,
              mode: executedSession.hederaStatus.mode,
              receiptCount: executedSession.receipts.length,
              payoutCount: executedSession.payouts.length,
              createdAt: executedSession.activityLog[0]?.timestamp ?? null,
            },
          ],
        }));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const links = await screen.findAllByRole("link", { name: /0\.0\.70/i }, { timeout: 10_000 });
    expect(
      links.some(
        (link) => link.getAttribute("href") === "https://hashscan.io/testnet/transaction/0.0.7001@1730000200.000000001",
      ),
    ).toBe(true);
  }, 20_000);
});
