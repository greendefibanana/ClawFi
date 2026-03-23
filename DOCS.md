# ClawFi: Technical Documentation & Hackathon Guide

## 1. Overview
ClawFi is an AI-native treasury workforce platform built on **Hedera**. It utilizes the **OpenClaw** multi-agent orchestration pattern to distribute complex financial tasks across a network of specialized agents. Every decision, risk review, and settlement is anchored to Hedera via HCS (Consensus Service), HTS (Token Service), and Scheduled Transactions.

## 2. System Architecture

### 2.1 Agent Workforce (The "Agent OS")
ClawFi features a dynamic agent runtime where users can "hire" custom specialists (e.g., Gemini-powered DeFi Quants).
- **Coordinator:** Decomposes user goals into sub-tasks.
- **Specialists:** Token Research and DeFi Strategy agents scan the market.
- **Risk Agent:** A deterministic policy engine that validates all planned actions.
- **Execution Agent:** Prepares transaction previews and schedules transactions on-chain.
- **Reporter:** Synthesizes all agent outputs into a human-readable board report.

### 2.2 Hedera Integration Layers
- **Coordination (HCS):** All agent lifecycle events (Task Created -> Started -> Completed) are published to a dedicated HCS Topic.
- **Treasury (Mirror Node):** Balances and portfolio states are read directly from Hedera Mirror Nodes to ensure real-time accuracy.
- **Settlement (HTS):** Agent rewards are settled via HTS tokens (e.g., the `CLAW` token) upon task approval.
- **Governance (Scheduling):** All high-value transactions are created as **Hedera Scheduled Transactions**, requiring an explicit operator signature (via the UI) to execute.

## 3. The "Agent OS" Workflow
Users can configure the workforce via the **Agent OS Config** tab:
1. **Define Agent:** Provide a name, role, and system prompt.
2. **Provider Selection:** Choose between Gemini, OpenAI, Claude, or Mock (for testing).
3. **Tool Gating:** Assign specific tools (e.g., `scanDefiOpportunities`, `getTokenMarketData`) that the agent is permitted to use.
4. **Economic Incentive:** Set the HTS reward the agent receives upon successful strategy approval.

## 4. End-to-End Execution Flow

### Step 1: Infrastructure Setup
Run the setup script to prepare your Hedera environment:
```bash
npx tsx scripts/setup-testnet.ts
```
This creates your **HCS Coordination Topic** and a custom **HTS Reward Token**.

### Step 2: Environment Configuration
Ensure your `.env` includes:
- `HEDERA_OPERATOR_ID` & `HEDERA_OPERATOR_KEY`
- `HEDERA_RECEIPT_TOPIC_ID` (from Step 1)
- `HEDERA_NETWORK=testnet`

### Step 3: Run the Workforce
1. **Start the API:** `npm.cmd run dev:api`
2. **Start the UI:** `npm.cmd run dev`
3. **Configure Agents:** Use the "Agent OS Config" tab to add your specialists.
4. **Execute Goal:** Enter a treasury goal (e.g., "Optimize for 15% APY while maintaining 30% HBAR reserve").

### Step 4: Approval & Settlement
1. Review the **Action Plan** and the **Risk Finding** report.
2. Click **"Approve & Settle"**.
3. The system signs the **Scheduled Transactions** on Hedera and releases the **HTS Rewards** to the agents' accounts.

## 5. Verification & Audit
The **Mirror-Style Audit Trail** in the UI allows you to search and verify every HCS receipt. You can also run the automated evidence verifier:
```bash
npm.cmd run verify:evidence -- --session=LATEST
```
This script confirms that all transactions recorded in the session actually exist on the Hedera Mirror Node.

## 6. Real Testnet Session

For a user-style walkthrough of a real Hedera testnet session, including the exact session ID, evidence file, scheduled transaction IDs, live SaucerSwap execution, and the current Bonzo blocker, see:

- `docs/testnet-user-session.md`

---
**ClawFi: Verifiable, Auditable, and Autonomous Treasury Intelligence on Hedera.**
