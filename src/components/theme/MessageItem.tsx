import { motion } from "motion/react";
import { Activity, Bot, Database, Shield, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../../ui/types";
import ActionCard from "./ActionCard";
import ReceiptCard from "./ReceiptCard";

interface MessageItemProps {
  message: Message;
  onApproveAction?: (id: string) => void;
  onRejectAction?: (id: string) => void;
  onViewAuditLog?: () => void;
}

export default function MessageItem({
  message,
  onApproveAction,
  onRejectAction,
  onViewAuditLog,
}: MessageItemProps) {
  const isUser = message.role === "user";

  const config = getAgentConfig(message.role);

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full justify-end px-3 py-4 md:px-4 md:py-6"
      >
        <div className="flex w-full max-w-3xl justify-end gap-3 md:gap-4">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-800 px-4 py-3 text-zinc-100 shadow-sm md:max-w-[80%] md:px-5 md:py-3.5">
            <div className="whitespace-pre-wrap text-[14px] leading-relaxed md:text-[15px]">{message.content}</div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full px-3 py-4 transition-colors hover:bg-zinc-900/30 md:px-4 md:py-6"
    >
      <div className="mx-auto flex max-w-3xl gap-3 md:gap-5">
        <div className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${config.bg}`}>
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-zinc-300 mb-1 flex items-center gap-2">
            {config.name}
            <span className="text-[10px] md:text-xs font-normal text-zinc-600">
              {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="text-[14px] md:text-[15px] leading-relaxed text-zinc-300 prose prose-invert prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          
          <div className="space-y-3">
            {message.actionPreview && onApproveAction && onRejectAction ? (
              <ActionCard data={message.actionPreview} onApprove={onApproveAction} onReject={onRejectAction} />
            ) : null}

            {message.receipt ? <ReceiptCard data={message.receipt} onViewAuditLog={onViewAuditLog} /> : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getAgentConfig(role: Message["role"]) {
  switch (role) {
    case "user":
      return { icon: <User size={18} />, bg: "bg-zinc-700", name: "You" };
    case "researcher":
      return { icon: <Database size={18} />, bg: "bg-blue-500", name: "Research Agent" };
    case "risk":
      return { icon: <Shield size={18} />, bg: "bg-purple-500", name: "Risk Policy Agent" };
    case "executor":
      return { icon: <Activity size={18} />, bg: "bg-amber-500", name: "Execution Agent" };
    case "system":
      return { icon: <Bot size={18} />, bg: "bg-zinc-500", name: "System" };
    case "orchestrator":
    default:
      return { icon: <Bot size={18} />, bg: "bg-indigo-500", name: "ClawFi Orchestrator" };
  }
}
