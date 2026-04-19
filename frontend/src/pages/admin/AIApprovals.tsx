import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api/client";

interface AIApproval {
  id: string;
  ticket_id: string;
  execution_id: string;
  approval_type: string;
  step_description: string;
  ai_suggestion: Record<string, any>;
  confidence: number | null;
  ticket_priority: string | null;
  ticket_category: string | null;
  dry_run: boolean;
  auto_skipped: boolean;
  human_decision: string | null;
  human_notes: string | null;
  approver_user_id: string | null;
  approved_at: string | null;
  created_at: string;
  expires_at: string | null;
}

type FilterStatus = "all" | "pending" | "approved" | "rejected";

async function fetchApprovals(status: FilterStatus): Promise<AIApproval[]> {
  const params = status !== "all" ? `?status=${status}` : "";
  const res = await api.get(`/ai/approvals${params}`);
  return res.data;
}

async function decideApproval(id: string, decision: string, notes: string) {
  const res = await api.patch(`/ai/approvals/${id}/decision`, { decision, notes });
  return res.data;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="badge">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#eab308" : "#ef4444";
  return (
    <span style={{ color, fontWeight: 600, fontFamily: "monospace" }}>
      {pct}%
    </span>
  );
}

function SuggestionCard({ approval }: { approval: AIApproval }) {
  const sug = approval.ai_suggestion || {};
  const classification = sug.classification || {};
  const suggestion = sug.suggestion_response;

  return (
    <div style={{ marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
      {approval.approval_type === "escalation" && (
        <div>
          <strong style={{ fontSize: 13, color: "#374151" }}>Escalação AI</strong>
          <div style={{ fontSize: 13, marginTop: 6, color: "#4b5563" }}>
            {approval.step_description}
          </div>
        </div>
      )}
      {classification.category && (
        <div style={{ fontSize: 13, marginTop: 8 }}>
          <span style={{ color: "#6b7280" }}>Categoria: </span>
          <strong>{classification.category}</strong>
          {classification.intent && (
            <>
              {" · "}<span style={{ color: "#6b7280" }}>Intenção: </span>
              {classification.intent}
            </>
          )}
        </div>
      )}
      {sug.assign_to && (
        <div style={{ fontSize: 13, marginTop: 4, color: "#7c3aed" }}>
          🏢 Equipa: {sug.assign_to}
        </div>
      )}
      {sug.priority_override && (
        <div style={{ fontSize: 13, marginTop: 4, color: "#b45309" }}>
          ⚡ Prioridade override: {sug.priority_override}
        </div>
      )}
      {sug.escalation_reason && (
        <div style={{ fontSize: 13, marginTop: 6, fontStyle: "italic", color: "#9ca3af" }}>
          "{sug.escalation_reason}"
        </div>
      )}
      {suggestion && (
        <div style={{ marginTop: 10, padding: 10, background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
            💡 Resposta sugerida:
          </div>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{suggestion}</div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ approval, onDecide }: { approval: AIApproval; onDecide: (id: string, decision: string) => void }) {
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const decided = approval.human_decision !== null;

  const handleConfirm = (decision: string) => {
    onDecide(approval.id, decision);
    setConfirming(null);
  };

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        background: decided
          ? approval.human_decision === "approved"
            ? "#f0fdf4"
            : "#fef2f2"
          : "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>🎫 {approval.ticket_id.slice(0, 8)}</span>
            <span
              style={{
                background: "#dbeafe",
                color: "#1d4ed8",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {approval.approval_type}
            </span>
            {approval.ticket_priority && (
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                {approval.ticket_priority}
              </span>
            )}
            {approval.ticket_category && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>{approval.ticket_category}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
            {timeAgo(approval.created_at)} · Confiança: <ConfidenceBadge value={approval.confidence} />
            {approval.dry_run && (
              <span style={{ marginLeft: 8, fontSize: 11, color: "#f59e0b" }}>🔒 dry_run</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {decided ? (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: approval.human_decision === "approved" ? "#22c55e" : "#ef4444",
                color: "#fff",
              }}
            >
              {approval.human_decision === "approved" ? "✅ Aprovado" : "❌ Rejeitado"}
            </span>
          ) : (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: "#fef3c7",
                color: "#92400e",
              }}
            >
              ⏳ Pendente
            </span>
          )}
        </div>
      </div>

      <div
        style={{ fontSize: 13, color: "#374151", marginTop: 10 }}
      >
        {approval.step_description}
      </div>

      {expanded && <SuggestionCard approval={approval} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "none",
            border: "none",
            color: "#3b82f6",
            cursor: "pointer",
            fontSize: 13,
            padding: "4px 0",
          }}
        >
          {expanded ? "▲ Ocultar detalhes" : "▼ Ver detalhes AI"}
        </button>

        {!decided && (
          <div style={{ display: "flex", gap: 8 }}>
            {confirming === "approved" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    width: 180,
                  }}
                />
                <button
                  onClick={() => handleConfirm("approved")}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
                >
                  Confirmar ✓
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  style={{ background: "#e5e7eb", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ) : confirming === "rejected" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Motivo da rejeição"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    width: 180,
                  }}
                />
                <button
                  onClick={() => handleConfirm("rejected")}
                  style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
                >
                  Confirmar ✕
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  style={{ background: "#e5e7eb", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setConfirming("rejected")}
                  style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
                >
                  Rejeitar
                </button>
                <button
                  onClick={() => setConfirming("approved")}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
                >
                  Aprovar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIApprovals() {
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const queryClient = useQueryClient();

  const { data: approvals = [], isLoading, error } = useQuery({
    queryKey: ["ai-approvals", filter],
    queryFn: () => fetchApprovals(filter),
    refetchInterval: 30000,
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      decideApproval(id, decision, ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-approvals"] });
    },
  });

  const handleDecide = (id: string, decision: string) => {
    decideMutation.mutate({ id, decision });
  };

  const counts = {
    all: approvals.length,
    pending: approvals.filter((a) => a.human_decision === null).length,
    approved: approvals.filter((a) => a.human_decision === "approved").length,
    rejected: approvals.filter((a) => a.human_decision === "rejected").length,
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🤖 Aprovações AI</h1>
        <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 14 }}>
          Revisar e aprovar/decidir sobre as escalações automáticas geradas pelo agente AI.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["pending", "approved", "rejected", "all"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: filter === s ? "2px solid #3b82f6" : "1px solid #d1d5db",
              background: filter === s ? "#eff6ff" : "#fff",
              color: filter === s ? "#1d4ed8" : "#374151",
              cursor: "pointer",
              fontWeight: filter === s ? 600 : 400,
              fontSize: 13,
            }}
          >
            {s === "pending" ? "⏳ Pendentes" : s === "approved" ? "✅ Aprovadas" : s === "rejected" ? "❌ Rejeitadas" : "📋 Todas"}
          </button>
        ))}
      </div>

      {isLoading && <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>A carregar…</div>}
      {error && (
        <div style={{ color: "#ef4444", background: "#fef2f2", padding: 12, borderRadius: 8, fontSize: 14 }}>
          Erro ao carregar aprovações
        </div>
      )}
      {!isLoading && approvals.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 15 }}>
          Nenhuma aprovação {filter !== "all" ? filter : ""} encontrada.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {approvals.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} onDecide={handleDecide} />
        ))}
      </div>
    </div>
  );
}
