# Agents

## Coordinator Agent

- Accepts the treasury goal
- Breaks work into specialist tasks
- Anchors the final merged plan

Allowed tools:
- `getTreasuryBalances`
- `getPortfolioState`
- `reserveBudget`
- `buildAllocationPlan`

## Token Research Agent

- Scores Hedera-native token opportunities
- Produces thesis and draft sizing suggestions

Allowed tools:
- `getTokenMarketData`
- `scanTokenOpportunities`
- `getTokenLiquidityProfile`
- `buildTokenThesis`

## DeFi Strategy Agent

- Compares stablecoin and Hedera DeFi yield sleeves
- Prefers safe liquidity over raw APY

Allowed tools:
- `scanDefiOpportunities`
- `compareDefiStrategies`
- `getProtocolRiskSummary`
- `estimateYieldOutcomes`

## Risk Agent

- Enforces concentration, risk, liquidity, and slippage limits
- Rejects or resizes unsafe actions with explicit findings

Allowed tools:
- `buildAllocationPlan`
- `getPortfolioState`
- `recordDecisionReceipt`

## Execution Agent

- Converts approved actions into a simulation-first preview
- Does not claim live settlement when none exists

Allowed tools:
- `simulateTradeAction`
- `simulateDefiAction`
- `buildExecutionPreview`
- `createScheduledExecution`
- `getScheduledExecutionStatus`
- `logExecutionEvent`

## Reporter Agent

- Produces the final treasury narrative
- Explains approvals, rejections, and payment logging

Allowed tools:
- `getTreasuryAccountState`

## Reward model

- Fixed reward per task
- Reward reserved at assignment
- Reward released after successful completion
- Reward settled in HBAR-denominated terms through the Hedera layer abstraction
