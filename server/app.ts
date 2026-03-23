import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { approveSessionSettlement, rejectSessionSettlement } from "./approval";
import { getSessionEvidence, persistSessionEvidence } from "./evidence";
import { getLatestSession, getSessionById, listSessions, persistSession } from "./sessionStore";
import { runServerSession } from "./runSession";
import { finalizeWalletSession } from "./walletApproval";
import type { WalletActionResult, WalletPayoutResult } from "./walletApproval";

export type ClawfiApiConfig = {
  host: string;
  port: number;
};

export function createClawfiApiServer(config: ClawfiApiConfig): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, config);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, config: ClawfiApiConfig) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "clawfi-api",
        time: new Date().toISOString(),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const sessions = await listSessions();
      return sendJson(res, 200, { sessions });
    }

    if (req.method === "GET" && url.pathname === "/api/sessions/latest") {
      const latest = await getLatestSession();
      if (!latest) {
        return sendJson(res, 404, { error: "No sessions found." });
      }
      return sendJson(res, 200, latest);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/evidence")) {
      const sessionId = url.pathname.split("/").at(-2);
      if (!sessionId) {
        return sendJson(res, 400, { error: "Invalid session id." });
      }
      const evidence = await getSessionEvidence(sessionId);
      if (!evidence) {
        return sendJson(res, 404, { error: "Session evidence not found." });
      }
      return sendJson(res, 200, evidence);
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/approve")) {
      const sessionId = url.pathname.split("/").at(-2);
      if (!sessionId) {
        return sendJson(res, 400, { error: "Invalid session id." });
      }
      const session = await getSessionById(sessionId);
      if (!session) {
        return sendJson(res, 404, { error: "Session not found." });
      }
      const body = await readBody(req);
      const approvedBy = typeof body.approvedBy === "string" && body.approvedBy.trim() ? body.approvedBy.trim() : "treasury-operator";
      const approvedSession = await approveSessionSettlement({
        session,
        approvedBy,
      });
      await persistSession(approvedSession);
      const evidenceResult = await persistSessionEvidence(approvedSession);
      return sendJson(res, 200, {
        session: approvedSession,
        evidencePath: evidenceResult.outputPath,
      });
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/wallet-complete")) {
      const sessionId = url.pathname.split("/").at(-2);
      if (!sessionId) {
        return sendJson(res, 400, { error: "Invalid session id." });
      }
      const session = await getSessionById(sessionId);
      if (!session) {
        return sendJson(res, 404, { error: "Session not found." });
      }
      const body = await readBody(req);
      const approvedBy = typeof body.approvedBy === "string" && body.approvedBy.trim() ? body.approvedBy.trim() : "wallet-operator";
      const walletAccountId =
        typeof body.walletAccountId === "string" && body.walletAccountId.trim() ? body.walletAccountId.trim() : "";
      const actionResults = Array.isArray(body.actionResults) ? body.actionResults.filter(isWalletActionResult) : [];
      const payoutResults = Array.isArray(body.payoutResults) ? body.payoutResults.filter(isWalletPayoutResult) : [];
      const finalizedSession = await finalizeWalletSession({
        session,
        approvedBy,
        walletAccountId,
        actionResults,
        payoutResults,
      });
      await persistSession(finalizedSession);
      const evidenceResult = await persistSessionEvidence(finalizedSession);
      return sendJson(res, 200, {
        session: finalizedSession,
        evidencePath: evidenceResult.outputPath,
      });
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/reject")) {
      const sessionId = url.pathname.split("/").at(-2);
      if (!sessionId) {
        return sendJson(res, 400, { error: "Invalid session id." });
      }
      const session = await getSessionById(sessionId);
      if (!session) {
        return sendJson(res, 404, { error: "Session not found." });
      }
      const body = await readBody(req);
      const rejectedBy =
        typeof body.rejectedBy === "string" && body.rejectedBy.trim() ? body.rejectedBy.trim() : "treasury-operator";
      const reason =
        typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Operator rejected pending session.";
      const rejectedSession = await rejectSessionSettlement({
        session,
        rejectedBy,
        reason,
      });
      await persistSession(rejectedSession);
      const evidenceResult = await persistSessionEvidence(rejectedSession);
      return sendJson(res, 200, {
        session: rejectedSession,
        evidencePath: evidenceResult.outputPath,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const sessionId = url.pathname.split("/").at(-1);
      if (!sessionId) {
        return sendJson(res, 400, { error: "Invalid session id." });
      }
      const session = await getSessionById(sessionId);
      if (!session) {
        return sendJson(res, 404, { error: "Session not found." });
      }
      return sendJson(res, 200, session);
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/run") {
      const body = await readBody(req);
      const session = await runServerSession({
        goal: typeof body.goal === "string" ? body.goal : undefined,
        hederaMode:
          body.hederaMode === "real_scaffolded"
            ? "real_scaffolded"
            : body.hederaMode === "wallet_connected"
              ? "wallet_connected"
              : "simulated",
        strategyConfig: isObjectRecord(body.strategyConfig) ? body.strategyConfig : undefined,
        autoApprove: typeof body.autoApprove === "boolean" ? body.autoApprove : true,
        userAgents: Array.isArray(body.userAgents) ? body.userAgents : undefined,
        walletAccountId: typeof body.walletAccountId === "string" ? body.walletAccountId : undefined,
      });
      await persistSession(session);
      const evidenceResult = await persistSessionEvidence(session);
      return sendJson(res, 201, {
        session,
        evidencePath: evidenceResult.outputPath,
      });
    }

    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unhandled server error.",
    });
  }
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const normalized = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    chunks.push(normalized);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWalletActionResult(value: unknown): value is WalletActionResult {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.actionId === "string" &&
    typeof value.detail === "string" &&
    (value.status === "executed" || value.status === "failed" || value.status === "skipped") &&
    (value.transactionId === undefined || typeof value.transactionId === "string") &&
    (value.explorerUrl === undefined || typeof value.explorerUrl === "string")
  );
}

function isWalletPayoutResult(value: unknown): value is WalletPayoutResult {
  return isObjectRecord(value) && typeof value.taskId === "string" && typeof value.transactionId === "string";
}
