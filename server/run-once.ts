import "../src/env/loadDotEnv";
import { demoStrategyConfig } from "../src/core/scenarios/demoScenario";
import { persistSessionEvidence } from "./evidence";
import { runServerSession } from "./runSession";
import { persistSession } from "./sessionStore";

const modeArg = process.argv.find((entry) => entry.startsWith("--mode="));
const goalArg = process.argv.find((entry) => entry.startsWith("--goal="));
const autoApproveArg = process.argv.find((entry) => entry.startsWith("--auto-approve="));
const liveArg = process.argv.find((entry) => entry.startsWith("--live="));
const persistArg = process.argv.find((entry) => entry === "--no-persist");
const hederaMode = modeArg?.split("=")[1];
const goal = goalArg?.split("=")[1];
const autoApprove = autoApproveArg ? autoApproveArg.split("=")[1] !== "false" : true;
const live = liveArg ? liveArg.split("=")[1] === "true" : false;
const shouldPersist = !persistArg;

const session = await runServerSession({
  hederaMode: hederaMode === "real_scaffolded" ? "real_scaffolded" : "simulated",
  goal,
  autoApprove,
  strategyConfig: live
    ? {
        ...demoStrategyConfig,
        simulateOnly: false,
      }
    : undefined,
});

let evidencePath: string | null = null;
let hashscanLinks: string[] = [];
if (shouldPersist) {
  await persistSession(session);
  const evidence = await persistSessionEvidence(session);
  evidencePath = evidence.outputPath;
  const explorerReferences = [
    ...evidence.evidence.receipts.map((entry) => entry.explorerUrl).filter((entry): entry is string => Boolean(entry)),
    ...evidence.evidence.payouts.map((entry) => entry.explorerUrl).filter((entry): entry is string => Boolean(entry)),
  ];
  hashscanLinks = explorerReferences.filter((entry) => entry.startsWith("https://hashscan.io/"));
}

console.log(
  JSON.stringify(
    {
      sessionId: session.sessionId,
      mode: session.hederaStatus.mode,
      receipts: session.receipts.length,
      payouts: session.payouts.length,
      approvalState: session.actionPlan.approvalState,
      firstReceiptTx: session.receipts[0]?.transactionId ?? null,
      evidencePath,
      hashscanLinks,
    },
    null,
    2,
  ),
);
