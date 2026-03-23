import { ExternalLink, Menu, FileText, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Message } from "../../ui/types";
import { SessionHistoryPanel } from "../ui/SessionHistoryPanel";
import type { SessionEvidence, SessionListEntry } from "../../state/useClawfiWorkflow";

interface AuditLogProps {
  messages: Message[];
  onOpenSidebar: () => void;
  sessions: SessionListEntry[];
  selectedSessionId: string | null;
  evidence: SessionEvidence | null;
  isHistoryLoading: boolean;
  onSelectSession: (sessionId: string) => void;
}

export default function AuditLog({
  messages,
  onOpenSidebar,
  sessions,
  selectedSessionId,
  evidence,
  isHistoryLoading,
  onSelectSession,
}: AuditLogProps) {
  const actions = messages.filter((message) => message.actionPreview).map((message) => message.actionPreview!);
  const receipts = messages.filter((message) => message.receipt).map((message) => message.receipt!);

  return (
    <div className="flex-1 flex flex-col h-full relative bg-zinc-950">
      <header className="h-14 border-b border-zinc-800/50 flex items-center px-4 sticky top-0 bg-zinc-950/80 backdrop-blur-md z-10 gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          type="button"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-zinc-400" />
          <span className="font-semibold text-zinc-200">Audit Log</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-4">
            {actions.length === 0 ? (
              <div className="py-10 text-center text-zinc-500">No transactions recorded yet.</div>
            ) : (
              actions.map((action) => {
                const receipt = receipts.find((item) => item.actionId === action.id);
                return (
                  <div key={action.id} className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm md:flex-row md:p-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                          action.status === "pending"
                            ? "bg-amber-500/10 text-amber-400"
                            : action.status === "approved" || action.status === "executed"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                        }`}>
                          {action.status === "pending" && <AlertTriangle size={12} />}
                          {(action.status === "approved" || action.status === "executed") && <CheckCircle2 size={12} />}
                          {action.status === "rejected" && <XCircle size={12} />}
                          {action.status}
                        </span>
                        <span className="text-sm font-medium text-zinc-300">{action.type}</span>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-zinc-100">{action.protocol}</div>
                        <div className="mt-1 text-sm text-zinc-400">
                          Amount: <span className="font-mono text-zinc-200">{action.amount}</span>
                        </div>
                      </div>
                    </div>

                    {receipt ? (
                      <div className="min-w-[280px] space-y-2 rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-3 text-sm">
                        <div className="flex justify-between text-zinc-500">
                          <span>Network</span>
                          <span className="text-zinc-300">{receipt.network}</span>
                        </div>
                        <div className="flex justify-between text-zinc-500">
                          <span>Tx Hash</span>
                          <a
                            href={receipt.explorerUrl ?? "#"}
                            target={receipt.explorerUrl ? "_blank" : undefined}
                            rel={receipt.explorerUrl ? "noreferrer" : undefined}
                            className="flex items-center gap-1 font-mono text-indigo-400 hover:text-indigo-300"
                          >
                            {receipt.txHash.substring(0, 6)}...{receipt.txHash.substring(receipt.txHash.length - 4)}
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="flex justify-between text-zinc-500">
                          <span>Gas</span>
                          <span className="font-mono text-zinc-300">{receipt.gasUsed}</span>
                        </div>
                        <div className="flex justify-between text-zinc-500">
                          <span>Time</span>
                          <span className="text-zinc-400">{receipt.timestamp}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-w-[280px] items-center justify-center rounded-lg border border-zinc-800/30 bg-zinc-950/30 p-3 text-sm italic text-zinc-500">
                        {action.status === "pending"
                          ? "Awaiting approval..."
                          : action.status === "rejected"
                            ? "Action was rejected"
                            : "Processing..."}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <aside className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80">
            <SessionHistoryPanel
              evidence={evidence}
              isLoading={isHistoryLoading}
              onSelectSession={onSelectSession}
              selectedSessionId={selectedSessionId}
              sessions={sessions}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
