export type AgentRole = "user" | "orchestrator" | "researcher" | "executor" | "risk" | "system";

export type ActionStatus = "pending" | "approved" | "rejected" | "executed";

export interface ActionPreviewData {
  id: string;
  type: string;
  protocol: string;
  amount: string;
  expectedYield?: string;
  riskScore: "Low" | "Medium" | "High";
  status: ActionStatus;
}

export interface ReceiptData {
  actionId?: string;
  txHash: string;
  network: string;
  gasUsed: string;
  timestamp: string;
  explorerUrl?: string;
}

export interface Message {
  id: string;
  role: AgentRole;
  content: string;
  timestamp: Date;
  actionPreview?: ActionPreviewData;
  receipt?: ReceiptData;
}

export interface SidebarTemplate {
  title: string;
  prompt: string;
}

export interface WorkforceStatus {
  id: string;
  name: string;
  role: Exclude<AgentRole, "user" | "system">;
  status: "online" | "warning" | "idle" | "offline";
  detail: string;
}

export interface TreasurySummary {
  networkLabel: string;
  balanceLabel: string;
  riskLabel: string;
  walletLabel: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  detail: string;
  active: boolean;
}

export interface AuditActionItem {
  id: string;
  type: string;
  protocol: string;
  amount: string;
  status: ActionStatus;
  expectedYield?: string;
  riskScore: "Low" | "Medium" | "High";
  receipt?: ReceiptData;
}

export interface RiskPolicy {
  maxAmount: string;
  requireAudit: boolean;
  minTvl: string;
  maxRiskScore: "Low" | "Moderate" | "High";
  allowedProtocols: string[];
}
