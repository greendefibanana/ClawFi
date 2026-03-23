import "../src/env/loadDotEnv";
import { approveSessionSettlement } from "../server/approval";
import { persistSessionEvidence } from "../server/evidence";
import { getSessionById, persistSession } from "../server/sessionStore";

const sessionId = process.argv[2];
const approvedBy = process.argv[3] ?? "treasury-operator";

if (!sessionId) {
  console.error("Usage: npx tsx scripts/approve-session.ts <sessionId> [approvedBy]");
  process.exit(1);
}

const session = await getSessionById(sessionId);
if (!session) {
  console.error(`Session ${sessionId} not found.`);
  process.exit(1);
}

const approved = await approveSessionSettlement({
  session,
  approvedBy,
});

await persistSession(approved);
const evidence = await persistSessionEvidence(approved);

console.log(
  JSON.stringify(
    {
      sessionId: approved.sessionId,
      approvalState: approved.actionPlan.approvalState,
      payoutCount: approved.payouts.length,
      payouts: approved.payouts.map((entry) => ({
        agentName: entry.agentName,
        recipientAccountId: entry.recipientAccountId,
        transactionId: entry.transactionId ?? null,
      })),
      scheduledExecutions: approved.scheduledExecutions.map((entry) => ({
        actionTitle: entry.actionTitle,
        status: entry.status,
        scheduleId: entry.scheduleId,
        transactionId: entry.transactionId ?? null,
      })),
      evidencePath: evidence.outputPath,
    },
    null,
    2,
  ),
);
