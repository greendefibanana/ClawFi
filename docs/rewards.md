# Rewards

Agent rewards are modeled as treasury economics, not UI decoration.

## Core models

- `RewardPolicy`
- `RewardReservation`
- `Payout`

Defined in `src/domain/schemas.ts`.

## Runtime behavior

1. Reservation:
- On task assignment/completion, reward budget is reserved via `reserveAgentReward`.
- Receipt emitted: `reward_reserved`.

2. Release/Cancel:
- Completed approved work: reservation transitions to `released`.
- Failed/rejected work: reservation transitions to `cancelled`.

3. Settlement:
- Payouts are settled through treasury adapter (`settlePayout`).
- Receipt emitted: `reward_settled`.

## HTS/custom-fee-aware posture

- Reward policy includes fee-routing-aware fields:
  - `rewardAssetSymbol`
  - `rewardPoolAccountId`
  - `feeRoutingAccountId`
  - role-based rewards map
- Token adapter exposes custom-fee-aware capability (`describeRewardAsset`).
- Current settlement is HBAR payout focused; HTS token settlement is scaffolded behind adapter boundaries.

