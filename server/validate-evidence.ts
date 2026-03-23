import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSessionEvidence, type SessionEvidence } from "./evidence";
import { verifySessionEvidence } from "./testnetVerifier";

const sessionArg = process.argv.find((entry) => entry.startsWith("--session="));
const fileArg = process.argv.find((entry) => entry.startsWith("--file="));
const mirrorArg = process.argv.find((entry) => entry.startsWith("--mirror="));
const sessionId = sessionArg?.split("=")[1];
const filePath = fileArg?.split("=")[1];
const mirror = mirrorArg?.split("=")[1];

const evidence = filePath
  ? (JSON.parse(await readFile(resolve(process.cwd(), filePath), "utf8")) as SessionEvidence)
  : sessionId
    ? await getSessionEvidence(sessionId)
    : null;

if (!evidence) {
  console.error("No evidence found. Provide --session=<id> or --file=<path>.");
  process.exit(1);
}

const report = await verifySessionEvidence({
  evidence,
  mirrorNodeBaseUrl: mirror,
});

console.log(JSON.stringify(report, null, 2));
if (!report.passed) {
  process.exit(2);
}
