import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, CheckCircle2, Menu, Paperclip, Settings2 } from "lucide-react";
import type { Message } from "../../ui/types";
import MessageItem from "./MessageItem";

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onApproveAction: (id: string) => void;
  onRejectAction: (id: string) => void;
  pendingApproval?: {
    actionCount: number;
    mode: "simulated" | "real_scaffolded" | "wallet_connected";
  } | null;
  isTyping?: boolean;
  onOpenSidebar: () => void;
  onOpenStrategyControls: () => void;
  onViewAuditLog: () => void;
}

export default function ChatArea({
  messages,
  onSendMessage,
  onApproveAction,
  onRejectAction,
  pendingApproval,
  isTyping,
  onOpenSidebar,
  onOpenStrategyControls,
  onViewAuditLog,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = messagesEndRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <div className="relative flex h-full flex-1 flex-col bg-zinc-950">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-zinc-800/50 bg-zinc-950/80 px-4 backdrop-blur-md">
        <button
          onClick={onOpenSidebar}
          className="-ml-2 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
          type="button"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-200">ClawFi Orchestrator</span>
          <span className="hidden rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 sm:inline-block">v1.0 Hedera</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={onOpenStrategyControls}
            type="button"
          >
            <Settings2 size={16} />
            <span>Strategy Controls</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-32">
        {pendingApproval ? (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-amber-500/20 bg-zinc-900/80 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 text-amber-400" size={18} />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-zinc-100">Approval required before execution</div>
                  <div className="text-sm text-zinc-400">
                    {pendingApproval.actionCount} action{pendingApproval.actionCount === 1 ? "" : "s"} queued in{" "}
                    {pendingApproval.mode === "wallet_connected" ? "wallet-connected" : pendingApproval.mode} mode.
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => onApproveAction("pending-session")}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-600"
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  Approve & Execute
                </button>
                <button
                  onClick={() => onRejectAction("pending-session")}
                  className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                  type="button"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 text-center text-zinc-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
              <span className="text-2xl">CF</span>
            </div>
            <p className="text-lg font-medium text-zinc-400">How can the ClawFi workforce assist you today?</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onApproveAction={onApproveAction}
                onRejectAction={onRejectAction}
                onViewAuditLog={onViewAuditLog}
              />
            ))}
            {isTyping ? (
              <div className="w-full px-4 py-6 md:px-6">
                <div className="mx-auto flex max-w-3xl gap-4 md:gap-5">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-sm">
                    <span className="animate-pulse">...</span>
                  </div>
                  <div className="flex items-center">
                    <span className="animate-pulse text-sm text-zinc-500">Orchestrator is thinking...</span>
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent px-3 pb-4 pt-10 md:px-4 md:pb-6">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={handleSubmit}
            className="relative rounded-2xl border border-zinc-700/50 bg-zinc-800/50 shadow-lg transition-colors focus-within:border-zinc-600 focus-within:bg-zinc-800"
          >
            <div className="flex items-end gap-1 p-1.5 md:gap-2 md:p-2">
              <button
                type="button"
                className="hidden flex-shrink-0 rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200 sm:block"
                aria-label="Attach context"
              >
                <Paperclip size={20} />
              </button>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Instruct the financial workforce..."
                className="min-h-[44px] max-h-32 w-full resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 md:max-h-48 md:px-3 md:py-3"
                rows={1}
                aria-label="Strategy goal"
              />

              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="mb-0.5 mr-0.5 flex-shrink-0 rounded-xl bg-emerald-500 p-2 text-zinc-950 transition-colors hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500"
                aria-label="Run strategy"
              >
                <ArrowUp size={20} strokeWidth={2.5} />
              </button>
            </div>
          </form>
          <div className="mt-2 px-2 text-center text-[10px] text-zinc-500 md:mt-3 md:text-xs">
            ClawFi agents simulate execution before requesting approval. Always verify on-chain receipts.
          </div>
        </div>
      </div>
    </div>
  );
}
