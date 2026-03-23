import type { SessionEvidence } from "./evidence";

type VerificationCheck = {
  id: string;
  passed: boolean;
  detail: string;
};

export type VerificationReport = {
  sessionId: string;
  mode: string;
  passed: boolean;
  checks: VerificationCheck[];
};

export async function verifySessionEvidence(input: {
  evidence: SessionEvidence;
  mirrorNodeBaseUrl?: string;
}): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];
  const mirrorNodeBaseUrl =
    input.mirrorNodeBaseUrl ?? (input.evidence.network === "mainnet"
      ? "https://mainnet-public.mirrornode.hedera.com"
      : "https://testnet.mirrornode.hedera.com");

  checks.push({
    id: "receipts_present",
    passed: input.evidence.summary.receiptCount > 0,
    detail: `${input.evidence.summary.receiptCount} receipts found.`,
  });
  checks.push({
    id: "payouts_present",
    passed: input.evidence.summary.payoutCount > 0,
    detail: `${input.evidence.summary.payoutCount} payouts found.`,
  });

  if (input.evidence.mode === "real_scaffolded") {
    const receiptTxIds = input.evidence.receipts.map((entry) => entry.transactionId).filter((entry): entry is string => Boolean(entry));
    const payoutTxIds = input.evidence.payouts.map((entry) => entry.transactionId).filter((entry): entry is string => Boolean(entry));
    const txIds = Array.from(new Set([...receiptTxIds, ...payoutTxIds]));

    checks.push({
      id: "real_tx_ids_exist",
      passed: txIds.length > 0,
      detail: `${txIds.length} unique transaction IDs captured.`,
    });

    const topicReceipts = input.evidence.receipts.filter((entry) => Boolean(entry.topicId));
    checks.push({
      id: "hcs_topic_receipts_present",
      passed: topicReceipts.length > 0,
      detail: `${topicReceipts.length} receipts include topic IDs.`,
    });

    let mirrorFound = 0;
    let mirrorMissed = 0;
    for (const txId of txIds) {
      if (!txId.includes("@")) {
        continue;
      }
      const ok = await transactionExistsOnMirror({
        mirrorNodeBaseUrl,
        transactionId: txId,
      });
      if (ok) {
        mirrorFound += 1;
      } else {
        mirrorMissed += 1;
      }
    }
    checks.push({
      id: "mirror_tx_lookup",
      passed: mirrorFound > 0 && mirrorMissed === 0,
      detail: `${mirrorFound} transactions found on mirror, ${mirrorMissed} missing.`,
    });
  } else {
    checks.push({
      id: "simulated_mode_notice",
      passed: true,
      detail: "Simulated mode evidence is structurally valid but not funding-grade live proof.",
    });
  }

  return {
    sessionId: input.evidence.sessionId,
    mode: input.evidence.mode,
    passed: checks.every((check) => check.passed),
    checks,
  };
}

async function transactionExistsOnMirror(input: {
  mirrorNodeBaseUrl: string;
  transactionId: string;
}) {
  const encoded = encodeURIComponent(toMirrorTransactionId(input.transactionId));
  const url = `${input.mirrorNodeBaseUrl}/api/v1/transactions/${encoded}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return false;
  }
  const payload = (await response.json()) as {
    transactions?: unknown[];
  };
  return Array.isArray(payload.transactions) && payload.transactions.length > 0;
}

function toMirrorTransactionId(transactionId: string) {
  if (!transactionId.includes("@")) {
    return transactionId;
  }
  const [accountId, validStart] = transactionId.split("@");
  if (!accountId || !validStart) {
    return transactionId;
  }
  const [seconds, nanos] = validStart.split(".");
  if (!seconds || !nanos) {
    return transactionId;
  }
  return `${accountId}-${seconds}-${nanos}`;
}
