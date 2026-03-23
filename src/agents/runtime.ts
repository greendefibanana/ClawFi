import { agentResultSchema, agentTaskSchema, type ActivityLogEntry, type AgentResult, type AgentTask } from "../core/models/schemas";
import type { StrategyConfig, Treasury } from "../core/models/schemas";
import { createId, isoNow } from "../lib/ids";
import type { ClawfiToolName } from "../tools/types";
import { ClawfiToolRegistry } from "../tools/registry";

export type AgentDefinition<TInput, TOutput> = {
  name: string;
  title: string;
  prompt: string;
  rewardUsd: number;
  allowedTools: ClawfiToolName[];
  execute(input: TInput, context: AgentExecutionContext): Promise<{
    summary: string;
    confidence: number;
    output: TOutput;
    toolTrace?: string[];
  }>;
};

export type AgentExecutionContext = {
  callTool<TInput, TOutput>(name: ClawfiToolName, input: TInput): Promise<TOutput>;
};

export class AgentRuntime {
  constructor(
    private readonly options: {
      maxRetries?: number;
      sessionId: string;
      registry: ClawfiToolRegistry;
      toolContext: {
        treasury: Treasury;
        strategyConfig: StrategyConfig;
      };
    },
  ) {}

  async run<TInput, TOutput>(
    definition: AgentDefinition<TInput, TOutput>,
    input: TInput,
    activityLog: ActivityLogEntry[],
  ): Promise<{ task: AgentTask; result: AgentResult; output: TOutput | null }> {
    const task = agentTaskSchema.parse({
      id: createId("task"),
      agentName: definition.name,
      title: definition.title,
      status: "assigned",
      rewardUsd: definition.rewardUsd,
      allowedTools: definition.allowedTools,
      promptPreview: definition.prompt,
    });

    activityLog.push({
      id: createId("log"),
      timestamp: isoNow(),
      actor: definition.name,
      stage: "assignment",
      message: `${definition.name} accepted the task and locked its reward budget.`,
      tone: "system",
    });

    const toolTrace: string[] = [];
    const maxRetries = this.options.maxRetries ?? 1;

    let retries = 0;

    while (true) {
      try {
        const outcome = await definition.execute(input, {
          callTool: async <TToolInput, TToolOutput>(name: ClawfiToolName, toolInput: TToolInput) => {
            const output = await this.options.registry.invoke<TToolInput, TToolOutput>({
              name,
              input: toolInput,
              context: {
                sessionId: this.options.sessionId,
                agentName: definition.name,
                treasury: this.options.toolContext.treasury,
                strategyConfig: this.options.toolContext.strategyConfig,
              },
              allowedTools: definition.allowedTools,
            });
            toolTrace.push(name);
            return output;
          },
        });
        const result = agentResultSchema.parse({
          taskId: task.id,
          agentName: definition.name,
          status: "completed",
          summary: outcome.summary,
          confidence: outcome.confidence,
          output: outcome.output,
          toolTrace: outcome.toolTrace ?? toolTrace,
          retries,
        });

        activityLog.push({
          id: createId("log"),
          timestamp: isoNow(),
          actor: definition.name,
          stage: "completed",
          message: outcome.summary,
          tone: "success",
        });

        return {
          task: agentTaskSchema.parse({ ...task, status: "completed" }),
          result,
          output: outcome.output,
        };
      } catch (error) {
        if (retries >= maxRetries) {
          const failed = agentResultSchema.parse({
            taskId: task.id,
            agentName: definition.name,
            status: "failed",
            summary: error instanceof Error ? error.message : "Unknown failure",
            confidence: 0,
            output: null,
            toolTrace,
            retries,
          });

          activityLog.push({
            id: createId("log"),
            timestamp: isoNow(),
            actor: definition.name,
            stage: "failed",
            message: failed.summary,
            tone: "warning",
          });

          return {
            task: agentTaskSchema.parse({ ...task, status: "failed" }),
            result: failed,
            output: null,
          };
        }

        retries += 1;
        activityLog.push({
          id: createId("log"),
          timestamp: isoNow(),
          actor: definition.name,
          stage: "retry",
          message: `${definition.name} retried after a validation or tool failure.`,
          tone: "warning",
        });
      }
    }
  }
}
