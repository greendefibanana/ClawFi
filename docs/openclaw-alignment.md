# OpenClaw Alignment

## Official references used

- OpenClaw repo: https://github.com/openclaw/openclaw
- OpenClaw docs: https://docs.openclaw.ai/
- Tools API docs: https://docs.openclaw.ai/sdk/tools
- Plugin manifest docs: https://docs.openclaw.ai/guides/plugins/manifest

## Patterns applied to ClawFi

1. Manifest-first extension identity
- Added [openclaw.plugin.json](/C:/Users/ezevi/Documents/ClawFi/openclaw.plugin.json)
- Added `openclaw.extensions` package metadata in [package.json](/C:/Users/ezevi/Documents/ClawFi/package.json)
- Added manifest module: [manifest.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/manifest.ts)

2. Registerable tools with explicit names
- Added grouped tool modules in `src/tools/`:
  - token tools
  - DeFi tools
  - treasury tools
  - Hedera tools
  - execution tools

3. Session-scoped agent orchestration
- Added per-session tool invocation logging
- Added tool allowlist enforcement in runtime
- Added OpenClaw alignment metadata to workflow output

4. Extension-style registration
- Added [register.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/register.ts) as a native OpenClaw plugin entrypoint while preserving the existing OpenClaw-like adapter helper
- Added [nativeTools.ts](/C:/Users/ezevi/Documents/ClawFi/src/openclaw/nativeTools.ts) with host-callable tool definitions for workflow execution and deterministic policy review

## Direct concepts mirrored from OpenClaw

- Gateway/composable architecture concept from OpenClaw README:
  - ClawFi separates orchestrator, tools, and providers instead of collapsing logic into one agent file.
- Plugin registration pattern (`register(api)`) and tool registration:
  - ClawFi provides a `registerClawfiWithOpenClawLikeApi` adapter.
- Tool policy and explicit allow/deny style:
  - ClawFi runtime enforces per-agent allowlists for every tool call.

Reference links:
- https://github.com/openclaw/openclaw
- https://raw.githubusercontent.com/openclaw/openclaw/main/extensions/llm-task/index.ts
- https://docs.openclaw.ai/guides/plugins/manifest
- https://docs.openclaw.ai/sdk/tools

## Preserved from prior implementation

- Existing deterministic strategy/risk engines
- Existing Hedera adapter interfaces
- Existing dashboard foundation
- Existing seeded scenario and test setup

## What remains intentionally outside scope

- Contract-testing this plugin inside an actual OpenClaw host workspace
- Live chain execution paths in browser context
- Production identity/auth/session storage

The result is now a native OpenClaw plugin scaffold backed by the existing ClawFi engines, with host-runtime validation still remaining as the next external integration step.
