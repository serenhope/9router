"use client";

import { Card, Toggle, Button, Badge } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { POSITION_LABELS } from "../constants/promptConstants";

export function PromptRuleCard({
  rule,
  index,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onTestRule,
  onHistory,
  isSortable = false,
}) {
  const { copied, copy } = useCopyToClipboard();
  const posConfig = POSITION_LABELS[rule.position] || POSITION_LABELS.system_prepend;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id, disabled: !isSortable });

  const style = isSortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : "auto",
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`p-4 transition-all duration-150 border-border/60 ${rule.enabled ? "bg-surface" : "bg-surface/30 opacity-75"}`}>
        <div className="flex flex-col gap-3">
          {/* Top bar: Drag handle, Priority, Name, Enabled Toggle */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {isSortable && (
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-text rounded hover:bg-surface-hover mt-0.5"
                  title="Drag to reorder priority"
                >
                  <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                </button>
              )}
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-hover text-text-muted shrink-0 mt-0.5 border border-border/40">
                #{rule.priority ?? index + 1}
              </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text truncate">
                  {rule.name}
                </h3>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${posConfig.badge}`}>
                  <span className="material-symbols-outlined text-[13px]">{posConfig.icon}</span>
                  {posConfig.label}
                </span>
                {rule.hitCount > 0 && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">bolt</span>
                    {rule.hitCount.toLocaleString()} hits
                  </span>
                )}
              </div>
              {rule.description && (
                <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                  {rule.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Toggle
              checked={rule.enabled}
              onChange={() => onToggle(rule.id, rule.enabled)}
              label={`Toggle ${rule.name}`}
              size="sm"
            />
          </div>
        </div>

        {/* Target tags & Trigger condition tags */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {/* Target Type badge */}
          {rule.targetType === "all" ? (
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">public</span>
              Global (All Traffic)
            </span>
          ) : (
            <>
              {rule.targetCombos?.map((c) => (
                <span key={c} className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20 flex items-center gap-1 font-mono">
                  <span className="material-symbols-outlined text-[12px]">alt_route</span>
                  {c}
                </span>
              ))}
              {rule.targetModels?.map((m) => (
                <span key={m} className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center gap-1 font-mono">
                  <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                  {m}
                </span>
              ))}
            </>
          )}

          {/* Compound Multi-Condition Badge */}
          {Array.isArray(rule.matchCondition?.conditions) && rule.matchCondition.conditions.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1 font-medium">
              <span className="material-symbols-outlined text-[12px]">schema</span>
              <span>{rule.matchCondition.logic || "AND"} Group</span>
              <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-amber-500/20">
                {rule.matchCondition.conditions.length}
              </span>
            </span>
          )}

          {/* Simple Condition type badge */}
          {(!rule.matchCondition?.conditions || rule.matchCondition.conditions.length === 0) &&
            rule.matchCondition?.type &&
            rule.matchCondition.type !== "always" && (
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">
                {rule.matchCondition.type === "not_contains" ? "block" : rule.matchCondition.type === "regex" ? "code" : "filter_alt"}
              </span>
              {rule.matchCondition.type === "not_contains" ? "Exclude: " : rule.matchCondition.type === "regex" ? "RegEx: " : "Contains: "}
              <span className="font-mono">{rule.matchCondition.pattern}</span>
            </span>
          )}

          {/* Target API Keys badge if restricted */}
          {Array.isArray(rule.targetKeys) && rule.targetKeys.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">key</span>
              {rule.targetKeys.length} key(s)
            </span>
          )}
        </div>

        {/* Prompt snippet preview */}
        <div className="bg-surface-hover/70 rounded-lg p-2.5 border border-border/40 font-mono text-xs text-text/90 relative group">
          <p className="line-clamp-2 select-text">{rule.content}</p>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs text-text-muted">
          <div className="text-[11px]">
            {rule.lastTriggeredAt
              ? `Last hit ${new Date(rule.lastTriggeredAt).toLocaleString()}`
              : "Not triggered yet"}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTestRule(rule)}
              className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-primary transition-colors"
              title="Test dry-run this rule in Simulator"
              aria-label="Test dry-run this rule in Simulator"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            </button>

            <button
              type="button"
              onClick={() => copy(rule.content)}
              className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-text transition-colors"
              title={copied ? "Copied!" : "Copy prompt text"}
              aria-label="Copy prompt text"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? "check" : "content_copy"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDuplicate(rule)}
              className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-text transition-colors"
              title="Duplicate rule"
              aria-label="Duplicate rule"
            >
              <span className="material-symbols-outlined text-[16px]">library_add</span>
            </button>

            <button
              type="button"
              onClick={() => onHistory?.(rule)}
              className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-text transition-colors"
              title="View revision history & rollback"
              aria-label="View revision history & rollback"
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
            </button>

            <button
              type="button"
              onClick={() => onEdit(rule)}
              className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-primary transition-colors"
              title="Edit rule"
              aria-label="Edit rule"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>

            <button
              type="button"
              onClick={() => onDelete(rule)}
              className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-red-500 transition-colors"
              title="Delete rule"
              aria-label="Delete rule"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
    </div>
  );
}
