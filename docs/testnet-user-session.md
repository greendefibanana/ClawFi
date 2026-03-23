# Testnet User Session

This document records an actual ClawFi testnet run in a user-session format.

It is based on real artifacts produced on March 21, 2026 in `real_scaffolded` mode and is intended to read like the flow an operator would experience while an agent workforce runs a treasury job end to end.

Important honesty note:
- The session below is real.
- The planning, receipt anchoring, approval-gated schedule flow, live execution legs, and agent reward settlements completed on Hedera testnet.
- The evidence bundle for this session validates successfully against Hedera Mirror Node.
- This document replaces the older March 18 partial run that still had a Bonzo blocker.

## Session profile

- Date: March 21, 2026
- Treasury account: `0.0.8065274`
- Network: `testnet`
- Mode: `real_scaffolded`
- Session ID: `session-c59a78d3`
- Evidence file: `.clawfi/evidence/session-c59a78d3.evidence.json`
- Receipt topic: `0.0.8280390`

## Goal entered by the operator

The operator launched ClawFi with a live Hedera testnet treasury and submitted the following goal:

> Find two medium-risk token opportunities and deploy stablecoins into the safest Hedera yield opportunities above 8% APY while maintaining a 40/30/30 reserve, trading, and DeFi policy. Simulate the full plan and show rejected options.

## What the operator does

1. Starts the API and frontend in testnet mode.
2. Loads Hedera testnet credentials and live connector configuration.
3. Opens the dashboard and submits the treasury objective.
4. Lets the agent workforce run.
5. Reviews the proposed actions and the execution preview.
6. Approves the scheduled path for live execution.

## What the user sees during the run

### 1. Treasury introspection

ClawFi reads the live Hedera treasury and normalizes the balances into the dashboard portfolio view.

Observed from the session artifact:
- Treasury account: `0.0.8065274`
- Reserve/trading/DeFi budget split was computed successfully
- Hedera mode reported to the session: `real_scaffolded`

### 2. Agent workforce fans out

The user then sees the six-agent workflow run in sequence:

- Coordinator
- Token Research
- DeFi Strategy
- Risk
- Execution
- Reporter

For this session, the receipt bundle captured:
- `54` anchored receipts
- `6` completed tasks
- `6` reward settlements
- `2` approved actions

### 3. Risk-approved action plan

The run produced two approved actions:

- `Accumulate SAUCE`
- `Deploy SAUCE into Bonzo`

The execution layer converted those actions into Hedera scheduled transactions:

- Schedule `0.0.8317792` for the SaucerSwap trade leg
- Schedule `0.0.8317796` for the Bonzo deposit leg

These scheduled actions were persisted in the live session state and referenced in the evidence bundle.

## Live Hedera artifacts produced

### HCS and session evidence

The run anchored receipts to the Hedera receipt topic:

- Receipt topic: `0.0.8280390`

Examples from the actual evidence file:
- `token_analysis_generated`
- `defi_analysis_generated`
- `risk_review_completed`
- `execution_simulated`
- `execution_prepared`
- `execution_scheduled`
- `execution_approved`
- `reward_settled`

The artifact bundle for this run is:

```text
.clawfi/evidence/session-c59a78d3.evidence.json
```

### Live SaucerSwap execution

After the schedule/approval path was wired up, the SaucerSwap leg was executed live on Hedera testnet and completed successfully.

Verified live transaction:
- `0.0.8065274@1774092992.718225460`

HashScan reference:
- `https://hashscan.io/testnet/transaction/0.0.8065274@1774092992.718225460`

What this proves:
- the treasury account could sign live contract execution
- the SaucerSwap router path was correct
- token association and token acquisition worked on testnet

### Live Bonzo execution

The DeFi leg was then executed against Bonzo testnet using the live SAUCE balance and completed successfully after operator approval.

Verified live transaction:
- `0.0.8065274@1774093129.207722205`

HashScan reference:
- `https://hashscan.io/testnet/transaction/0.0.8065274@1774093129.207722205`

What this means:
- the workflow reached the live DeFi execution boundary and settled successfully
- the Bonzo deposit path is no longer the blocking step from the earlier March 18 run
- the evidence bundle now captures a fully successful trading plus DeFi session on Hedera testnet

### Approval and reward settlement evidence

This session also captured the governed approval and reward settlement path:

- approval was recorded through the pending-session approval flow
- the evidence bundle includes `execution_approved`
- the payout bundle includes `6` reward settlements across Coordinator, Token Research, DeFi Strategy, Risk, Execution, and Reporter

Example payout transaction:
- `0.0.8065274@1774093139.079370175`

HashScan reference:
- `https://hashscan.io/testnet/transaction/0.0.8065274@1774093139.079370175`

## What the session proves today

This user-session run proves that the following parts of ClawFi are functioning on Hedera testnet:

- live treasury reads from Hedera infrastructure
- multi-agent session orchestration
- HCS receipt anchoring
- risk review and approved action generation
- Hedera schedule creation for execution steps
- live SaucerSwap trade execution
- live Bonzo deposit execution
- approval-gated execution release
- live HBAR-denominated reward settlements
- persistent evidence generation for the session
- mirror-validated transaction evidence

## Validation result

The repo validator was run against this session:

```bash
npm.cmd run verify:evidence -- --session=session-c59a78d3
```

Observed result:
- `passed: true`
- `54` receipts found
- `6` payouts found
- `60` unique transactions captured
- `60/60` transactions found on Hedera Mirror Node

## Recommended demo framing

If this is shown to judges, partners, or reviewers, the most accurate framing is:

> ClawFi successfully runs a live Hedera testnet treasury session through planning, HCS logging, approval-gated scheduling, live token execution, live Bonzo DeFi execution, and agent reward settlement, all backed by mirror-validated transaction evidence.

That framing is strong because it is true, reproducible, and backed by transaction-level evidence.
