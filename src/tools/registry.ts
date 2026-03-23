import { createId, isoNow } from "../lib/ids";
import type { ClawfiTool, ClawfiToolName, ToolCallContext, ToolDependencies, ToolInvocation } from "./types";

type ToolMap = Map<ClawfiToolName, ClawfiTool<unknown, unknown>>;

export class ClawfiToolRegistry {
  private readonly tools: ToolMap = new Map();
  private readonly invocations: ToolInvocation[] = [];

  constructor(private readonly deps: ToolDependencies) {}

  register<Input, Output>(tool: ClawfiTool<Input, Output>) {
    this.tools.set(tool.name, tool as ClawfiTool<unknown, unknown>);
  }

  list() {
    return Array.from(this.tools.keys());
  }

  getInvocations() {
    return this.invocations;
  }

  async invoke<Input, Output>(args: {
    name: ClawfiToolName;
    input: Input;
    context: ToolCallContext;
    allowedTools: string[];
  }): Promise<Output> {
    if (!args.allowedTools.includes(args.name)) {
      throw new Error(`${args.context.agentName} is not allowed to call ${args.name}.`);
    }

    const tool = this.tools.get(args.name);
    if (!tool) {
      throw new Error(`Tool ${args.name} is not registered.`);
    }

    const started = performance.now();
    try {
      const output = await tool.execute({
        input: args.input,
        context: args.context,
        deps: this.deps,
      });
      this.invocations.push({
        id: createId("tool"),
        sessionId: args.context.sessionId,
        agentName: args.context.agentName,
        toolName: args.name,
        timestamp: isoNow(),
        durationMs: Math.round(performance.now() - started),
        status: "ok",
        inputSummary: summarize(args.input),
        outputSummary: summarize(output),
      });
      return output as Output;
    } catch (error) {
      this.invocations.push({
        id: createId("tool"),
        sessionId: args.context.sessionId,
        agentName: args.context.agentName,
        toolName: args.name,
        timestamp: isoNow(),
        durationMs: Math.round(performance.now() - started),
        status: "error",
        inputSummary: summarize(args.input),
        outputSummary: "error",
        error: error instanceof Error ? error.message : "Unknown tool error",
      });
      throw error;
    }
  }
}

function summarize(value: unknown) {
  const raw = JSON.stringify(value);
  if (!raw) {
    return "none";
  }
  return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
}
