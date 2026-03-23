# ClawFi Testnet Delivery Todo

## Phase 0: Scope and Acceptance

- [x] Define funding-grade acceptance criteria for end-to-end testnet flow.
- [x] Commit implementation plan to repository.
- [x] Add formal sign-off checklist with tx evidence artifacts template.

## Phase 1: Backend Control Plane

- [x] Add backend API service for server-side orchestration runs.
- [x] Add persistent session storage (`.clawfi/sessions.json`).
- [x] Add run/list/latest/get session endpoints.
- [x] Add frontend fallback to API-first session loading.
- [x] Add CLI runner for one-off testnet session execution.
- [x] Parameterize orchestrator for adapter/config overrides (`runClawFiWorkflow(options)`).

## Phase 2: Hedera Testnet Wiring

- [x] Add mode switch (`simulated` vs `real_scaffolded`) via server env.
- [x] Add server path to use real Hedera adapter credentials when enabled.
- [x] Keep explicit simulated fallback when credentials are absent.
- [x] Replace `AccountBalanceQuery` path with Mirror Node REST reads in real mode.
- [x] Validate real HCS receipts end-to-end with a funded topic on testnet.
- [x] Validate real reward settlements end-to-end with funded testnet accounts.

## Phase 3: Live Execution Connectors

- [x] Implement live token trade adapter against a supported Hedera testnet venue (SaucerSwap).
- [x] Implement live DeFi action adapter against a supported Hedera testnet protocol (Bonzo).
- [x] Add quote-to-execution reconciliation checks and slippage guardrail enforcement.
- [x] Add transaction failure recovery paths and retry policy.

## Phase 4: Approval and Governance

- [x] Add approval-required API endpoints/workflow states for execution and payouts.
- [x] Add UI approval controls and signed-off action history.
- [x] Add role/audit metadata for who approved what and when.

## Phase 5: Validation and Funding Demo

- [x] Keep lint/typecheck/build/test green after restructuring.
- [x] Add integration tests for backend API + real adapter mode.
- [x] Add testnet smoke script that emits HashScan links for all critical txs.
- [x] Produce final demo evidence bundle (tx IDs, receipts, payouts, decision log).

## Phase 6: Hedera Core Mechanics Patch

- [x] Add explicit Hedera core modules: consensus, schedule, token, mirror, receipts, rewards.
- [x] Emit receipt-first lifecycle events for task, analysis, risk, allocation, execution, and rewards.
- [x] Replace direct-execution UX with scheduled approval rail model in workflow + UI.
- [x] Implement real on-chain scheduling with Hedera SDK (ScheduleCreate/Sign).
- [x] Add reward reservation lifecycle and release/cancel transitions.
- [x] Add unified mirror-style audit trail aggregation in workflow output + UI panel.
- [x] Add tests for canonical receipt payload hashing, schedule lifecycle, and mirror audit aggregation.
- [x] Add Hedera mechanics documentation set (`docs/hedera-mechanics.md`, `docs/receipts.md`, `docs/scheduled-execution.md`, `docs/rewards.md`, `docs/audit-ui.md`).
- [x] Validate real HCS receipt publishing using funded testnet topic in `real_scaffolded` mode.
- [x] Validate real approval-gated live execution and schedule-linked settlement evidence on testnet.

## Phase 7: Agent OS & Dynamic Orchestration

- [x] Implement `AiProviderFactory` for dynamic Gemini/GPT/Claude routing.
- [x] Implement `WorkforceManager` UI for custom agent configuration.
- [x] Refactor Orchestrator to support dynamic user-defined agent execution.
- [x] Add Agent OS tab and workforce management state to frontend.
- [x] Enable HTS reward settlement for dynamic custom agents.

## Validation notes

- Latest funded live proof bundle: `.clawfi/evidence/session-c59a78d3.evidence.json`
- Session date: March 21, 2026
- Mode: `real_scaffolded`
- Network: `testnet`
- Verification command: `npm.cmd run verify:evidence -- --session=session-c59a78d3`
- Verification result: passed with `54` receipts, `6` payouts, and `60/60` transactions found on Hedera Mirror Node
