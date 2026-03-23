# Scheduled Execution

ClawFi uses an approval-first execution rail:

`AI plan -> simulate -> schedule -> await approval -> approve/cancel -> execute`

## Model

- Schema: `scheduledExecutionSchema` in `src/domain/schemas.ts`
- Adapter interface: `src/hedera/schedule/adapter.ts`
- Implementations:
  - `SimulatedScheduleAdapter`
  - `RealScheduleAdapter` (scaffold)

## Status lifecycle

- `draft`
- `simulated`
- `scheduled`
- `awaiting_approval`
- `approved`
- `executed`
- `cancelled`
- `failed`

## Workflow wiring

- Scheduled records are created by Execution agent through tool:
  - `createScheduledExecution`
- Approval endpoint (`POST /api/sessions/:id/approve`) transitions schedule state and emits `execution_approved`.
- Post-approval action outcomes update schedule state (`executed` or `failed`) and log execution receipts.

## UI

- Scheduled Approval Rail panel shows:
  - schedule ID
  - current status
  - approval metadata (`approvedBy`, `approvedAt`)
  - execution preview text

