"use client";

import { Input, Select } from "@/shared/components";
import { TARGET_TYPE_LABELS, POSITION_LABELS } from "../constants/promptConstants";

export function PromptFilterControls({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  targetFilter,
  onTargetChange,
  positionFilter,
  onPositionChange,
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
      {/* Search Input Box */}
      <div className="relative flex-1 max-w-md">
        <Input
          icon="search"
          placeholder="Filter rules by name, target, or content..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full"
          inputClassName="h-9 text-xs pl-10 pr-8 bg-surface-2 border-border/60 rounded-xl"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition-colors rounded-md"
            title="Clear search"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* Dropdown Filters Group */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Status Filter */}
        <div className="relative min-w-[120px] flex-1 sm:flex-initial">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="h-9 w-full rounded-xl border border-border/60 bg-surface-2 px-3 pr-8 text-xs text-text-main appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-colors cursor-pointer"
          >
            <option value="all">Status: All</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            expand_more
          </span>
        </div>

        {/* Target Scope Filter */}
        <div className="relative min-w-[125px] flex-1 sm:flex-initial">
          <select
            value={targetFilter}
            onChange={(e) => onTargetChange(e.target.value)}
            className="h-9 w-full rounded-xl border border-border/60 bg-surface-2 px-3 pr-8 text-xs text-text-main appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-colors cursor-pointer"
          >
            <option value="all">Target: All</option>
            <option value="all_traffic">Global Traffic</option>
            <option value="models">Models</option>
            <option value="combos">Combos</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            expand_more
          </span>
        </div>

        {/* Position Filter */}
        <div className="relative min-w-[130px] flex-1 sm:flex-initial">
          <select
            value={positionFilter}
            onChange={(e) => onPositionChange(e.target.value)}
            className="h-9 w-full rounded-xl border border-border/60 bg-surface-2 px-3 pr-8 text-xs text-text-main appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-colors cursor-pointer"
          >
            <option value="all">Position: All</option>
            {Object.entries(POSITION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            expand_more
          </span>
        </div>
      </div>
    </div>
  );
}
