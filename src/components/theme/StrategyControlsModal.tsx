import { useEffect, useState } from "react";
import { Save, Settings2, X } from "lucide-react";
import { RunControls } from "../ui/RunControls";
import type { WorkflowRunOptions, WorkflowStrategyConfig } from "../../state/useClawfiWorkflow";

interface StrategyControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  runOptions: WorkflowRunOptions;
  strategyConfig: WorkflowStrategyConfig;
  onSave: (input: { runOptions: WorkflowRunOptions; strategyConfig: WorkflowStrategyConfig }) => void;
  wallet: {
    status: "unavailable" | "idle" | "connecting" | "connected" | "error";
    accountId: string | null;
    error: string | null;
    isAvailable: boolean;
  };
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
}

export default function StrategyControlsModal({
  isOpen,
  onClose,
  runOptions,
  strategyConfig,
  onSave,
  wallet,
  onConnectWallet,
  onDisconnectWallet,
}: StrategyControlsModalProps) {
  const [draftRunOptions, setDraftRunOptions] = useState(runOptions);
  const [draftStrategyConfig, setDraftStrategyConfig] = useState(strategyConfig);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setDraftRunOptions(runOptions);
    setDraftStrategyConfig(strategyConfig);
  }, [isOpen, runOptions, strategyConfig]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        aria-labelledby="strategy-controls-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
              <Settings2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100" id="strategy-controls-title">
                Strategy Controls
              </h2>
              <p className="text-xs text-zinc-400">Adjust execution mode, wallet path, and treasury policy before a run.</p>
            </div>
          </div>
          <button
            aria-label="Close strategy controls"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <RunControls
            onChange={(next) => setDraftRunOptions((current) => ({ ...current, ...next }))}
            onConnectWallet={onConnectWallet}
            onDisconnectWallet={onDisconnectWallet}
            onStrategyChange={(next) => setDraftStrategyConfig((current) => ({ ...current, ...next }))}
            runOptions={draftRunOptions}
            strategyConfig={draftStrategyConfig}
            wallet={wallet}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-800 bg-zinc-900/50 p-5">
          <button
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-emerald-600"
            onClick={() => {
              onSave({ runOptions: draftRunOptions, strategyConfig: draftStrategyConfig });
              onClose();
            }}
            type="button"
          >
            <Save size={16} />
            Save Policies
          </button>
        </div>
      </div>
    </div>
  );
}
