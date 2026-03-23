# CLAWFI

ClawFi is an **OpenClaw-powered, Hedera-native financial agent workforce** for token research, DeFi strategy, treasury policy enforcement, execution simulation, and auditable agent rewards/receipts.

ClawFi is built as an **agent-first application for the Agentic Society**:

- OpenClaw-style agents are the primary economic actors
- agents coordinate across bounded roles instead of one black-box model
- agents generate proposals, compete for capital, and trigger repeat workflow actions
- Hedera provides trust, coordination, scheduling, settlement, and auditability
- UCP standardizes the economic intent of execution quotes and reward distributions

Use this framing:

> ClawFi is an agent-first OpenClaw-style treasury workforce on Hedera, where agents coordinate work, publish attestations, exchange value, and leave behind verifiable proof.

This repository was **restructured from an existing MVP**, not rebuilt from zero.

## Why this fits the Hedera Agentic Society bounty

ClawFi is designed around the exact problem the bounty describes: a killer app for a society of autonomous agents.

### Agent-first

- the product is built around specialized agents: Coordinator, Token Research, DeFi Strategy, Risk, Execution, and Reporter
- each agent has allowlisted tools, bounded responsibilities, and measurable outputs
- the UI is for humans observing agent flow, not for manually performing the work on their behalf

### Multi-agent coordination

- ClawFi uses a session-oriented, multi-agent workflow where agents research, bid, clear policy, prepare execution, and report outcomes
- the runtime includes HCS-backed coordination surfaces for requests, bids, receipts, and decision logging
- reasoning hashes and workflow receipts are treated as attestations, not as disposable app logs

### Autonomous and semi-autonomous behavior

- agents drive research, proposal generation, policy review, execution preparation, and reward accounting
- humans supervise the trust boundary through approval-gated execution, rather than micromanaging the flow
- this creates a semi-autonomous system suitable for treasury-grade operations

### Hedera as foundational infrastructure

ClawFi uses Hedera in five complementary roles:

- **Consensus Service** for coordination receipts, workflow attestations, and HCS-style event logging
- **Mirror Node REST** for live treasury introspection and verification
- **Scheduled Transactions** for approval-gated execution release
- **Hedera EVM** for live connector execution against DeFi and trading venues
- **token-service-aware reward infrastructure** for agent compensation, with live HBAR payout settlement implemented today

### UCP for agent-to-agent commerce

ClawFi does not just move value. It packages economic intent in a machine-readable format.

- scheduled executions can carry `ucpInvoice` objects
- payouts can carry `ucpDistribution` objects
- receipts and evidence artifacts preserve those UCP payloads

That means Hedera handles settlement and verification, while UCP standardizes how agents quote work and describe value exchange.

## Judge walkthrough

If you want the fastest path through the repo:

1. Read this README for setup and architecture framing.
2. Open [docs/testnet-demo-script-bounty-3min.md](/C:/Users/ezevi/Documents/ClawFi/docs/testnet-demo-script-bounty-3min.md) for the bounty-focused demo narrative.
3. Open [docs/testnet-user-session.md](/C:/Users/ezevi/Documents/ClawFi/docs/testnet-user-session.md) for a real March 21, 2026 funded testnet session.
4. Open [docs/hedera-mechanics.md](/C:/Users/ezevi/Documents/ClawFi/docs/hedera-mechanics.md) for the Hedera-specific implementation details.
5. Open [docs/receipts.md](/C:/Users/ezevi/Documents/ClawFi/docs/receipts.md) and [docs/rewards.md](/C:/Users/ezevi/Documents/ClawFi/docs/rewards.md) for attestations, payout flow, and UCP-linked reward logic.

## What was preserved

- Existing domain schemas and finance models
- Token and DeFi strategy engines
- Deterministic risk policy engine
- Hedera receipt and payout adapters
- Judge-facing dashboard foundation
- Existing unit and smoke test coverage

## What was refactored

- Added a native OpenClaw plugin manifest and package metadata: [openclaw.plugin.json](/C:/Users/ezevi/Documents/ClawFi/openclaw.plugin.json) and [package.json](/C:/Users/ezevi/Documents/ClawFi/package.json)
- Added a native OpenClaw plugin entrypoint plus host-callable ClawFi tools in [register.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/register.ts) and [nativeTools.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/nativeTools.ts)
- Added grouped, named tools for token, DeFi, treasury, Hedera, and execution domains in `src/tools/`
- Upgraded agent runtime to allowlisted tool execution per role
- Introduced session-scoped tool invocation logging
- Added explicit Hedera core modules for `consensus`, `schedule`, `token`, `mirror`, `rewards`, and `receipts`
- Expanded Hedera receipt lifecycle across task, analysis, risk, allocation, execution, and reward events
- Added scheduled approval-first execution model (`simulate -> schedule -> approve -> execute/cancel`)
- Added reward reservation lifecycle (`reserved -> released/cancelled`) linked to receipts
- Updated UI to show scheduled approval rail, reward reservation history, and mirror-style audit panel

## OpenClaw plugin status

The repo now ships a native OpenClaw plugin scaffold, not just an OpenClaw-like adapter.

- OpenClaw can discover this repo through the root `openclaw.plugin.json` manifest and the `openclaw.extensions` metadata in [package.json](/C:/Users/ezevi/Documents/ClawFi/package.json)
- The native plugin entry registers host-callable ClawFi tools for policy defaults, demo context, candidate-plan generation, deterministic risk review, and full workflow execution
- The existing dashboard and local agent runtime remain intact; the plugin layer is additive

Evaluator path:

```bash
openclaw plugins install C:\Users\ezevi\Documents\ClawFi
openclaw gateway restart
openclaw plugins list
```

OpenClaw-specific setup and sample config live in [docs/openclaw-plugin-setup.md](/C:/Users/ezevi/Documents/ClawFi/docs/openclaw-plugin-setup.md).

## Architecture shape

```text
src/
  app/             Hooks and app wiring
  components/      Dashboard components
  core/            Core models and scenarios (re-export bridge + migration path)
  agents/          Specialized agent prompts and runtime
  orchestration/   Coordinator flow and end-to-end session execution
  tools/           OpenClaw-style tool registry and grouped finance/Hedera tools
  providers/       Market/DeFi/treasury/execution/AI adapters
  risk-engine/     Risk policy facade
  execution/       Execution preview facade
  hedera/          Treasury, receipts, payouts, adapter interfaces
  domain/          Existing schema source preserved from prior version
  engines/         Existing strategy/risk engines preserved from prior version
```

## Integration mode honesty

- **Mocked / fallback-backed**:
  - default demo data paths and simulated treasury state
  - AI output falls back to the mock provider when no live provider/key is configured
- **Simulated**:
  - Hedera treasury reads in demo mode
  - Hedera receipt and reward settlement IDs
  - execution flow (simulation-first)
- **Wallet connected**:
  - Mirror Node REST treasury reads against the connected wallet account
  - browser wallet transaction signing for live approval, execution, and payouts
  - backend session persistence and evidence generation without holding the user's treasury private key
- **Real scaffolded**:
  - Mirror Node REST treasury reads
  - Hedera SDK payouts (`TransferTransaction`) and HCS receipt anchoring (`TopicMessageSubmitTransaction`) in backend mode
  - scheduled approval flow via `ScheduleCreateTransaction` / `ScheduleSignTransaction`
  - live SaucerSwap and Bonzo connector code paths behind explicit env flags
  - bounded real providers for token/DeFi opportunities with fallback behavior when upstream calls fail

## Human UI, agent-first product

The browser UI is intentionally **observer-first**:

- it shows agent flow steps, tool traces, schedule states, receipts, payouts, and audit history
- it is designed so humans can supervise and approve high-trust actions
- it is not designed as a manual trading console; the agents are the primary operators of the workflow

Main human-facing surfaces:

- Agent workflow timeline
- Scheduled Approval Rail
- Receipts & Payouts
- Mirror Audit Panel
- Evidence viewer and verification flow

## Hedera and UCP implementation summary

### Hedera-native surfaces

- **Mirror Node REST** reads HBAR and token balances from live Hedera accounts
- **`TopicMessageSubmitTransaction`** anchors workflow receipts and attestations to HCS
- **`ScheduleCreateTransaction` / `ScheduleSignTransaction`** implement governed release of execution
- **`TransferTransaction`** settles live HBAR-denominated payouts
- **`ContractExecuteTransaction`** is used for live SaucerSwap and Bonzo execution paths
- **`AccountAllowanceApproveTransaction`** is used in the Bonzo token deposit flow

### UCP surfaces

- `src/hedera/ucp.ts` builds UCP 1.0 execution invoices and payout distributions
- scheduled executions carry `ucpInvoice`
- payouts carry `ucpDistribution`
- receipt payloads and evidence artifacts preserve these UCP objects for downstream machine consumption

## Run

```bash
npm.cmd install
npm.cmd run dev:api
npm.cmd run dev
```

## Validate

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Local audit status in this repo:

- `lint`: passes
- `typecheck`: passes
- `build`: passes
- `test`: passes (`39/39` tests)

## Deploy

### Frontend on Vercel

This repo already includes [vercel.json](/C:/Users/ezevi/Documents/ClawFi/vercel.json), so Vercel can deploy the Vite app directly from the repo root.

Required Vercel env vars:

- `VITE_CLAWFI_API_BASE=https://<your-render-service>.onrender.com`
- `VITE_CLAWFI_HEDERA_NETWORK=testnet`
- `VITE_WALLETCONNECT_PROJECT_ID=<your project id>` if you want wallet-connected mode in production
- any `VITE_SAUCERSWAP_*`, `VITE_BONZO_*`, and `VITE_HEDERA_RECEIPT_TOPIC_ID` values you want exposed to the browser

Recommended Vercel project settings:

- Framework preset: `Vite`
- Root directory: `.`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

### Backend on Render

This repo already includes [render.yaml](/C:/Users/ezevi/Documents/ClawFi/render.yaml) for a Node web service named `clawfi-api`.

Required Render env vars for real Hedera mode:

- `HEDERA_OPERATOR_ID`
- `HEDERA_OPERATOR_KEY`

Recommended Render env vars:

- `HEDERA_OPERATOR_KEY_TYPE=ecdsa`
- `HEDERA_RECEIPT_TOPIC_ID=<topic id>` if you want HCS receipt anchoring
- `HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com`
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `ANTHROPIC_API_KEY` if you want live narrative generation instead of mock fallback
- `SAUCERSWAP_SYMBOL_DECIMALS_JSON={"SAUCE":6,"HBAR":8}`
- the `SAUCERSWAP_*` / `BONZO_*` backend connector vars from [.env.example](/C:/Users/ezevi/Documents/ClawFi/.env.example) when enabling live execution

Render notes:

- `PORT` and `0.0.0.0` binding are already handled in [server/index.ts](/C:/Users/ezevi/Documents/ClawFi/server/index.ts).
- persistent evidence/session storage is already mapped to `/var/data` in [render.yaml](/C:/Users/ezevi/Documents/ClawFi/render.yaml).
- if you want a safer first deploy, set `HEDERA_MODE=simulated` and keep `CLAWFI_ENABLE_LIVE_TRADING=false` and `CLAWFI_ENABLE_LIVE_DEFI=false` until the service is healthy.

## Testnet run modes

- Simulated mode:
  - set `HEDERA_MODE=simulated`
  - run `npm.cmd run dev:api`
- Wallet connected mode:
  - set `HEDERA_MODE=wallet_connected` on the API if you want the backend default to match the UI mode
  - set `HEDERA_MIRROR_NODE_URL` on the backend if you do not want the default Hedera Mirror Node URL
  - set browser envs: `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_CLAWFI_HEDERA_NETWORK`, and the `VITE_SAUCERSWAP_*` / `VITE_BONZO_*` connector vars from `.env.example`
  - run `npm.cmd run dev:api`
  - run `npm.cmd run dev`
  - in the browser, switch the mode selector to `wallet_connected`, connect a Hedera-compatible WalletConnect wallet, enable live execution, and approve from the UI
- Real scaffolded mode:
  - set `HEDERA_MODE=real_scaffolded`
  - set `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_NETWORK`, optional `HEDERA_RECEIPT_TOPIC_ID`, optional `HEDERA_MIRROR_NODE_URL`
  - run `npm.cmd run run:testnet`
  - this writes session and evidence artifacts under `.clawfi/`

Important boundary:

- the simulated/API/UI workflow is verified locally by the test suite
- the wallet-connected frontend flow is covered by API and app integration tests, including `POST /api/sessions/:id/wallet-complete`
- the repo now includes a funded live Hedera testnet proof bundle from March 21, 2026: `session-c59a78d3`
- `npm.cmd run verify:evidence -- --session=session-c59a78d3` passes against Hedera Mirror Node with `54` receipts, `6` payouts, and `60/60` captured transactions found
- new live runs still depend on your own funded credentials, venue configuration, and operator approvals; treat the included artifact as proof of implementation, not a guarantee that any fresh environment is preconfigured correctly

## Approval-gated flow

For approval-required governance runs:

1. Create pending run:
```bash
curl -X POST http://127.0.0.1:8787/api/sessions/run ^
  -H "Content-Type: application/json" ^
  -d "{\"hederaMode\":\"real_scaffolded\",\"autoApprove\":false}"
```
2. Approve and settle:
```bash
curl -X POST http://127.0.0.1:8787/api/sessions/<SESSION_ID>/approve ^
  -H "Content-Type: application/json" ^
  -d "{\"approvedBy\":\"treasury-operator\"}"
```

## Live trading + DeFi execution

Live execution is opt-in and only runs when:
- `HEDERA_MODE=real_scaffolded`
- `strategyConfig.simulateOnly=false`
- connector flags enabled:
  - `CLAWFI_ENABLE_LIVE_TRADING=true` (SaucerSwap HBAR->token connector)
  - `CLAWFI_ENABLE_LIVE_DEFI=true` (Bonzo deposit connector)

Quick CLI run with live intent:
```bash
npm.cmd run run:testnet -- --live=true --auto-approve=true
```

For governance-first run:
```bash
npm.cmd run run:testnet -- --live=true --auto-approve=false
```
Then approve via API endpoint.

Preset script for governance-first live smoke:
```bash
npm.cmd run smoke:testnet:live
```

These commands exercise the live connector path only when the required Hedera and venue credentials/config are present and funded.

## Browser wallet live path

For user-driven frontend execution without backend-held treasury keys:

- run the API and Vite frontend together
- set `VITE_WALLETCONNECT_PROJECT_ID`
- set the browser connector envs from `.env.example`:
  - `VITE_SAUCERSWAP_ROUTER_CONTRACT_ID`
  - `VITE_SAUCERSWAP_WHBAR_TOKEN_ID`
  - `VITE_SAUCERSWAP_SYMBOL_TOKEN_MAP_JSON`
  - `VITE_BONZO_LENDING_POOL_CONTRACT_ID` or `VITE_BONZO_LENDING_POOL_EVM_ADDRESS`
  - `VITE_BONZO_DEFI_ASSET_TOKEN_ID`
  - optional `VITE_HEDERA_RECEIPT_TOPIC_ID`
- set backend mirror access with `HEDERA_MIRROR_NODE_URL` if needed
- from the UI:
  - choose `wallet_connected`
  - connect the wallet
  - enable live execution
  - start a run
  - approve the pending actions in the browser wallet

In this mode the backend still coordinates agents, stores sessions, and builds evidence, but the live transaction signatures come from the connected browser wallet. The approval callback is `POST /api/sessions/:id/wallet-complete`.

## Evidence output

- One-off runs emit HashScan links and write:
  - `.clawfi/sessions.json`
  - `.clawfi/evidence/<sessionId>.evidence.json`
- API route for evidence:
  - `GET /api/sessions/:id/evidence`
- Verify an evidence artifact:
```bash
npm.cmd run verify:evidence -- --session=<SESSION_ID>
```

Tracked implementation checklist:
- [TODO.testnet.md](/C:/Users/ezevi/Documents/ClawFi/TODO.testnet.md)

Current proof bundle in this repo:
- `.clawfi/evidence/session-c59a78d3.evidence.json`
- verified on March 21, 2026 via `npm.cmd run verify:evidence -- --session=session-c59a78d3`

## Docs

- [Architecture](/C:/Users/ezevi/Documents/ClawFi/docs/architecture.md)
- [OpenClaw Alignment](/C:/Users/ezevi/Documents/ClawFi/docs/openclaw-alignment.md)
- [OpenClaw Plugin Setup](/C:/Users/ezevi/Documents/ClawFi/docs/openclaw-plugin-setup.md)
- [Hedera Layer](/C:/Users/ezevi/Documents/ClawFi/docs/hedera-layer.md)
- [Hedera Mechanics](/C:/Users/ezevi/Documents/ClawFi/docs/hedera-mechanics.md)
- [Receipts](/C:/Users/ezevi/Documents/ClawFi/docs/receipts.md)
- [Scheduled Execution](/C:/Users/ezevi/Documents/ClawFi/docs/scheduled-execution.md)
- [Rewards](/C:/Users/ezevi/Documents/ClawFi/docs/rewards.md)
- [Audit UI](/C:/Users/ezevi/Documents/ClawFi/docs/audit-ui.md)
- [Demo Script](/C:/Users/ezevi/Documents/ClawFi/docs/demo-script.md)
- [Funding Sign-off Checklist](/C:/Users/ezevi/Documents/ClawFi/docs/funding-signoff-checklist.md)
- [Testnet Live Runbook](/C:/Users/ezevi/Documents/ClawFi/docs/testnet-live-runbook.md)
- [Agents](/C:/Users/ezevi/Documents/ClawFi/docs/agents.md)
- [Risk Engine](/C:/Users/ezevi/Documents/ClawFi/docs/risk-engine.md)
