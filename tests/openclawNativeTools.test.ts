import { describe, expect, it } from "vitest";
import { buildNativeOpenClawTools } from "../src/openclaw/nativeTools";

describe("buildNativeOpenClawTools", () => {
  it("exposes native OpenClaw tool definitions for the core ClawFi workflow", async () => {
    const tools = buildNativeOpenClawTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "clawfi_get_policy_defaults",
      "clawfi_get_demo_context",
      "clawfi_build_candidate_plan",
      "clawfi_review_action_plan",
      "clawfi_run_workflow",
    ]);

    const contextTool = tools.find((tool) => tool.name === "clawfi_build_candidate_plan");
    expect(contextTool).toBeDefined();
    const result = await contextTool!.execute("tool-1", {});

    expect(result.content[0]?.text).toContain("deterministic draft actions");
    expect((result.structuredContent as { draftActions: unknown[] }).draftActions.length).toBeGreaterThan(0);
  });
});
