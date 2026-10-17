"use client";

import { Button } from "@/shared/components";

export function PromptInjectionHeader({
  onNewRule,
  onOpenPlayground,
  onOpenTemplates,
  onOpenHistory,
  onImport,
  onExport,
  onRefresh,
  loading,
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-border/40">
      {/* Title & Description Block */}
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs">
          <span className="material-symbols-outlined text-[24px] text-primary">tune</span>
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-text tracking-tight">
              Prompt Injection Studio
            </h1>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Gateway
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1 leading-normal max-w-xl">
            Intercept, mutate, and enforce system and user prompts across LLM routes with zero latency.
          </p>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start lg:justify-end shrink-0">
        {/* Utility Group: Refresh, History, Import, Export */}
        <div className="flex items-center bg-surface-2 border border-border/60 rounded-xl p-1 gap-0.5 shadow-2xs">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-50"
            title="Refresh Rules"
          >
            <span className={`material-symbols-outlined text-[18px] block ${loading ? "animate-spin" : ""}`}>
              refresh
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
            title="Studio Revision History & Audit Trail"
          >
            <span className="material-symbols-outlined text-[18px] block">history</span>
          </button>

          <div className="w-[1px] h-4 bg-border/60 mx-0.5" />

          <button
            type="button"
            onClick={onImport}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
            title="Import Rules from JSON"
          >
            <span className="material-symbols-outlined text-[18px] block">upload</span>
          </button>

          <button
            type="button"
            onClick={onExport}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
            title="Export Rules as JSON"
          >
            <span className="material-symbols-outlined text-[18px] block">download</span>
          </button>
        </div>

        {/* Templates Modal Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenTemplates}
          className="h-9 px-3 gap-1.5 text-xs font-medium"
        >
          <span className="material-symbols-outlined text-[18px]">auto_stories</span>
          <span>Templates</span>
        </Button>

        {/* Simulator Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenPlayground}
          className="h-9 px-3 gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          <span>Simulator</span>
        </Button>

        {/* Primary CTA: New Rule */}
        <Button
          variant="primary"
          size="sm"
          onClick={onNewRule}
          className="h-9 px-3.5 gap-1.5 text-xs font-semibold shadow-xs shadow-primary/20 shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>New Rule</span>
        </Button>
      </div>
    </div>
  );
}
