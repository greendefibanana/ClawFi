import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClawfiApiServer } from "../server/app";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveFetchUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

describe("ClawFi API integration", () => {
  let server: Server;
  let baseUrl = "";
  let tempDir = "";
  let sessionId = "";

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "clawfi-api-"));
    process.env.CLAWFI_SESSION_STORE_PATH = join(tempDir, "sessions.json");
    process.env.CLAWFI_EVIDENCE_DIR = join(tempDir, "evidence");
    process.env.HEDERA_MODE = "simulated";

    server = createClawfiApiServer({
      host: "127.0.0.1",
      port: 0,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    delete process.env.CLAWFI_SESSION_STORE_PATH;
    delete process.env.CLAWFI_EVIDENCE_DIR;
    delete process.env.HEDERA_MODE;
    delete process.env.HEDERA_MIRROR_NODE_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
  });

  it("serves health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean };
    expect(payload.ok).toBe(true);
  });

  it("runs a simulated session and serves session/evidence retrieval routes", async () => {
    const runResponse = await fetch(`${baseUrl}/api/sessions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hederaMode: "simulated",
      }),
    });
    expect(runResponse.status).toBe(201);
    const runPayload = (await runResponse.json()) as {
      session: { sessionId: string; receipts: unknown[] };
      evidencePath: string;
    };

    expect(runPayload.session.sessionId).toMatch(/^session-/);
    expect(runPayload.session.receipts.length).toBeGreaterThan(0);
    expect(runPayload.evidencePath).toContain(".evidence.json");
    sessionId = runPayload.session.sessionId;

    const latestResponse = await fetch(`${baseUrl}/api/sessions/latest`);
    expect(latestResponse.status).toBe(200);
    const latest = (await latestResponse.json()) as { sessionId: string };
    expect(latest.sessionId).toBe(sessionId);

    const listResponse = await fetch(`${baseUrl}/api/sessions`);
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      sessions: Array<{ sessionId: string }>;
    };
    expect(listPayload.sessions.some((entry) => entry.sessionId === sessionId)).toBe(true);

    const sessionResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
    expect(sessionResponse.status).toBe(200);
    const sessionPayload = (await sessionResponse.json()) as { sessionId: string };
    expect(sessionPayload.sessionId).toBe(sessionId);

    const evidenceResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}/evidence`);
    expect(evidenceResponse.status).toBe(200);
    const evidencePayload = (await evidenceResponse.json()) as {
      sessionId: string;
      summary: { receiptCount: number };
    };
    expect(evidencePayload.sessionId).toBe(sessionId);
    expect(evidencePayload.summary.receiptCount).toBeGreaterThan(0);
  }, 20_000);

  it("returns clear error for real mode when credentials are missing", async () => {
    delete process.env.HEDERA_OPERATOR_ID;
    delete process.env.HEDERA_OPERATOR_KEY;

    const response = await fetch(`${baseUrl}/api/sessions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hederaMode: "real_scaffolded",
      }),
    });

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("HEDERA_OPERATOR_ID");
  });

  it("supports wallet-connected session creation and wallet completion settlement", async () => {
    process.env.HEDERA_MIRROR_NODE_URL = "https://mirror.test";

    const originalFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = resolveFetchUrl(input);
      if (url.startsWith("https://mirror.test/api/v1/accounts/0.0.7001/tokens")) {
        return Promise.resolve(
          jsonResponse({
            tokens: [
              {
                token_id: "0.0.1183558",
                balance: "2500000",
                decimals: 6,
              },
            ],
            links: {
              next: null,
            },
          }),
        );
      }
      if (url === "https://mirror.test/api/v1/accounts/0.0.7001") {
        return Promise.resolve(
          jsonResponse({
            balance: {
              balance: "45000000000",
            },
          }),
        );
      }
      return originalFetch(input, init);
    });

    try {
      const runResponse = await fetch(`${baseUrl}/api/sessions/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hederaMode: "wallet_connected",
          walletAccountId: "0.0.7001",
          autoApprove: false,
        }),
      });
      expect(runResponse.status).toBe(201);
      const runPayload = (await runResponse.json()) as {
        session: {
          sessionId: string;
          treasury: { accountId: string; portfolio: { positions: Array<{ symbol: string; hederaTokenId?: string }> } };
          hederaStatus: { mode: string };
          actionPlan: { approvalState: string; actions: Array<{ id: string }> };
          tasks: Array<{ id: string; status: string }>;
          payouts: unknown[];
        };
      };

      expect(runPayload.session.hederaStatus.mode).toBe("wallet_connected");
      expect(runPayload.session.treasury.accountId).toBe("0.0.7001");
      expect(runPayload.session.treasury.portfolio.positions.some((entry) => entry.symbol === "HBAR")).toBe(true);
      expect(
        runPayload.session.treasury.portfolio.positions.some((entry) => entry.hederaTokenId === "0.0.1183558"),
      ).toBe(true);
      expect(runPayload.session.actionPlan.approvalState).toBe("pending");
      expect(runPayload.session.payouts).toHaveLength(0);

      const approvalResponse = await fetch(`${baseUrl}/api/sessions/${runPayload.session.sessionId}/wallet-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedBy: "0.0.7001",
          walletAccountId: "0.0.7001",
          actionResults: runPayload.session.actionPlan.actions.map((action, index) => ({
            actionId: action.id,
            status: "executed",
            transactionId: `0.0.7001@${1730000200 + index}.00000000${index + 1}`,
            explorerUrl: `https://hashscan.io/testnet/transaction/0.0.7001@${1730000200 + index}.00000000${index + 1}`,
            detail: `Executed wallet action ${action.id}`,
          })),
          payoutResults: runPayload.session.tasks
            .filter((task) => task.status === "completed")
            .map((task, index) => ({
              taskId: task.id,
              transactionId: `0.0.7001@${1730000300 + index}.00000000${index + 1}`,
            })),
        }),
      });
      expect(approvalResponse.status).toBe(200);
      const approvalPayload = (await approvalResponse.json()) as {
        session: {
          actionPlan: { approvalState: string };
          payouts: Array<{ transactionId?: string }>;
          scheduledExecutions: Array<{ status: string; transactionId?: string }>;
          receipts: Array<{ eventType: string }>;
        };
      };

      expect(approvalPayload.session.actionPlan.approvalState).not.toBe("pending");
      expect(approvalPayload.session.payouts.length).toBeGreaterThan(0);
      expect(approvalPayload.session.payouts.every((entry) => typeof entry.transactionId === "string")).toBe(true);
      expect(
        approvalPayload.session.scheduledExecutions.every((entry) =>
          entry.status === "executed" || entry.status === "approved",
        ),
      ).toBe(true);
      expect(
        approvalPayload.session.receipts.some((entry) => entry.eventType === "execution_approved"),
      ).toBe(true);
      expect(
        approvalPayload.session.receipts.some((entry) => entry.eventType === "reward_settled"),
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.HEDERA_MIRROR_NODE_URL;
    }
  }, 20_000);

  it("supports manual approval endpoint for pending sessions", async () => {
    const runResponse = await fetch(`${baseUrl}/api/sessions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hederaMode: "simulated",
        autoApprove: false,
      }),
    });
    expect(runResponse.status).toBe(201);
    const runPayload = (await runResponse.json()) as {
      session: { sessionId: string; actionPlan: { approvalState: string }; payouts: unknown[] };
    };
    expect(runPayload.session.actionPlan.approvalState).toBe("pending");
    expect(runPayload.session.payouts.length).toBe(0);

    const approvalResponse = await fetch(`${baseUrl}/api/sessions/${runPayload.session.sessionId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "integration-operator" }),
    });
    expect(approvalResponse.status).toBe(200);
    const approvalPayload = (await approvalResponse.json()) as {
      session: { actionPlan: { approvalState: string }; payouts: unknown[] };
    };
    expect(approvalPayload.session.actionPlan.approvalState).not.toBe("pending");
    expect(approvalPayload.session.payouts.length).toBeGreaterThan(0);
  }, 20_000);

  it("supports rejection endpoint for pending sessions", async () => {
    const runResponse = await fetch(`${baseUrl}/api/sessions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hederaMode: "simulated",
        autoApprove: false,
      }),
    });
    expect(runResponse.status).toBe(201);
    const runPayload = (await runResponse.json()) as {
      session: {
        sessionId: string;
        actionPlan: { approvalState: string };
        scheduledExecutions: Array<{ status: string }>;
      };
    };
    expect(runPayload.session.actionPlan.approvalState).toBe("pending");

    const rejectionResponse = await fetch(`${baseUrl}/api/sessions/${runPayload.session.sessionId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectedBy: "integration-operator", reason: "Rejected during integration smoke." }),
    });
    expect(rejectionResponse.status).toBe(200);
    const rejectionPayload = (await rejectionResponse.json()) as {
      session: {
        actionPlan: { approvalState: string };
        scheduledExecutions: Array<{ status: string }>;
        rewardReservations: Array<{ status: string }>;
      };
    };
    expect(rejectionPayload.session.actionPlan.approvalState).toBe("rejected");
    expect(rejectionPayload.session.scheduledExecutions.every((entry) => entry.status === "cancelled")).toBe(true);
    expect(rejectionPayload.session.rewardReservations.every((entry) => entry.status !== "reserved")).toBe(true);
  }, 20_000);
});
