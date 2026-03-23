import { describe, expect, it } from "vitest";
import pluginManifest from "../openclaw.plugin.json";
import packageJson from "../package.json";

describe("OpenClaw plugin metadata", () => {
  it("ships the native manifest and package extension metadata expected by OpenClaw", () => {
    expect(pluginManifest.id).toBe("clawfi-openclaw");
    expect(pluginManifest.kind).toBe("provider");
    expect(pluginManifest.configSchema.required).toEqual([
      "simulateOnly",
      "approvalRequired",
      "hederaMode",
    ]);

    expect(packageJson.openclaw.extensions).toContain("./src/openclaw/register.ts");
  });
});
