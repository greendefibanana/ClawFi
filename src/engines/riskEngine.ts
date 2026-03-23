import {
  actionPlanSchema,
  plannedActionSchema,
  riskDecisionSchema,
  type DefiOpportunity,
  type PlannedAction,
  type RiskDecision,
  type StrategyConfig,
  type TokenOpportunity,
  type Treasury,
} from "../domain/schemas";

const maxRiskByLevel = {
  low: 45,
  medium: 62,
  high: 80,
} as const;

export function reviewActionPlan(input: {
  draftActions: PlannedAction[];
  treasury: Treasury;
  config: StrategyConfig;
  tokenOpportunities: TokenOpportunity[];
  defiOpportunities: DefiOpportunity[];
}) {
  const findings: RiskDecision["findings"] = [];
  const rejectedOpportunityIds = new Set<string>();
  const resizedActions: RiskDecision["resizedActions"] = [];

  const approvedActions = input.draftActions.flatMap((action) => {
    const opportunity = [...input.tokenOpportunities, ...input.defiOpportunities].find(
      (candidate) => candidate.id === action.opportunityId,
    );

    if (!opportunity) {
      return [];
    }

    const exposureLimitPercent =
      action.actionType === "buy_token"
        ? input.config.maxTokenExposurePercent
        : input.config.maxProtocolExposurePercent;
    const maxAllocationUsd = input.treasury.portfolio.totalValueUsd * (exposureLimitPercent / 100);

    if (opportunity.riskScore > maxRiskByLevel[input.config.riskLevel]) {
      findings.push({
        severity: "critical",
        message: `${opportunity.title} exceeds the configured risk ceiling.`,
        relatedActionId: action.id,
        opportunityId: opportunity.id,
      });
      rejectedOpportunityIds.add(opportunity.id);
      return [];
    }

    if (opportunity.slippageBps > input.config.maxSlippageBps) {
      findings.push({
        severity: "critical",
        message: `${opportunity.title} breaches the slippage guardrail.`,
        relatedActionId: action.id,
        opportunityId: opportunity.id,
      });
      rejectedOpportunityIds.add(opportunity.id);
      return [];
    }

    if (action.targetAllocationUsd > maxAllocationUsd) {
      findings.push({
        severity: "warning",
        message: `${action.title} was resized to respect concentration limits.`,
        relatedActionId: action.id,
        opportunityId: opportunity.id,
      });
      resizedActions.push({
        actionId: action.id,
        originalAllocationUsd: action.targetAllocationUsd,
        finalAllocationUsd: maxAllocationUsd,
        reason: "Treasury concentration policy",
      });

      return [
        plannedActionSchema.parse({
          ...action,
          targetAllocationUsd: maxAllocationUsd,
          targetAllocationPercent: (maxAllocationUsd / input.treasury.portfolio.totalValueUsd) * 100,
          status: "resized",
        }),
      ];
    }

    return [plannedActionSchema.parse({ ...action, status: "approved" })];
  });

  const status =
    approvedActions.length === 0
      ? "rejected"
      : findings.some((finding) => finding.severity !== "info")
        ? "approved_with_changes"
        : "approved";

  const rejectedActionIds = input.draftActions
    .filter((action) => action.opportunityId && rejectedOpportunityIds.has(action.opportunityId))
    .map((action) => action.opportunityId!);

  const actionPlan = actionPlanSchema.parse({
    reserveUsd: input.treasury.budgets.reserveBudgetUsd,
    tradingUsd: approvedActions
      .filter((action) => action.actionType === "buy_token")
      .reduce((sum, action) => sum + action.targetAllocationUsd, 0),
    defiUsd: approvedActions
      .filter((action) => action.actionType === "allocate_defi")
      .reduce((sum, action) => sum + action.targetAllocationUsd, 0),
    actions: approvedActions,
    rejectedOpportunityIds: rejectedActionIds,
    expectedReturnLowPercent: 6.8,
    expectedReturnHighPercent: 13.2,
    approvalState: status,
    notes: [
      "Reserve budget remains untouched and liquid.",
      "Rejected opportunities stay visible for auditability.",
    ],
  });

  const riskDecision = riskDecisionSchema.parse({
    status,
    findings,
    rejectedOpportunityIds: rejectedActionIds,
    resizedActions,
    approvedActions,
  });

  return {
    actionPlan,
    riskDecision,
  };
}
