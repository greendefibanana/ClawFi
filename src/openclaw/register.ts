import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createClawfiToolRegistry } from "../tools/registerAllTools";
import type { ToolDependencies } from "../tools/types";
import { clawfiOpenclawManifest } from "./manifest";
import { buildNativeOpenClawTools } from "./nativeTools";

export type OpenClawLikePluginApi = {
  registerTool(name: string, definition: { description: string; optional?: boolean }): void;
  registerManifest(manifest: unknown): void;
};

export function registerClawfiWithOpenClawLikeApi(api: OpenClawLikePluginApi, deps: ToolDependencies) {
  api.registerManifest(clawfiOpenclawManifest);
  const registry = createClawfiToolRegistry(deps);
  for (const toolName of registry.list()) {
    api.registerTool(toolName, {
      description: `${toolName} tool registered by ClawFi extension`,
    });
  }
  return registry;
}

export default definePluginEntry({
  id: clawfiOpenclawManifest.id,
  name: clawfiOpenclawManifest.name,
  register(api: {
    registerTool(
      definition: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        execute(id: string, params: Record<string, unknown>): Promise<unknown>;
      },
      options?: { optional?: boolean },
    ): void;
  }) {
    for (const tool of buildNativeOpenClawTools()) {
      api.registerTool(
        {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          execute: (id, params) => tool.execute(id, params),
        },
        { optional: tool.optional ?? true },
      );
    }
  },
});
