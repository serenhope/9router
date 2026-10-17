"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardSkeleton, SegmentedControl } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

const PERIODS = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
];

function fmtMs(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 60000) return `${(v / 60000).toFixed(1)}m`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${v}ms`;
}

function fmtCount(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function healthTone(errorRate) {
  const rate = Number(errorRate) || 0;
  if (rate >= 20) return "error";
  if (rate >= 5) return "warning";
  return "success";
}

function StatCard({ label, value, sub, tone }) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-4">
      <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "danger" ? "text-red-500" : tone === "warning" ? "text-amber-500" : ""}`}>
        {value}
      </p>
      {sub ? <p className="text-xs opacity-60">{sub}</p> : null}
    </Card>
  );
}

function ProviderRow({ p }) {
  const tone = healthTone(p.errorRate);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{p.provider}</span>
        <Badge variant={tone}>
          {Number(p.errorRate) > 0 ? `${p.errorRate}% err` : "healthy"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-80">
        <span title="Requests">{fmtCount(p.requests)} req</span>
        <span title="Errors" className={Number(p.errors) > 0 ? "text-red-500" : ""}>{fmtCount(p.errors)} err</span>
        <span title="Average latency">avg {fmtMs(p.avg)}</span>
        <span title="95th percentile latency">p95 {fmtMs(p.p95)}</span>
      </div>
    </div>
  );
}

function TimelineBars({ timeline }) {
  if (!timeline?.length) {
    return <p className="text-sm opacity-60">No traffic recorded in this period.</p>;
  }
  // Downsample to at most 48 bars so 7d stays readable on mobile.
  const step = Math.max(1, Math.ceil(timeline.length / 48));
  const shown = timeline.filter((_, i) => i % step === 0);
  const max = Math.max(...shown.map((b) => b.total), 1);
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" aria-hidden="true">
        {shown.map((b) => {
          const h = Math.max(4, Math.round((b.total / max) * 100));
          const errH = b.total > 0 ? Math.round((b.errors / b.total) * h) : 0;
          return (
            <div key={b.hour} className="relative min-w-[4px] flex-1 rounded-t bg-green-500/60" style={{ height: `${h}%` }}>
              {errH > 0 ? (
                <div className="absolute bottom-0 w-full rounded-t bg-red-500/80" style={{ height: `${(errH / h) * 100}%` }} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] opacity-60">
        <span>{new Date(shown[0].hour).toLocaleString()}</span>
        <span>{new Date(shown[shown.length - 1].hour).toLocaleString()}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] opacity-70">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-green-500/60" /> ok</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500/80" /> errors</span>
      </div>
    </div>
  );
}

function PoolRow({ pool }) {
  const st = String(pool.testStatus || "").toLowerCase();
  const tone = !pool.isActive ? "default" : (st === "error" || st === "failed") ? "error" : st === "unknown" || !st ? "default" : "success";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <span className="truncate font-medium">{pool.name}</span>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="text-xs opacity-60">{pool.proxyCount ?? "?"} proxies</span>
        <Badge variant={tone}>{pool.isActive ? pool.testStatus || "untested" : "inactive"}</Badge>
      </div>
    </div>
  );
}

export default function MonitoringContent() {
  const [period, setPeriod] = useState("24h");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const notify = useNotificationStore();

  const load = useCallback(async (p, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/monitoring/overview?period=${p}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      if (!silent) notify.error?.(`Failed to load monitoring: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load(period);
  }, [period, load]);

  // Auto-refresh every 30s, silently so the UI never flickers. Paused while the
  // tab is hidden: a background dashboard should not keep the 1-vCPU host busy.
  useEffect(() => {
    let t = null;
    const tick = () => load(period, true);
    const start = () => { if (t === null) t = setInterval(tick, 30000); };
    const stop = () => { if (t !== null) { clearInterval(t); t = null; } };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { tick(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [period, load]);

  if (loading && !data) return <CardSkeleton />;
  if (!data) return null;

  const worst = data.providers.filter((p) => Number(p.errorRate) >= 5);

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header row: title + controls, wraps on mobile */}
      <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Monitoring</h1>
        <div className="flex items-center gap-2">
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} size="sm" className="w-full sm:w-auto" />
          <Button variant="outline" size="sm" onClick={() => load(period, true)} disabled={loading} className="w-full sm:w-auto">
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Totals — responsive 2-col on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Requests" value={fmtCount(data.totals.requests)} sub={`last ${data.period}`} />
        <StatCard label="Errors" value={fmtCount(data.totals.errors)} tone={Number(data.totals.errorRate) >= 5 ? "danger" : undefined} sub={`${data.totals.errorRate}% error rate`} />
        <StatCard label="Providers seen" value={data.providers.length} sub={worst.length ? `${worst.length} degraded` : "all healthy"} tone={worst.length ? "warning" : undefined} />
        {data.proxyPools ? (
          <StatCard label="Proxy pools" value={`${data.proxyPools.active}/${data.proxyPools.total}`} sub={`${data.proxyPools.healthy} healthy · ${data.proxyPools.dead} dead`} />
        ) : (
          <StatCard label="Proxy pools" value="—" sub="scoped session" />
        )}
      </div>

      {/* Error timeline */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Request timeline</h2>
          <span className="text-xs opacity-60">hourly buckets</span>
        </div>
        <TimelineBars timeline={data.timeline} />
      </Card>

      {/* Per-provider health */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Provider health</h2>
          <span className="text-xs opacity-60">latency from request logs</span>
        </div>
        {data.providers.length === 0 ? (
          <p className="text-sm opacity-60">No provider traffic in this period.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.providers.map((p) => <ProviderRow key={p.provider} p={p} />)}
          </div>
        )}
      </Card>

      {/* Proxy pools */}
      {data.proxyPools ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Proxy pools</h2>
            <a href="/dashboard/proxy-pools" className="text-xs underline opacity-70 hover:opacity-100">Manage →</a>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {data.proxyPools.recent.map((pool) => <PoolRow key={pool.name} pool={pool} />)}
          </div>
        </Card>
      ) : null}

      <p className="text-[10px] opacity-40">Auto-refreshes every 30s · generated {new Date(data.generatedAt).toLocaleTimeString()}</p>
    </div>
  );
}
