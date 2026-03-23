# Risk Engine

## Policy inputs

- reserve percent
- trading percent
- DeFi percent
- risk level
- max token exposure
- max protocol exposure
- min liquidity threshold
- max slippage
- target yield APY

## Enforcement

The engine reviews draft actions and:

- rejects opportunities above the configured risk ceiling
- rejects opportunities above slippage limits
- resizes allocations that exceed token or protocol concentration caps
- preserves reserve capital outside strategy actions

## Output

- approved actions
- rejected opportunity IDs
- resize records
- structured findings with severity
- final approval state

## Demo example

In the seeded scenario:

- `SaucerSwap HBAR-USDC LP boost` is rejected for safer-yield mandate mismatch and slippage profile
- oversized allocations are resized to concentration policy limits

## Next improvements

- volatility-aware sizing
- correlation-aware portfolio limits
- protocol dependency graphs
- dynamic liquidity stress testing
