"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Badge } from "@/shared/components";
import { POSITION_LABELS } from "../constants/promptConstants";

export function RuleHistoryModal({
  isOpen,
  onClose,
  targetRule = null,
  onRollback,
  fetchRevisions,
  loading = false,
}) {
  const [revisions, setRevisions] = useState([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [filterRuleId, setFilterRuleId] = useState(targetRule?.id || null);
  const [expandedId, setExpandedId] = useState(null);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFilterRuleId(targetRule?.id || null);
      loadRevisions(targetRule?.id || null);
    } else {
      setRevisions([]);
      setError("");
      setExpandedId(null);
    }
  }, [isOpen, targetRule]);

  const loadRevisions = async (ruleId) => {
    setLoadingRevisions(true);
    setError("");
    try {
      const data = await fetchRevisions(ruleId);
      setRevisions(data);
    } catch (err) {
      setError(err.message || "Failed to load revisions");
    } finally {
      setLoadingRevisions(false);
    }
  };

  const handleToggleFilter = (ruleId) => {
    setFilterRuleId(ruleId);
    loadRevisions(ruleId);
  };

  const handleRollback = async (revId) => {
    if (!confirm("Are you sure you want to rollback to this version snapshot? Current rule configuration will be replaced.")) {
      return;
    }
    setRollingBackId(revId);
    try {
      const res = await onRollback(revId);
      if (res?.success) {
        onClose();
      } else {
        setError(res?.error || "Rollback failed");
      }
    } catch (err) {
      setError(err.message || "Rollback failed");
    } finally {
      setRollingBackId(null);
    }
  };

  if (!isOpen) return null;

  const getActionBadge = (action) => {
    switch (action) {
      case "create":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Created</span>;
      case "update":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-sky-500/10 text-sky-500 border border-sky-500/20">Updated</span>;
      case "rollback":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Rollback</span>;
      case "delete":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/10 text-red-500 border border-red-500/20">Deleted</span>;
      case "reorder":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">Reordered</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-surface text-text-muted border border-border/50">{action}</span>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        targetRule
          ? `Revision History — ${targetRule.name}`
          : "Studio Activity & Revision History"
      }
      size="full"
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Filter bar */}
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <p className="text-text-muted">
            Inspect previous configuration snapshots and rollback changes safely.
          </p>

          {targetRule && (
            <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border/60 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleFilter(targetRule.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filterRuleId === targetRule.id
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text"
                }`}
              >
                This Rule Only
              </button>
              <button
                type="button"
                onClick={() => handleToggleFilter(null)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filterRuleId === null
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text"
                }`}
              >
                All Studio History
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Revisions list */}
        {loadingRevisions ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted">
            <span className="material-symbols-outlined text-[28px] animate-spin text-primary">
              progress_activity
            </span>
            <p>Loading revision timeline...</p>
          </div>
        ) : revisions.length === 0 ? (
          <div className="py-12 text-center text-text-muted flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[32px] opacity-40">history</span>
            <p className="text-sm font-semibold text-text">No revision history found</p>
            <p className="text-xs max-w-sm">
              Mutations, priority changes, and rule updates will automatically be recorded here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
            {revisions.map((rev) => {
              const isExpanded = expandedId === rev.id;
              const snapshot = rev.snapshot;
              const posConfig = snapshot?.position
                ? POSITION_LABELS[snapshot.position]
                : null;

              return (
                <div
                  key={rev.id}
                  className="p-3 rounded-xl border border-border/60 bg-surface/50 flex flex-col gap-2 transition-colors hover:border-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {getActionBadge(rev.action)}
                      <span className="font-semibold text-text truncate">
                        {rev.ruleName || "Rule"}
                      </span>
                      <span className="text-[11px] font-mono text-text-muted shrink-0">
                        {new Date(rev.at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {snapshot && rev.action !== "reorder" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRollback(rev.id)}
                          disabled={rollingBackId === rev.id || loading}
                          className="h-7 px-2.5 text-[11px] gap-1 text-primary hover:bg-primary/10 border-primary/20"
                          title="Restore this version"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {rollingBackId === rev.id ? "progress_activity" : "history"}
                          </span>
                          <span>{rollingBackId === rev.id ? "Restoring..." : "Rollback"}</span>
                        </Button>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : rev.id)}
                        className="p-1 rounded text-text-muted hover:text-text hover:bg-surface"
                        title={isExpanded ? "Collapse snapshot" : "View snapshot details"}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isExpanded ? "expand_less" : "expand_more"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {rev.summary && (
                    <p className="text-xs text-text-muted leading-relaxed">
                      {rev.summary}
                    </p>
                  )}

                  {/* Expanded Snapshot Details */}
                  {isExpanded && snapshot && (
                    <div className="mt-2 pt-2 border-t border-border/40 flex flex-col gap-2 bg-surface/70 p-2.5 rounded-lg text-xs">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-text-muted block">Position:</span>
                          <span className="font-semibold text-text">
                            {posConfig?.label || snapshot.position || "system_prepend"}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Priority:</span>
                          <span className="font-mono text-text">#{snapshot.priority ?? 10}</span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Target Scope:</span>
                          <span className="font-semibold text-text capitalize">
                            {snapshot.targetType || "all"}
                          </span>
                        </div>
                      </div>

                      {snapshot.content && (
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="text-text-muted text-[11px]">Prompt Content Snapshot:</span>
                          <pre className="p-2 rounded bg-surface border border-border/50 font-mono text-[11px] text-text whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {snapshot.content}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
