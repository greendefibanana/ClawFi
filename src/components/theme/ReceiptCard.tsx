import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import type { ReceiptData } from "../../ui/types";

interface ReceiptCardProps {
  data: ReceiptData;
  onViewAuditLog?: () => void;
}

export default function ReceiptCard({ data, onViewAuditLog }: ReceiptCardProps) {
  const txLabel =
    data.txHash.length > 14 ? `${data.txHash.substring(0, 6)}...${data.txHash.substring(data.txHash.length - 4)}` : data.txHash;

  return (
    <div className="mt-4 max-w-md overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-900 shadow-lg shadow-emerald-900/10">
      <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
        <CheckCircle2 size={18} className="text-emerald-400" />
        <span className="text-sm font-medium text-emerald-400">On-Chain Receipt</span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between border-b border-zinc-800/50 py-2">
          <span className="text-sm text-zinc-500">Network</span>
          <span className="text-sm font-medium text-zinc-200">{data.network}</span>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800/50 py-2">
          <span className="text-sm text-zinc-500">Transaction Hash</span>
          {data.explorerUrl ? (
            <a
              href={data.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm font-mono text-indigo-400 transition-colors hover:text-indigo-300"
            >
              {txLabel}
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="text-sm font-mono text-indigo-400">{txLabel}</span>
          )}
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800/50 py-2">
          <span className="text-sm text-zinc-500">Gas Used</span>
          <span className="text-sm font-mono text-zinc-300">{data.gasUsed}</span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-zinc-500">Timestamp</span>
          <span className="text-sm text-zinc-400">{data.timestamp}</span>
        </div>

        {onViewAuditLog ? (
          <div className="pt-2">
            <button
              onClick={onViewAuditLog}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              type="button"
            >
              <FileText size={14} />
              View Full Audit Log
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
