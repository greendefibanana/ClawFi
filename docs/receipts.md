# Receipts

Receipts are first-class coordination artifacts in ClawFi.

## Model

- Schema: `src/domain/schemas.ts` (`receiptSchema`)
- Factory: `src/hedera/receiptFactory.ts`
- Canonicalization: `src/hedera/receipts/canonical.ts`
- Summary formatter: `src/hedera/receipts/summarize.ts`

Each receipt includes:
- `eventType`
- `summary`
- `status`
- `canonicalPayload`
- `canonicalHash`
- `linkedIds` (task/agent/allocation/execution/reward linkage)
- Hedera metadata (`transactionId`, `topicId`, `explorerUrl` when available)

## Lifecycle event coverage

Implemented event types include:
- task events: `task_created`, `task_assigned`, `task_started`, `task_completed`, `task_failed`, `task_approved`
- analysis events: `token_analysis_generated`, `defi_analysis_generated`
- decision events: `risk_review_completed`, `risk_rejected`, `allocation_finalized`
- execution events: `execution_simulated`, `execution_scheduled`, `execution_approved`, `execution_cancelled`, `execution_prepared`
- reward events: `reward_reserved`, `reward_settled`

## Why canonical payload matters

- Enables deterministic hashing across equivalent payloads.
- Prevents non-deterministic key-order differences from changing receipt identity.
- Supports audit comparison between local output and mirror-indexed records.

