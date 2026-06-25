"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Panel from "@/components/Panel";
import Button from "@/components/Button";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getSession } from "@/lib/auth";
import {
  listDeletionRequests,
  createDeletionRequest,
  decideDeletionRequest,
  listUsers,
  listSources,
  ApiError,
  DeletionRequestRead,
  UserRead,
  SourceRead,
} from "@/lib/api-client";

const APPROVER_ROLES = ["chief_auditor", "compliance_officer", "security_officer", "executive_authority"];
const REQUIRED_LABELS: Record<string, string> = {
  chief_auditor: "Chief Auditor",
  compliance_officer: "Compliance Officer",
  security_officer: "Security Officer",
  executive_authority: "Executive Authority",
};

const INPUT_CLASS =
  "border border-border bg-surface text-text rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

export default function DeletionRequestsPage() {
  const ready = useRequireAuth();
  const session = getSession();
  const [requests, setRequests] = useState<DeletionRequestRead[]>([]);
  const [users, setUsers] = useState<UserRead[]>([]);
  const [sources, setSources] = useState<SourceRead[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<"user" | "ingestion_source">("ingestion_source");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    listDeletionRequests()
      .then(setRequests)
      .catch((e: ApiError) => setError(e.message || "Failed to load requests"));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
    if (session?.role === "admin") {
      listUsers().then(setUsers).catch(() => {});
      listSources().then(setSources).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  const isApprover = session?.role && APPROVER_ROLES.includes(session.role);
  const isAdmin = session?.role === "admin";

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createDeletionRequest(targetType, targetId, reason);
      setTargetId("");
      setReason("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create request");
    } finally {
      setCreating(false);
    }
  }

  async function handleDecide(id: string, decision: "approve" | "reject") {
    try {
      await decideDeletionRequest(id, decision);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record decision");
    }
  }

  if (!isAdmin && !isApprover) {
    return (
      <div className="flex flex-1 flex-col">
        <NavBar />
        <main className="p-6">
          <p className="text-sm text-danger">You do not have permission to view this page.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="p-6 flex-1 max-w-3xl">
        <h1 className="text-lg font-semibold mb-1">Deletion Requests</h1>
        <p className="text-sm text-muted mb-4">
          Deactivating a user or ingestion source requires one approval from each of four distinct roles: Chief
          Auditor, Compliance Officer, Security Officer, and Executive Authority. This never deletes ledger
          records -- that capability doesn&apos;t exist anywhere in this system.
        </p>

        {error && <p className="text-sm text-danger mb-4">{error}</p>}

        {isAdmin && (
          <form onSubmit={handleCreate} className="rounded-xl border border-border bg-panel p-4 mb-6 space-y-3">
            <h2 className="text-sm font-semibold">New request</h2>
            <div className="flex gap-3">
              <select
                className={INPUT_CLASS}
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as "user" | "ingestion_source")}
              >
                <option value="ingestion_source">Ingestion source</option>
                <option value="user">User</option>
              </select>
              <select
                className={`${INPUT_CLASS} flex-1`}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                required
              >
                <option value="">Select target...</option>
                {(targetType === "user" ? users : sources).map((item) => (
                  <option key={item.id} value={item.id}>
                    {"username" in item ? item.username : item.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className={`${INPUT_CLASS} w-full`}
              placeholder="Reason for this request"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <Button type="submit" disabled={creating || !targetId}>
              {creating ? "Submitting..." : "Submit request"}
            </Button>
          </form>
        )}

        <div className="space-y-4">
          {requests.map((r) => {
            const approvedRoles = new Set(r.approvals.filter((a) => a.decision === "approve").map((a) => a.approver_role));
            const myRoleAlreadyVoted = session?.role ? r.approvals.some((a) => a.approver_role === session.role) : false;
            return (
              <Panel key={r.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    {r.target_type} &middot; {r.target_id.slice(0, 8)}
                  </span>
                  <span className="text-xs uppercase font-semibold text-muted">{r.status}</span>
                </div>
                <p className="text-sm text-muted mb-2">{r.reason}</p>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {APPROVER_ROLES.map((role) => (
                    <StatusBadge key={role} tone={approvedRoles.has(role) ? "safe" : "muted"}>
                      {REQUIRED_LABELS[role]}
                    </StatusBadge>
                  ))}
                </div>
                {r.status === "pending" && isApprover && session?.role && !myRoleAlreadyVoted && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      tone="safe"
                      onClick={() => handleDecide(r.id, "approve")}
                      className="text-xs px-2 py-1"
                    >
                      Approve as {REQUIRED_LABELS[session.role]}
                    </Button>
                    <Button
                      variant="outline"
                      tone="danger"
                      onClick={() => handleDecide(r.id, "reject")}
                      className="text-xs px-2 py-1"
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </Panel>
            );
          })}
          {requests.length === 0 && <EmptyState>No deletion requests.</EmptyState>}
        </div>
      </main>
    </div>
  );
}
