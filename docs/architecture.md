# Architecture

## Intent

Restructure the prior ClawFi implementation into a track-aligned OpenClaw + Hedera submission without discarding strong existing modules.

## Preserved from prior version

- Deterministic token + DeFi strategy engines
- Existing risk policy enforcement logic
- Core dashboard shell and session flow
- Hedera treasury adapter contract (`HederaTreasuryAdapter`)

## Refactored in this patch

- Added explicit Hedera core module boundaries:
  - `hedera/consensus`
  - `hedera/schedule`
  - `hedera/token`
  - `hedera/mirror`
  - `hedera/rewards`
  - `hedera/receipts`
- Moved workflow toward receipt-first orchestration with typed lifecycle events.
- Replaced direct-execution feel with scheduled approval lifecycle.
- Added reward reservation lifecycle and mirror-backed unified audit trail.

## Current runtime

1. A session is created.
2. Coordinator agent reads treasury and reserves budget sleeves.
3. Token and DeFi agents run through allowlisted tools.
4. Risk agent builds and reviews a draft allocation plan.
5. Execution agent simulates actions and prepares execution previews.
6. Reporter agent generates final rationale.
7. Hedera receipts and reward settlements are recorded and persisted with session evidence artifacts.
8. If `autoApprove=false`, the session remains pending until `/api/sessions/:id/approve` is called.

## Module boundaries

- `src/tools/`: all tool definitions + registry + invocation logging
- `src/agents/`: role prompts + runtime with tool allowlists
- `src/orchestration/`: coordinator flow across all six agents
- `src/hedera/`: adapters + receipt/payout helpers
- `src/hedera/consensus`: HCS-style coordination adapter surface
- `src/hedera/schedule`: scheduled approval/execution adapter surface
- `src/hedera/token`: HTS/custom-fee-aware reward asset surface
- `src/hedera/mirror`: mirror query and audit aggregation surface
- `src/hedera/rewards`: reward policy and reservation engine
- `src/providers/`: replaceable data/model adapters
- `src/engines/`: deterministic finance/risk logic preserved from prior version
- `server/`: backend control plane, run API, approval API, session persistence, evidence bundle generation, and evidence verification for testnet execution
- `server/liveExecution.ts`: Hedera-gated live action connectors for SaucerSwap trade and Bonzo DeFi deposit flows

## Why this matches OpenClaw shape

- Manifest-first plugin identity (`openclaw.plugin.json`)
- Registerable tool surface with named tools
- Per-agent tool allowlists
- Session-oriented, auditable multi-agent orchestration

## Why this matches Hedera shape

- Hedera is treated as treasury/payment/receipt/audit infrastructure
- AI and orchestration remain offchain
- Mirror Node REST is the primary real-mode treasury read path
- Settlement and receipts are explicit about simulated vs scaffolded live paths
