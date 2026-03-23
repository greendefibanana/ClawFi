import { CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import type { ActionPreviewData } from "../../ui/types";

interface ActionCardProps {
  data: ActionPreviewData;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export default function ActionCard({ data, onApprove, onReject }: ActionCardProps) {
  const isPending = data.status === "pending";

  return (
    <div className="mt-4 max-w-md overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between border-b border-zinc-700/50 bg-zinc-800/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-400" />
          <span className="text-sm font-medium text-zinc-200">Simulated Preview</span>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wider ${
            data.status === "pending"
              ? "bg-amber-500/10 text-amber-400"
              : data.status === "approved" || data.status === "executed"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
          }`}
        >
          {data.status}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h4 className="text-lg font-semibold text-zinc-100">{data.type}</h4>
          <p className="text-sm text-zinc-400">{data.protocol}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-3">
            <div className="mb-1 text-xs text-zinc-500">Amount</div>
            <div className="font-mono text-sm text-zinc-200">{data.amount}</div>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-3">
            <div className="mb-1 text-xs text-zinc-500">Expected Yield</div>
            <div className="font-mono text-sm text-emerald-400">{data.expectedYield || "N/A"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-zinc-800/30 bg-zinc-950/30 p-2.5 text-sm">
          <AlertTriangle
            size={14}
            className={`flex-shrink-0 ${
              data.riskScore === "Low"
                ? "text-emerald-400"
                : data.riskScore === "Medium"
                  ? "text-amber-400"
                  : "text-red-400"
            }`}
          />
          <span className="text-zinc-400">Risk Assessment:</span>
          <span
            className={`font-medium ${
              data.riskScore === "Low"
                ? "text-emerald-400"
                : data.riskScore === "Medium"
                  ? "text-amber-400"
                  : "text-red-400"
            }`}
          >
            {data.riskScore}
          </span>
        </div>
        {isPending ? (
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              onClick={() => onApprove(data.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 font-semibold text-zinc-950 transition-colors hover:bg-emerald-600"
              type="button"
            >
              <CheckCircle size={16} />
              Approve & Execute
            </button>
            <button
              onClick={() => onReject(data.id)}
              className="flex-1 rounded-lg bg-zinc-800 px-4 py-2.5 font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
              type="button"
            >
              Reject
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
