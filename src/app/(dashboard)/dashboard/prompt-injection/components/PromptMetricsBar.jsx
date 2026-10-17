"use client";

import { Card } from "@/shared/components";

export function PromptMetricsBar({ rules = [] }) {
  const total = rules.length;
  const active = rules.filter((r) => r.enabled).length;
  const totalHits = rules.reduce((acc, r) => acc + (Number(r.hitCount) || 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Total Rules */}
      <Card className="p-3.5 sm:p-4 flex items-center justify-between border-border/50 bg-surface/50 hover:bg-surface/70 transition-colors shadow-2xs">
        <div>
          <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Total Rules
          </div>
          <div className="text-2xl font-bold text-text mt-1">{total}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </div>
      </Card>

      {/* 2. Active Rules */}
      <Card className="p-3.5 sm:p-4 flex items-center justify-between border-border/50 bg-surface/50 hover:bg-surface/70 transition-colors shadow-2xs">
        <div>
          <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Active Rules
          </div>
          <div className="text-2xl font-bold text-emerald-500 mt-1">{active}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
        </div>
      </Card>

      {/* 3. Injections Triggered */}
      <Card className="p-3.5 sm:p-4 flex items-center justify-between border-border/50 bg-surface/50 hover:bg-surface/70 transition-colors shadow-2xs">
        <div>
          <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Injections Triggered
          </div>
          <div className="text-2xl font-bold text-amber-500 mt-1">
            {totalHits.toLocaleString()}
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">bolt</span>
        </div>
      </Card>

      {/* 4. Engine Overhead */}
      <Card className="p-3.5 sm:p-4 flex items-center justify-between border-border/50 bg-surface/50 hover:bg-surface/70 transition-colors shadow-2xs">
        <div>
          <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Engine Overhead
          </div>
          <div className="text-2xl font-bold text-sky-500 mt-1">&lt; 0.01 ms</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">speed</span>
        </div>
      </Card>
    </div>
  );
}
