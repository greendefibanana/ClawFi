import type { WorkflowRunOptions, WorkflowStrategyConfig } from "../../state/useClawfiWorkflow";

type RunControlsProps = {
  runOptions: WorkflowRunOptions;
  strategyConfig: WorkflowStrategyConfig;
  disabled?: boolean;
  onChange: (next: Partial<WorkflowRunOptions>) => void;
  onStrategyChange: (next: Partial<WorkflowStrategyConfig>) => void;
  wallet: {
    status: "unavailable" | "idle" | "connecting" | "connected" | "error";
    accountId: string | null;
    error: string | null;
    isAvailable: boolean;
  };
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
};

function getModeDescription(mode: WorkflowRunOptions["hederaMode"]) {
  if (mode === "simulated") {
    return "Safe demo path using the local API, simulated treasury state, and approval-driven settlement.";
  }
  if (mode === "wallet_connected") {
    return "Browser wallet signs the approval and settlement transactions. Best for a hands-on operator flow.";
  }
  return "Backend server handles Hedera credentials, mirror reads, and any live connector execution.";
}

function getModeReadiness(runOptions: WorkflowRunOptions, wallet: RunControlsProps["wallet"]) {
  if (runOptions.hederaMode === "wallet_connected") {
    if (!wallet.isAvailable) {
      return "WalletConnect is not configured in this build.";
    }
    if (!wallet.accountId) {
      return "Connect a Hedera wallet before running this mode.";
    }
    return `Ready to run with wallet ${wallet.accountId}.`;
  }

  if (runOptions.hederaMode === "real_scaffolded") {
    return "Requires backend Hedera credentials and any live venue configuration on the API server.";
  }

  return runOptions.autoApprove
    ? "Runs through the demo path and settles automatically after planning."
    : "Runs through the demo path and waits for an operator approval step.";
}

export function RunControls({
  runOptions,
  strategyConfig,
  disabled = false,
  onChange,
  onStrategyChange,
  wallet,
  onConnectWallet,
  onDisconnectWallet,
}: RunControlsProps) {
  const splitTotal = strategyConfig.reservePercent + strategyConfig.tradingPercent + strategyConfig.defiPercent;
  const approvalRequired =
    runOptions.hederaMode === "wallet_connected" ? true : strategyConfig.approvalRequired;

  const updateNumberField =
    (field: keyof WorkflowStrategyConfig) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      onStrategyChange({
        [field]: Number.isFinite(value) ? value : 0,
      } as Partial<WorkflowStrategyConfig>);
    };

  return (
    <section className="cf-run-controls">
      <div className="cf-run-control">
        <label htmlFor="hedera-mode">Hedera mode</label>
        <select
          className="cf-mode-select"
          id="hedera-mode"
          value={runOptions.hederaMode}
          onChange={(event) => {
            const hederaMode = event.target.value as WorkflowRunOptions["hederaMode"];
            onChange({
              hederaMode,
              autoApprove: hederaMode === "wallet_connected" ? false : runOptions.autoApprove,
            });
          }}
          disabled={disabled}
        >
          <option value="simulated">Simulated</option>
          <option value="real_scaffolded">Real scaffolded</option>
          <option value="wallet_connected" disabled={!wallet.isAvailable}>
            Wallet connected
          </option>
        </select>
      </div>
      <label className="cf-run-toggle">
        <input
          type="checkbox"
          checked={runOptions.liveExecution}
          onChange={(event) => onChange({ liveExecution: event.target.checked })}
          disabled={disabled}
        />
        <span>Enable live execution branch</span>
      </label>
      {runOptions.hederaMode !== "wallet_connected" ? (
        <label className="cf-run-toggle">
          <input
            type="checkbox"
            checked={runOptions.autoApprove}
            onChange={(event) => onChange({ autoApprove: event.target.checked })}
            disabled={disabled}
          />
          <span>Auto-approve settlement</span>
        </label>
      ) : (
        <p className="cf-run-note">Wallet-connected runs always require an explicit wallet approval step.</p>
      )}
      {runOptions.hederaMode === "wallet_connected" && (
        <div className="cf-run-control cf-wallet-control">
          <label htmlFor="connect-wallet-button">Wallet</label>
          {wallet.accountId ? (
            <div className="cf-wallet-status-card">
              <div className="cf-wallet-account">{wallet.accountId}</div>
              <button id="connect-wallet-button" type="button" onClick={onDisconnectWallet} disabled={disabled}>
                Disconnect
              </button>
            </div>
          ) : (
            <div className="cf-wallet-status-card">
              <button
                id="connect-wallet-button"
                type="button"
                onClick={onConnectWallet}
                disabled={disabled || !wallet.isAvailable || wallet.status === "connecting"}
              >
                {wallet.status === "connecting" ? "Connecting..." : "Connect Hedera Wallet"}
              </button>
              <small className="cf-wallet-hint">
                This path currently targets Hedera WalletConnect wallets such as HashPack or Kabila. MetaMask is not
                wired to the native Hedera signing flow yet.
              </small>
            </div>
          )}
          {wallet.error && <small className="cf-wallet-error">{wallet.error}</small>}
        </div>
      )}
      <div className="cf-run-summary">
        <strong>{getModeDescription(runOptions.hederaMode)}</strong>
        <p>{getModeReadiness(runOptions, wallet)}</p>
      </div>

      <section className="cf-run-policy" aria-label="Execution policy">
        <div className="cf-run-policy-head">
          <div>
            <strong>Policy</strong>
            <p>Adjust the mandate before each run. The prompt shapes proposals, but these controls still gate risk.</p>
          </div>
          <span className={`cf-policy-total ${splitTotal === 100 ? "is-valid" : "is-warning"}`}>
            Split total {splitTotal}%
          </span>
        </div>

        <div className="cf-run-policy-grid">
          <div className="cf-policy-field">
            <span>Risk level</span>
            <div aria-label="Risk level" className="cf-risk-button-group" role="group">
              {(["low", "medium", "high"] as const).map((value) => (
                <button
                  aria-pressed={strategyConfig.riskLevel === value}
                  className={`cf-risk-button ${strategyConfig.riskLevel === value ? "active" : ""}`}
                  disabled={disabled}
                  key={value}
                  onClick={() => onStrategyChange({ riskLevel: value })}
                  type="button"
                >
                  {value[0].toUpperCase()}
                  {value.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className="cf-policy-field" htmlFor="policy-target-yield">
            <span>Target APY %</span>
            <input
              id="policy-target-yield"
              type="number"
              min="0"
              step="0.5"
              value={strategyConfig.targetYieldApy}
              onChange={updateNumberField("targetYieldApy")}
              disabled={disabled}
            />
          </label>

          <label className="cf-policy-field" htmlFor="policy-max-slippage">
            <span>Max slippage bps</span>
            <input
              id="policy-max-slippage"
              type="number"
              min="0"
              step="1"
              value={strategyConfig.maxSlippageBps}
              onChange={updateNumberField("maxSlippageBps")}
              disabled={disabled}
            />
          </label>

          <label className="cf-policy-field" htmlFor="policy-min-liquidity">
            <span>Min liquidity USD</span>
            <input
              id="policy-min-liquidity"
              type="number"
              min="0"
              step="10000"
              value={strategyConfig.minLiquidityThresholdUsd}
              onChange={updateNumberField("minLiquidityThresholdUsd")}
              disabled={disabled}
            />
          </label>

          <label className="cf-policy-field" htmlFor="policy-max-token">
            <span>Max token exposure %</span>
            <input
              id="policy-max-token"
              type="number"
              min="0"
              max="100"
              step="1"
              value={strategyConfig.maxTokenExposurePercent}
              onChange={updateNumberField("maxTokenExposurePercent")}
              disabled={disabled}
            />
          </label>

          <label className="cf-policy-field" htmlFor="policy-max-protocol">
            <span>Max protocol exposure %</span>
            <input
              id="policy-max-protocol"
              type="number"
              min="0"
              max="100"
              step="1"
              value={strategyConfig.maxProtocolExposurePercent}
              onChange={updateNumberField("maxProtocolExposurePercent")}
              disabled={disabled}
            />
          </label>
        </div>

        <div className="cf-policy-split-grid">
          <label className="cf-policy-field" htmlFor="policy-reserve">
            <span>Reserve %</span>
            <input
              id="policy-reserve"
              type="number"
              min="0"
              max="100"
              step="1"
              value={strategyConfig.reservePercent}
              onChange={updateNumberField("reservePercent")}
              disabled={disabled}
            />
          </label>

          <label className="cf-policy-field" htmlFor="policy-trading">
            <span>Trading %</span>
            <input
              id="policy-trading"
              type="number"
              min="0"
              max="100"
              step="1"
              value={strategyConfig.tradingPercent}
              onChange={updateNumberField("tradingPercent")}
              disabled={disabled}
            />
          </label>

          <label className="cf-policy-field" htmlFor="policy-defi">
            <span>DeFi %</span>
            <input
              id="policy-defi"
              type="number"
              min="0"
              max="100"
              step="1"
              value={strategyConfig.defiPercent}
              onChange={updateNumberField("defiPercent")}
              disabled={disabled}
            />
          </label>
        </div>

        <label className="cf-run-toggle cf-policy-toggle">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(event) => onStrategyChange({ approvalRequired: event.target.checked })}
            disabled={disabled || runOptions.hederaMode === "wallet_connected"}
          />
          <span>Require operator approval before settlement</span>
        </label>
      </section>
    </section>
  );
}
