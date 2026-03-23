import { useEffect, useMemo, useRef, useState } from "react";
import type { HederaMode } from "./core/models/schemas";
import AuditLog from "./components/theme/AuditLog";
import ChatArea from "./components/theme/ChatArea";
import RiskPolicyModal from "./components/theme/RiskPolicyModal";
import Sidebar from "./components/theme/Sidebar";
import StrategyControlsModal from "./components/theme/StrategyControlsModal";
import { useClawfiWorkflow } from "./state/useClawfiWorkflow";
import { useHederaWallet } from "./state/useHederaWallet";
import type { WorkflowStrategyConfig } from "./state/useClawfiWorkflow";
import {
  applyRiskPolicy,
  buildMessages,
  buildRiskPolicy,
  buildSessionSummaries,
  buildTreasurySummary,
  buildWorkforce,
  decorateGoalWithPolicy,
} from "./ui/adapters/workflowThemeAdapter";
import type { Message, RiskPolicy, SidebarTemplate } from "./ui/types";
import { executeWalletApproval } from "./wallet/walletExecution";

const STRATEGY_TEMPLATES: SidebarTemplate[] = [
  {
    title: "Automated HBAR Staking",
    prompt: "Deploy treasury into the strongest liquid HBAR strategy that stays inside current policy and requires manual approval.",
  },
  {
    title: "Stablecoin Yield Farming",
    prompt: "Allocate stablecoin capital to the safest Hedera yield venue above the target APY without breaking policy limits.",
  },
  {
    title: "Treasury Rebalancing",
    prompt: "Analyze the current treasury and propose a rebalancing plan that preserves liquidity and fits the configured risk settings.",
  },
];

export default function App() {
  const {
    data,
    evidence,
    sessions,
    selectedSessionId,
    runOptions,
    strategyConfig,
    error,
    isApproving,
    isRejecting,
    isLoading,
    isHistoryLoading,
    rerun,
    approve,
    completeWalletApproval,
    reject,
    selectSession,
    setRunOptions,
    setStrategyConfig,
    userAgents,
  } = useClawfiWorkflow();
  const wallet = useHederaWallet();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<"chat" | "audit">("chat");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStrategyControlsOpen, setIsStrategyControlsOpen] = useState(false);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [riskPolicy, setRiskPolicy] = useState<RiskPolicy>(() => buildRiskPolicy(strategyConfig, data));
  const [chatSessions, setChatSessions] = useState<Array<{ sessionId: string; messages: Message[] }>>([]);
  const dataRef = useRef(data);
  const runOptionsRef = useRef(runOptions);

  const splitTotal = strategyConfig.reservePercent + strategyConfig.tradingPercent + strategyConfig.defiPercent;
  const loadingNoticeDelayMs =
    (data?.hederaStatus.mode ?? runOptions.hederaMode) === "real_scaffolded" && runOptions.liveExecution ? 90_000 : 20_000;

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setLoadingTimedOut(true), loadingNoticeDelayMs);
    return () => window.clearTimeout(timeoutId);
  }, [isLoading, loadingNoticeDelayMs]);

  useEffect(() => {
    setClientNotice(null);
  }, [data?.sessionId]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    runOptionsRef.current = runOptions;
  }, [runOptions]);

  useEffect(() => {
    setRiskPolicy(buildRiskPolicy(strategyConfig, data));
  }, [data, strategyConfig]);

  useEffect(() => {
    const walletAccountId = wallet.accountId ?? undefined;
    if (runOptions.walletAccountId === walletAccountId) {
      return;
    }
    setRunOptions({ walletAccountId });
  }, [runOptions.walletAccountId, setRunOptions, wallet.accountId]);

  const activeNotice = useMemo(() => {
    if (error) {
      return error;
    }
    if (clientNotice) {
      return clientNotice;
    }
    if (loadingTimedOut) {
      return "This run is taking longer than expected. You can submit the goal again to retry.";
    }
    if ((data?.hederaStatus.mode ?? runOptions.hederaMode) === "wallet_connected" && !wallet.accountId) {
      return wallet.isAvailable
        ? "Connect a Hedera wallet before starting or approving a wallet-connected session."
        : "WalletConnect is not configured in this build. Use simulated mode or real scaffolded mode instead.";
    }
    if (splitTotal !== 100) {
      return `Reserve, trading, and DeFi currently sum to ${splitTotal}%. Runs are blocked until the split totals 100%.`;
    }
    if (data?.actionPlan.approvalState === "pending") {
      return (data?.hederaStatus.mode ?? runOptions.hederaMode) === "wallet_connected"
        ? "Session is awaiting browser wallet approval."
        : "Session is awaiting operator sign-off.";
    }
    return null;
  }, [
    clientNotice,
    data?.actionPlan.approvalState,
    data?.hederaStatus.mode,
    error,
    loadingTimedOut,
    runOptions.hederaMode,
    splitTotal,
    wallet.accountId,
    wallet.isAvailable,
  ]);

  const messages = useMemo(() => buildMessages(data, activeNotice), [activeNotice, data]);
  const pendingApproval = useMemo(() => {
    if (!data || data.actionPlan.approvalState !== "pending") {
      return null;
    }

    const actionCount = data.scheduledExecutions.filter(
      (entry) => entry.status === "awaiting_approval" || entry.status === "approved",
    ).length;

    if (actionCount === 0) {
      return null;
    }

    return {
      actionCount,
      mode: data.hederaStatus.mode,
    };
  }, [data]);
  const chatMessages = useMemo(() => {
    const sessionsWithCurrent = upsertChatSession(chatSessions, data?.sessionId ?? null, messages);
    const currentSessionId = data?.sessionId ?? null;

    return [
      ...sessionsWithCurrent.flatMap((entry) =>
        entry.messages.map((message) =>
          entry.sessionId === currentSessionId
            ? message
            : {
                ...message,
                actionPreview: undefined,
                receipt: undefined,
              },
        ),
      ),
      ...(data?.sessionId ? [] : messages),
    ].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  }, [chatSessions, data?.sessionId, messages]);
  const workforce = useMemo(() => buildWorkforce(data), [data]);
  const treasury = useMemo(
    () =>
      buildTreasurySummary(data, {
        accountId: wallet.accountId,
        isAvailable: wallet.isAvailable,
      }),
    [data, wallet.accountId, wallet.isAvailable],
  );
  const sessionSummaries = useMemo(
    () => buildSessionSummaries(sessions, selectedSessionId),
    [selectedSessionId, sessions],
  );

  const triggerRun = (input?: {
    goal?: string;
    runOptions?: Partial<typeof runOptions>;
    strategyConfig?: Partial<WorkflowStrategyConfig>;
  }) => {
    const walletAccountId =
      input?.runOptions?.walletAccountId ?? runOptions.walletAccountId ?? wallet.accountId ?? undefined;
    const targetMode = input?.runOptions?.hederaMode ?? resolveRunMode(runOptions.hederaMode, walletAccountId);
    const nextStrategyConfig = {
      ...strategyConfig,
      ...input?.strategyConfig,
      approvalRequired:
        targetMode === "wallet_connected"
          ? true
          : (input?.strategyConfig?.approvalRequired ?? strategyConfig.approvalRequired),
    } satisfies WorkflowStrategyConfig;
    const nextSplitTotal =
      nextStrategyConfig.reservePercent + nextStrategyConfig.tradingPercent + nextStrategyConfig.defiPercent;

    if (targetMode === "wallet_connected" && !walletAccountId) {
      setClientNotice("Connect a Hedera wallet before starting a wallet-connected run.");
      return;
    }

    if (nextSplitTotal !== 100) {
      setClientNotice(
        `Reserve, trading, and DeFi are currently set to ${nextSplitTotal}%. Adjust the policy split before running.`,
      );
      return;
    }

    setClientNotice(null);
    const baselinePolicy = buildRiskPolicy(strategyConfig, data);
    rerun({
      goal:
        input?.goal && needsGoalDecoration(riskPolicy, baselinePolicy)
          ? decorateGoalWithPolicy(input.goal, riskPolicy)
          : input?.goal,
      userAgents,
      runOptions: {
        hederaMode: targetMode,
        liveExecution:
          input?.runOptions?.liveExecution ?? runOptions.liveExecution ?? targetMode !== "simulated",
        autoApprove: input?.runOptions?.autoApprove ?? runOptions.autoApprove,
        walletAccountId,
      },
      strategyConfig: nextStrategyConfig,
    });
  };

  const handleApprove = async () => {
    try {
      setClientNotice(null);
      const session = dataRef.current;
      const currentMode = session?.hederaStatus.mode ?? runOptionsRef.current.hederaMode;

      if (currentMode !== "wallet_connected") {
        approve();
        return;
      }

      if (!session) {
        return;
      }

      const signer = wallet.getSigner();
      if (!signer || !wallet.accountId) {
        throw new Error("Connect a browser wallet before approving a wallet-connected session.");
      }

      const walletResults = await executeWalletApproval({
        session,
        signer,
        walletAccountId: wallet.accountId,
      });
      await completeWalletApproval(walletResults);
    } catch (approvalError) {
      setClientNotice(approvalError instanceof Error ? approvalError.message : "Wallet approval failed.");
    }
  };

  const handleSavePolicy = (nextPolicy: RiskPolicy) => {
    const parsed = applyRiskPolicy(nextPolicy, { data, strategyConfig });
    setRiskPolicy(nextPolicy);
    setStrategyConfig(parsed.strategyConfig);
    setClientNotice(null);
  };

  useEffect(() => {
    if (!data?.sessionId) {
      return;
    }

    setChatSessions((current) => upsertChatSession(current, data.sessionId, messages));
  }, [data?.sessionId, messages]);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        templates={STRATEGY_TEMPLATES}
        onSelectTemplate={(prompt) => {
          setCurrentView("chat");
          setIsSidebarOpen(false);
          triggerRun({ goal: prompt });
        }}
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenRiskPolicy={() => setIsSettingsOpen(true)}
        workforce={workforce}
        treasury={treasury}
        sessions={sessionSummaries}
        onSelectSession={(sessionId) => {
          setCurrentView("audit");
          setIsSidebarOpen(false);
          selectSession(sessionId);
        }}
      />

      {currentView === "chat" ? (
        <ChatArea
          messages={chatMessages}
          onSendMessage={(content) => triggerRun({ goal: content })}
          onApproveAction={() => {
            void handleApprove();
          }}
          onRejectAction={() => reject()}
          pendingApproval={pendingApproval}
          isTyping={isLoading || isApproving || isRejecting}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenStrategyControls={() => setIsStrategyControlsOpen(true)}
          onViewAuditLog={() => setCurrentView("audit")}
        />
      ) : (
        <AuditLog
          evidence={evidence}
          isHistoryLoading={isHistoryLoading}
          messages={messages}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onSelectSession={(sessionId) => selectSession(sessionId)}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
        />
      )}

      <StrategyControlsModal
        isOpen={isStrategyControlsOpen}
        onClose={() => setIsStrategyControlsOpen(false)}
        onConnectWallet={() => {
          void wallet.connect();
        }}
        onDisconnectWallet={() => {
          void wallet.disconnect();
        }}
        onSave={({ runOptions: nextRunOptions, strategyConfig: nextStrategyConfig }) => {
          setRunOptions(nextRunOptions);
          setStrategyConfig(nextStrategyConfig);
          setRiskPolicy(buildRiskPolicy(nextStrategyConfig, dataRef.current));
          setClientNotice(null);
        }}
        runOptions={runOptions}
        strategyConfig={strategyConfig}
        wallet={{
          accountId: wallet.accountId,
          error: wallet.error,
          isAvailable: wallet.isAvailable,
          status: wallet.status,
        }}
      />

      <RiskPolicyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        policy={riskPolicy}
        onSave={handleSavePolicy}
      />
    </div>
  );
}

function upsertChatSession(
  sessions: Array<{ sessionId: string; messages: Message[] }>,
  sessionId: string | null,
  messages: Message[],
) {
  if (!sessionId) {
    return sessions;
  }

  const nextEntry = { sessionId, messages };
  const index = sessions.findIndex((entry) => entry.sessionId === sessionId);
  if (index === -1) {
    return [...sessions, nextEntry];
  }

  return [...sessions.slice(0, index), nextEntry, ...sessions.slice(index + 1)];
}

function resolveRunMode(currentMode: HederaMode, walletAccountId?: string): HederaMode {
  if (walletAccountId) {
    return "wallet_connected";
  }
  if (currentMode === "real_scaffolded") {
    return "real_scaffolded";
  }
  return "simulated";
}

function needsGoalDecoration(policy: RiskPolicy, baseline: RiskPolicy) {
  if (policy.requireAudit !== baseline.requireAudit) {
    return true;
  }
  if (policy.allowedProtocols.length !== baseline.allowedProtocols.length) {
    return true;
  }
  return policy.allowedProtocols.some((protocol, index) => protocol !== baseline.allowedProtocols[index]);
}
