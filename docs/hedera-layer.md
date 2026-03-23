# Hedera Layer

## Positioning

Hedera is not where reasoning runs. In ClawFi it is the:

- treasury layer
- payment layer
- receipt layer
- audit layer
- agent coordination log layer

## Implemented abstractions

- `HederaTreasuryAdapter`
- `SimulatedHederaTreasuryAdapter`
- `RealHederaTreasuryAdapter` scaffold
- `HederaConsensusAdapter` with simulated + real scaffold implementations
- `HederaScheduleAdapter` with simulated + real scaffold implementations
- `HederaTokenAdapter` with simulated + real scaffold implementations
- `HederaMirrorAdapter` with simulated + real scaffold implementations
- receipt factory helpers
- payout reservation and release helpers

## Simulated mode

Used by the running app today.

Supports:
- seeded treasury balances
- receipt generation for every major workflow event
- simulated HBAR payout settlement
- scheduled execution lifecycle simulation
- mirror-style unified audit trail simulation
- deterministic transaction IDs for demo clarity
- approval-gated settlement mode for payout release

## Real scaffolded mode

Implemented in code but not wired into the browser app.

Intended for a trusted backend runtime with operator credentials.

Uses Hedera SDK primitives:
- Mirror Node REST (`/api/v1/accounts/:id`, `/api/v1/accounts/:id/tokens`) for treasury introspection
- `TransferTransaction` for HBAR reward settlement
- `TopicMessageSubmitTransaction` for receipt anchoring to HCS
- `ContractExecuteTransaction` for live trading/DeFi action connectors
- `AccountAllowanceApproveTransaction` for DeFi token deposit approvals

`AccountBalanceQuery` remains as an internal fallback path if Mirror Node reads fail.

## Mocked vs simulated vs real

- Mocked:
  - token market provider
  - DeFi opportunities provider
  - AI narrative provider
- Simulated:
  - Hedera adapter used by app runtime
  - receipt transaction IDs
  - payout settlement IDs
- Real scaffolded:
  - backend-ready Hedera adapter implementation path

## Required env vars

- `HEDERA_MODE`
- `HEDERA_NETWORK`
- `HEDERA_OPERATOR_ID`
- `HEDERA_OPERATOR_KEY`
- `HEDERA_RECEIPT_TOPIC_ID` (required for real receipt anchoring)
- `HEDERA_MIRROR_NODE_URL` (optional override)

Operational persistence:
- `CLAWFI_SESSION_STORE_PATH` (optional)
- `CLAWFI_EVIDENCE_DIR` (optional)

Verification:
- `npm.cmd run verify:evidence -- --session=<SESSION_ID>` validates evidence structure.
- In real mode it also checks transaction visibility against Mirror Node.

## Live connector status

- Trading connector:
  - SaucerSwap V1 router swap path (`swapExactETHForTokens`) with quote + slippage floor.
- DeFi connector:
  - Bonzo lending pool deposit path (`deposit`) with allowance + fallback signature handling.
- Both connectors are feature-gated by env flags and require funded testnet credentials.

Inference note:
- Bonzo `deposit` signature compatibility is implemented with a 4-arg call first, then a 3-arg fallback.
- This follows common Aave-style pool interfaces and must be confirmed against the exact deployed Bonzo ABI for your selected environment.

## Honest status

- Live Hedera execution: implemented behind explicit env gates, pending funded testnet validation evidence
- Live receipt anchoring: implemented, pending funded testnet validation evidence
- Simulated Hedera treasury workflow: fully demonstrated
