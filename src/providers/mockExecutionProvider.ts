import { executionPreviewSchema } from "../domain/schemas";
import type { ExecutionPreview } from "../domain/schemas";
import type { ExecutionSimulatorProvider } from "./interfaces";

export class MockExecutionSimulatorProvider implements ExecutionSimulatorProvider {
  preview(input: {
    actions: Array<{ title: string; amountUsd: number; venue: string; requiresApproval: boolean }>;
    config: { simulateOnly: boolean };
  }): Promise<ExecutionPreview> {
    const estimatedNetworkFeesUsd = input.actions.length * 0.37;
    const estimatedSlippageUsd = input.actions.reduce((sum, action) => sum + action.amountUsd * 0.0016, 0);

    return Promise.resolve(
      executionPreviewSchema.parse({
      mode: input.config.simulateOnly ? "simulation" : "prepared",
      steps: input.actions.map((action, index) => ({
        id: `step-${index + 1}`,
        title: action.title,
        detail: `${action.venue} route prepared for ${action.amountUsd.toFixed(0)} USD notionally.`,
        estimatedCostUsd: 1.5 + index * 0.35,
        requiresApproval: action.requiresApproval,
        status: input.config.simulateOnly ? "simulated" : "prepared",
      })),
      estimatedNetworkFeesUsd,
      estimatedSlippageUsd,
      settlementPath: input.config.simulateOnly
        ? "Simulation only. No live Hedera transfer or HTS trade submitted."
        : "Prepared for operator approval and Hedera settlement.",
      }),
    );
  }

  simulate(input: {
    treasury: { portfolio: { totalValueUsd: number } };
    actionPlanActions: Array<{ amountUsd: number; expectedReturnPercent: number }>;
  }) {
    const weightedAnnualReturn =
      input.actionPlanActions.reduce(
        (sum, action) => sum + action.amountUsd * (action.expectedReturnPercent / 100),
        0,
      ) / Math.max(input.treasury.portfolio.totalValueUsd, 1);

    const projectedMonthlyYieldUsd = input.treasury.portfolio.totalValueUsd * (weightedAnnualReturn / 12);

    return Promise.resolve({
      projectedMonthlyYieldUsd,
      projectedMonthlyPnLRangeUsd: [
        projectedMonthlyYieldUsd - 6400,
        projectedMonthlyYieldUsd + 9100,
      ] as [number, number],
      stressScenarioDrawdownUsd: input.actionPlanActions.reduce((sum, action) => sum + action.amountUsd, 0) * 0.115,
      liquidityCoveragePercent: 91,
    });
  }
}
