import { useEffect, useState } from "react";
import { AlertTriangle, Check, Save, ShieldAlert, X } from "lucide-react";
import type { RiskPolicy } from "../../ui/types";

interface RiskPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: RiskPolicy;
  onSave: (policy: RiskPolicy) => void;
}

export default function RiskPolicyModal({ isOpen, onClose, policy, onSave }: RiskPolicyModalProps) {
  const [maxAmount, setMaxAmount] = useState(policy.maxAmount);
  const [requireAudit, setRequireAudit] = useState(policy.requireAudit);
  const [minTvl, setMinTvl] = useState(policy.minTvl);
  const [maxRiskScore, setMaxRiskScore] = useState(policy.maxRiskScore);
  const [allowedProtocols, setAllowedProtocols] = useState(policy.allowedProtocols);
  const [newProtocol, setNewProtocol] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setMaxAmount(policy.maxAmount);
    setRequireAudit(policy.requireAudit);
    setMinTvl(policy.minTvl);
    setMaxRiskScore(policy.maxRiskScore);
    setAllowedProtocols(policy.allowedProtocols);
    setNewProtocol("");
  }, [policy]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      maxAmount,
      requireAudit,
      minTvl,
      maxRiskScore,
      allowedProtocols,
    });
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1500);
  };

  const addProtocol = () => {
    const trimmed = newProtocol.trim();
    if (trimmed && !allowedProtocols.includes(trimmed)) {
      setAllowedProtocols((current) => [...current, trimmed]);
      setNewProtocol("");
    }
  };

  const removeProtocol = (protocol: string) => {
    setAllowedProtocols((current) => current.filter((entry) => entry !== protocol));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500/20 text-purple-400 p-2 rounded-lg">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Risk Policy Settings</h2>
              <p className="text-xs text-zinc-400">Enforced by the Risk Policy Agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            type="button"
            aria-label="Close risk policy"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center justify-between" htmlFor="maxAmount">
              Max Transaction Amount (HBAR)
              <span className="text-xs text-zinc-500">Per execution</span>
            </label>
            <input
              id="maxAmount"
              type="number"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center justify-between" htmlFor="minTvl">
              Minimum Protocol TVL (USD)
              <span className="text-xs text-zinc-500">Liquidity requirement</span>
            </label>
            <select
              id="minTvl"
              value={minTvl}
              onChange={(event) => setMinTvl(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all appearance-none"
            >
              <option value="1000000">$1,000,000</option>
              <option value="5000000">$5,000,000</option>
              <option value="10000000">$10,000,000</option>
              <option value="50000000">$50,000,000</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center justify-between">
              Maximum Allowed Risk Score
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Low", "Moderate", "High"] as const).map((score) => (
                <button
                  key={score}
                  onClick={() => setMaxRiskScore(score)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                    maxRiskScore === score
                      ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/50"
                  }`}
                  type="button"
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className={requireAudit ? "text-emerald-400" : "text-zinc-500"} />
              <div>
                <p className="text-sm font-medium text-zinc-200">Require Smart Contract Audit</p>
                <p className="text-xs text-zinc-500">Reject un-audited protocols</p>
              </div>
            </div>
            <button
              onClick={() => setRequireAudit((current) => !current)}
              className={`w-11 h-6 rounded-full transition-colors relative ${requireAudit ? "bg-emerald-500" : "bg-zinc-700"}`}
              type="button"
              aria-label="Require smart contract audit"
            >
              <span
                className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${requireAudit ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-300">Whitelisted Protocols</label>
            <div className="flex flex-wrap gap-2">
              {allowedProtocols.map((protocol) => (
                <div
                  key={protocol}
                  className="flex items-center gap-1 bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg text-sm border border-zinc-700/50"
                >
                  {protocol}
                  <button
                    onClick={() => removeProtocol(protocol)}
                    className="text-zinc-500 hover:text-zinc-300 ml-1"
                    type="button"
                    aria-label={`Remove ${protocol}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProtocol}
                onChange={(event) => setNewProtocol(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addProtocol();
                  }
                }}
                placeholder="Add protocol..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={addProtocol}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                type="button"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaved}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isSaved
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                : "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20"
            }`}
            type="button"
          >
            {isSaved ? (
              <>
                <Check size={16} />
                Saved
              </>
            ) : (
              <>
                <Save size={16} />
                Save Policies
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
