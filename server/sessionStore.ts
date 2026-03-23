import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { WorkflowResult } from "../src/core/models/schemas";

function resolveStoragePath() {
  if (process.env.CLAWFI_SESSION_STORE_PATH) {
    return resolve(process.cwd(), process.env.CLAWFI_SESSION_STORE_PATH);
  }
  return resolve(process.cwd(), ".clawfi", "sessions.json");
}

type SessionFile = {
  sessions: WorkflowResult[];
};

async function ensureStorage() {
  const storagePath = resolveStoragePath();
  await mkdir(dirname(storagePath), { recursive: true });
}

async function readStore(): Promise<SessionFile> {
  const storagePath = resolveStoragePath();
  await ensureStorage();
  try {
    const raw = await readFile(storagePath, "utf8");
    const parsed = JSON.parse(raw) as SessionFile;
    return {
      sessions: parsed.sessions ?? [],
    };
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(data: SessionFile) {
  const storagePath = resolveStoragePath();
  await ensureStorage();
  await writeFile(storagePath, JSON.stringify(data, null, 2), "utf8");
}

export async function persistSession(session: WorkflowResult) {
  const store = await readStore();
  const existingIndex = store.sessions.findIndex((entry) => entry.sessionId === session.sessionId);
  if (existingIndex >= 0) {
    store.sessions[existingIndex] = session;
  } else {
    store.sessions.unshift(session);
  }
  await writeStore(store);
}

export async function listSessions() {
  const store = await readStore();
  return store.sessions.map((session) => ({
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    goal: session.goal,
    mode: session.hederaStatus.mode,
    receiptCount: session.receipts.length,
    payoutCount: session.payouts.length,
    createdAt: session.activityLog[0]?.timestamp ?? null,
  }));
}

export async function getLatestSession() {
  const store = await readStore();
  return store.sessions[0] ?? null;
}

export async function getSessionById(sessionId: string) {
  const store = await readStore();
  return store.sessions.find((session) => session.sessionId === sessionId) ?? null;
}
