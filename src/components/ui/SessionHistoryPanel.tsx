import type { SessionEvidence, SessionListEntry } from "../../state/useClawfiWorkflow";

type SessionHistoryPanelProps = {
  sessions: SessionListEntry[];
  selectedSessionId: string | null;
  evidence: SessionEvidence | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SessionHistoryPanel({
  sessions,
  selectedSessionId,
  evidence,
  isLoading,
  onSelectSession,
}: SessionHistoryPanelProps) {
  return (
    <div className="audit-scroll">
      <p className="audit-section-label">Session history</p>
      <div className="cf-history-list">
        {sessions.length === 0 && <p className="muted">No saved sessions yet. Run a workflow to generate evidence.</p>}
        {sessions.map((session) => (
          <button
            key={session.sessionId}
            className={`cf-history-item ${selectedSessionId === session.sessionId ? "active" : ""}`}
            onClick={() => onSelectSession(session.sessionId)}
            type="button"
          >
            <strong>{session.sessionId}</strong>
            <span>{session.goal}</span>
            <span>{session.mode}</span>
            <span>{session.receiptCount} receipts</span>
            <span>{session.payoutCount} payouts</span>
            <span>{formatTimestamp(session.createdAt)}</span>
          </button>
        ))}
      </div>

      <p className="audit-section-label" style={{ marginTop: 16 }}>Evidence</p>
      {isLoading && <p className="muted">Loading history...</p>}
      {!isLoading && !evidence && <p className="muted">No evidence loaded for the selected session.</p>}
      {evidence && (
        <div className="cf-evidence-card">
          <div className="cf-evidence-grid">
            <div className="cf-evidence-stat">
              <span>Receipts</span>
              <strong>{evidence.summary.receiptCount}</strong>
            </div>
            <div className="cf-evidence-stat">
              <span>Payouts</span>
              <strong>{evidence.summary.payoutCount}</strong>
            </div>
            <div className="cf-evidence-stat">
              <span>Tasks</span>
              <strong>{evidence.summary.taskCount}</strong>
            </div>
            <div className="cf-evidence-stat">
              <span>Approved actions</span>
              <strong>{evidence.summary.approvedActionCount}</strong>
            </div>
          </div>
          <p className="muted">
            {evidence.mode} on {evidence.network} for treasury {evidence.treasuryAccountId}
          </p>

          <p className="audit-section-label" style={{ marginTop: 12 }}>Schedules</p>
          {evidence.scheduledExecutions.map((scheduled) => (
            <div className="cf-evidence-row" key={scheduled.id}>
              <strong>{scheduled.actionTitle}</strong>
              <span>{scheduled.status}</span>
              <span>{scheduled.scheduleId ?? scheduled.id}</span>
            </div>
          ))}

          <p className="audit-section-label" style={{ marginTop: 12 }}>Signoff</p>
          {evidence.signoffChecklist.map((item) => (
            <div className="cf-evidence-row" key={item.item}>
              <strong>{item.item}</strong>
              <span>{item.status}</span>
              <span>{item.notes}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
