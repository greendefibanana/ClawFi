# Hedera Mechanics

ClawFi uses Hedera as the core coordination and audit substrate, not as an AI inference layer.

## Core primitives

1. HCS coordination receipts
- Adapter: `src/hedera/consensus/*`
- Purpose: publish lifecycle receipts for tasks, risk decisions, allocations, execution, and rewards.
- Real scaffold path: `RealConsensusAdapter` uses `HEDERA_RECEIPT_TOPIC_ID` when present and records via treasury adapter.

2. Scheduled approval-based execution
- Adapter: `src/hedera/schedule/*`
- Purpose: execution is modeled as `simulate -> schedule -> await approval -> approve/cancel/execute`.
- UI surface: Scheduled Approval Rail panel in `src/App.tsx`.

3. HTS/custom-fee-aware rewards
- Adapters/engine: `src/hedera/token/*`, `src/hedera/rewards/engine.ts`
- Purpose: agent work has reservable/releasable rewards with fee-routing-aware policy model.

4. Mirror-backed audit layer
- Adapter: `src/hedera/mirror/*`
- Purpose: aggregate receipts, scheduled execution history, and payouts into one auditable trail.
- UI surface: Mirror Audit Panel in `src/App.tsx`.

## Real vs simulated

- Real scaffolded (`hederaMode=real_scaffolded`)
  - Real treasury adapter for Mirror reads, HCS receipt submit, and HBAR transfer settlement.
  - Real consensus/schedule/token/mirror adapter classes are used by `createHederaCore`.
  - Live execution still requires explicit connector env flags and funded credentials.

- Simulated (`hederaMode=simulated`)
  - Deterministic IDs and seeded data for end-to-end demo reproducibility.
  - Same orchestration and schema surface as real mode.

