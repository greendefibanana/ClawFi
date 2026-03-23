# ClawFi Funding Sign-off Checklist

Use this checklist before final submission or funding review. Pair it with the generated evidence file at `.clawfi/evidence/<sessionId>.evidence.json`.

## Required artifacts

- [ ] Session evidence JSON exists and is attached.
- [ ] Hedera mode is `real_scaffolded` for live testnet proof.
- [ ] If run used `autoApprove=false`, approval endpoint was executed and recorded.
- [ ] Receipt transactions include at least `task_created`.
- [ ] Receipt transactions include at least `allocation_finalized`.
- [ ] Receipt transactions include at least `execution_simulated` or `execution_prepared`.
- [ ] Receipt transactions include at least `reward_settled`.
- [ ] Payout transactions include at least one agent reward settlement.
- [ ] HashScan links resolve for all transaction IDs in the evidence bundle.
- [ ] HCS topic ID is present for receipt events in real mode.
- [ ] Screenshots/video show dashboard: treasury, policy, risk decisions, execution preview, receipts, payouts.

## Latest verified run

This repo now includes a completed funding-grade proof bundle from March 21, 2026.

- [x] Session evidence JSON exists and is attached: `.clawfi/evidence/session-c59a78d3.evidence.json`
- [x] Hedera mode is `real_scaffolded` for live testnet proof.
- [x] Approval-gated run was executed and recorded.
- [x] Receipt evidence includes `task_created`, `allocation_finalized`, `execution_simulated`, `execution_prepared`, `execution_scheduled`, `execution_approved`, and `reward_settled`.
- [x] Payout evidence includes `6` agent reward settlements.
- [x] HCS topic ID is present in receipt evidence: `0.0.8280390`.
- [x] HashScan links are present in the evidence bundle.
- [x] `npm.cmd run verify:evidence -- --session=session-c59a78d3` passed on March 21, 2026.

Verification summary for `session-c59a78d3`:

- `mode`: `real_scaffolded`
- `network`: `testnet`
- `receiptCount`: `54`
- `payoutCount`: `6`
- `taskCount`: `6`
- `approvedActionCount`: `2`
- `mirror_tx_lookup`: `60` transactions found, `0` missing

## Evidence template

```json
{
  "sessionId": "session-...",
  "mode": "real_scaffolded",
  "network": "testnet",
  "treasuryAccountId": "0.0.xxxx",
  "summary": {
    "receiptCount": 0,
    "payoutCount": 0,
    "taskCount": 0,
    "approvedActionCount": 0
  },
  "receipts": [
    {
      "eventType": "task_created",
      "transactionId": "0.0.xxxx@...",
      "topicId": "0.0.yyyy",
      "explorerUrl": "https://hashscan.io/testnet/transaction/..."
    }
  ],
  "payouts": [
    {
      "taskId": "task-...",
      "agentName": "Coordinator",
      "transactionId": "0.0.xxxx@...",
      "explorerUrl": "https://hashscan.io/testnet/transaction/..."
    }
  ]
}
```

## Final operator declaration

- [ ] I verified receipts and payouts against testnet HashScan on `{{DATE_UTC}}`.
- [ ] I confirm all simulated elements are explicitly labeled as simulated.
- [ ] I confirm no unsupported live execution claims are made in demo materials.
- [ ] I confirm any pending runs were explicitly approved via `/api/sessions/:id/approve`.
