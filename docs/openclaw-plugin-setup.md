# OpenClaw Plugin Setup

This repo now includes a native OpenClaw plugin scaffold for the ClawFi treasury workflow.

## What OpenClaw gets

The native plugin entry is [register.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/register.ts) and currently registers these host-callable tools:

- `clawfi_get_policy_defaults`
- `clawfi_get_demo_context`
- `clawfi_build_candidate_plan`
- `clawfi_review_action_plan`
- `clawfi_run_workflow`

Those tools are implemented in [nativeTools.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/nativeTools.ts).

## Local install

From an OpenClaw environment on the same machine:

```bash
openclaw plugins install C:\Users\ezevi\Documents\ClawFi
openclaw gateway restart
openclaw plugins list
```

The plugin root manifest is [openclaw.plugin.json](/C:/Users/ezevi/Documents/ClawFi/openclaw.plugin.json), and [package.json](/C:/Users/ezevi/Documents/ClawFi/package.json) exposes the plugin entry through `openclaw.extensions`.

## Example config

Add an entry like this to the OpenClaw config:

```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "clawfi-openclaw": {
        "enabled": true,
        "config": {
          "simulateOnly": true,
          "approvalRequired": true,
          "hederaMode": "simulated"
        }
      }
    }
  },
  "tools": {
    "allow": ["clawfi-openclaw"]
  }
}
```

`simulateOnly`, `approvalRequired`, and `hederaMode` come from the inline `configSchema` in [openclaw.plugin.json](/C:/Users/ezevi/Documents/ClawFi/openclaw.plugin.json).

## Suggested first calls

Use these in order for the fastest evaluator path:

1. Call `clawfi_get_policy_defaults`
2. Call `clawfi_get_demo_context`
3. Call `clawfi_build_candidate_plan`
4. Call `clawfi_review_action_plan`
5. Call `clawfi_run_workflow`

This sequence demonstrates:

- treasury policy defaults
- deterministic candidate-plan construction
- deterministic policy enforcement
- full multi-agent treasury workflow execution

## Example workflow inputs

Minimal full-run input:

```json
{
  "goal": "Find two medium-risk token opportunities and deploy stablecoins into the safest Hedera yield opportunities above 8% APY while maintaining a 40/30/30 reserve, trading, and DeFi policy.",
  "hederaMode": "simulated",
  "autoApprove": false,
  "strategyConfig": {
    "riskLevel": "medium",
    "approvalRequired": true,
    "simulateOnly": true
  }
}
```

Minimal deterministic review input:

```json
{
  "draftActions": [],
  "strategyConfig": {
    "riskLevel": "medium"
  }
}
```

## Reviewer guidance

- For grant review, start in `simulated` mode.
- Use `clawfi_run_workflow` to prove end-to-end orchestration.
- Use `clawfi_review_action_plan` to show that risk approval is deterministic rather than prompt-only.
- The plugin layer is additive. The existing dashboard and server still work independently of OpenClaw host integration.
