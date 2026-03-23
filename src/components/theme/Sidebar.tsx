import { useState } from "react";
import {
  Activity,
  Bot,
  ChevronDown,
  Clock,
  Database,
  FileText,
  Plus,
  Settings,
  Shield,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import type { SessionSummary, SidebarTemplate, TreasurySummary, WorkforceStatus } from "../../ui/types";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (prompt: string) => void;
  currentView: "chat" | "audit";
  onViewChange: (view: "chat" | "audit") => void;
  onOpenRiskPolicy: () => void;
  templates?: SidebarTemplate[];
  workforce?: WorkforceStatus[];
  treasury?: TreasurySummary;
  sessions?: SessionSummary[];
  onSelectSession?: (sessionId: string) => void;
}

const DEFAULT_TEMPLATES: SidebarTemplate[] = [
  {
    title: "Automated HBAR Staking",
    prompt: "Deploy 10,000 HBAR into the highest yield staking pool currently available, but ensure it passes our moderate risk policy.",
  },
  {
    title: "Stablecoin Yield Farming",
    prompt: "Allocate 5,000 USDC to the best performing stablecoin yield farm on Hedera with low impermanent loss risk.",
  },
  {
    title: "Treasury Rebalancing",
    prompt: "Analyze current treasury holdings and propose a rebalancing strategy to maintain a 60/40 split between HBAR and stablecoins.",
  },
];

export default function Sidebar({
  isOpen,
  onClose,
  onSelectTemplate,
  currentView,
  onViewChange,
  onOpenRiskPolicy,
  templates = DEFAULT_TEMPLATES,
  workforce = [],
  treasury,
  sessions = [],
  onSelectSession,
}: SidebarProps) {
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const workforceRows = workforce.slice(0, 3);
  const recentSessions = sessions.slice(0, 2);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`
        fixed md:static inset-y-0 left-0 z-50
        w-[280px] md:w-[260px] bg-zinc-900 border-r border-zinc-800 flex flex-col h-full flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
      >
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
              className="flex-1 flex items-center justify-between bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-3 rounded-xl transition-colors font-medium"
              type="button"
            >
              <div className="flex items-center gap-2">
                <div className="bg-emerald-500/20 text-emerald-400 p-1 rounded-md">
                  <Plus size={18} />
                </div>
                New Strategy
              </div>
              <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 ${isTemplatesOpen ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="md:hidden p-3 text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
              type="button"
            >
              <X size={20} />
            </button>
          </div>

          {isTemplatesOpen && (
            <div className="flex flex-col gap-1 mt-1 animate-in slide-in-from-top-2 fade-in duration-200">
              {templates.map((template, index) => (
                <button
                  key={`${template.title}-${index}`}
                  onClick={() => {
                    onSelectTemplate(template.prompt);
                    setIsTemplatesOpen(false);
                    onViewChange("chat");
                  }}
                  className="text-left px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-colors border border-transparent hover:border-zinc-700/50"
                  type="button"
                >
                  {template.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-2 space-y-1 border-b border-zinc-800/50">
          <button
            onClick={() => {
              onViewChange("chat");
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${currentView === "chat" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}`}
            type="button"
          >
            <Bot size={16} />
            Agent Chat
          </button>
          <button
            onClick={() => {
              onViewChange("audit");
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${currentView === "audit" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}`}
            type="button"
          >
            <FileText size={16} />
            Audit Log
          </button>
          <button
            onClick={() => {
              onOpenRiskPolicy();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            type="button"
          >
            <ShieldAlert size={16} />
            Risk Policy
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Agent Workforce</h3>
            <div className="space-y-1">
              {(workforceRows.length > 0 ? workforceRows : buildFallbackWorkforce()).map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {iconForRole(worker.role)}
                    <span className="text-sm text-zinc-300">{worker.name}</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${indicatorForStatus(worker.status)}`}></span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Treasury Overview</h3>
            <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
              <div className="flex items-center gap-2 text-zinc-400 mb-1">
                <Wallet size={14} />
                <span className="text-xs">{treasury?.networkLabel ?? "Hedera Mainnet"}</span>
              </div>
              <div className="text-xl font-mono font-medium text-zinc-100">
                {treasury?.balanceLabel ?? "1,245,000 HBAR"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{treasury?.walletLabel ?? "Wallet unavailable"}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Risk Exposure</span>
                <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">{treasury?.riskLabel ?? "Low"}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Recent Activity</h3>
            <div className="space-y-1">
              {(recentSessions.length > 0 ? recentSessions : buildFallbackSessions()).map((session) => (
                <button
                  key={session.id}
                  onClick={() => onSelectSession?.(session.id)}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer text-sm text-zinc-300 w-full text-left"
                  type="button"
                >
                  <Clock size={14} className="text-zinc-500" />
                  <span className="truncate">{session.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center justify-between px-2 py-2 rounded-xl hover:bg-zinc-800 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-indigo-500 flex items-center justify-center text-white font-medium text-sm">
                CF
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-zinc-200">ClawFi Admin</span>
                <span className="text-xs text-zinc-500">Governance Role</span>
              </div>
            </div>
            <Settings size={16} className="text-zinc-500" />
          </div>
        </div>
      </div>
    </>
  );
}

function iconForRole(role: WorkforceStatus["role"]) {
  if (role === "researcher") return <Database size={16} className="text-blue-400" />;
  if (role === "risk") return <Shield size={16} className="text-purple-400" />;
  if (role === "executor") return <Activity size={16} className="text-amber-400" />;
  return <Bot size={16} className="text-emerald-400" />;
}

function indicatorForStatus(status: WorkforceStatus["status"]) {
  if (status === "online") return "bg-emerald-500";
  if (status === "warning") return "bg-amber-400";
  if (status === "offline") return "bg-red-500";
  return "bg-zinc-600";
}

function buildFallbackWorkforce(): WorkforceStatus[] {
  return [
    { id: "fallback-research", name: "Researcher", role: "researcher", status: "online", detail: "" },
    { id: "fallback-risk", name: "Risk Policy", role: "risk", status: "online", detail: "" },
    { id: "fallback-executor", name: "Executor", role: "executor", status: "online", detail: "" },
  ];
}

function buildFallbackSessions(): SessionSummary[] {
  return [
    { id: "fallback-1", title: "HBAR Staking Strategy", detail: "", active: false },
    { id: "fallback-2", title: "USDC Yield Farming", detail: "", active: false },
  ];
}
