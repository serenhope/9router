import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getSessionContext } from "@/lib/auth/dashboardPermissions";
import { parseAllowedModels, matchesAllowedModels } from "@/lib/db/repos/allowedModels.js";
import { getProxyPools } from "@/lib/db/repos/proxyPoolsRepo.js";

export const dynamic = "force-dynamic";

const OK_STATUSES = new Set(["ok", "success", "200"]);
const PERIOD_MS = { "24h": 86400000, "7d": 604800000 };

function cutoffFor(period) {
  const ms = PERIOD_MS[period] || PERIOD_MS["24h"];
  return new Date(Date.now() - ms).toISOString();
}

function pct(part, total) {
  return total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
}

/**
 * GET /api/monitoring/overview?period=24h|7d
 * Aggregated health view for the Monitoring page:
 *  - per-provider: request count, error count, avg/p95 latency (from requestDetails when
 *    observability has data, else status counts from usageHistory)
 *  - error timeline: hourly buckets for the selected period (usageHistory)
 *  - proxy pools: active/dead counts per pool with last test status
 *  - totals: request volume, error rate for the period
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") === "7d" ? "7d" : "24h";
    const cutoff = cutoffFor(period);

    const ctx = await getSessionContext();
    const keyFilter = ctx.apiKeyFilter;
    const patterns = parseAllowedModels(ctx.allowedModels || "*");

    const db = await getAdapter();

    // --- Per-provider latency + errors from requestDetails (has real latency) ---
    const providerStats = {};
    let detailRows = [];
    try {
      detailRows = db.all(
        `SELECT data FROM requestDetails WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 5000`,
        [cutoff]
      );
    } catch {
      detailRows = [];
    }

    const latenciesByProvider = {};
    for (const row of detailRows) {
      let d;
      try { d = JSON.parse(row.data); } catch { continue; }
      const provider = d.provider || "unknown";
      if (!matchesAllowedModels(patterns, d.model || "")) continue;
      if (keyFilter && d.apiKey !== keyFilter) continue;
      const total = d.latency?.total;
      if (!latenciesByProvider[provider]) latenciesByProvider[provider] = [];
      latenciesByProvider[provider].push({ total: Number(total) || 0, status: String(d.status || "") });
    }

    const providers = [];
    for (const [provider, entries] of Object.entries(latenciesByProvider)) {
      const totals = entries.map((e) => e.total).filter((t) => t > 0).sort((a, b) => a - b);
      const errors = entries.filter((e) => {
        const s = e.status.toLowerCase();
        return !OK_STATUSES.has(s) && !/^(200|2\d\d)/.test(s);
      }).length;
      const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
      const p95 = totals.length ? totals[Math.min(totals.length - 1, Math.floor(totals.length * 0.95))] : null;
      providerStats[provider] = { requests: entries.length, errors, avg, p95 };
      providers.push({ provider, requests: entries.length, errors, errorRate: pct(errors, entries.length), avg, p95 });
    }

    // --- Fallback/merge: status counts from usageHistory (covers when observability is off) ---
    const uhParams = [cutoff];
    let uhWhere = "timestamp >= ?";
    if (keyFilter) { uhWhere += " AND apiKey = ?"; uhParams.push(keyFilter); }
    const uhRows = db.all(
      `SELECT provider, status, COUNT(*) as count FROM usageHistory WHERE ${uhWhere} GROUP BY provider, status`,
      uhParams
    );
    const uhByProvider = {};
    let grandTotal = 0;
    let grandErrors = 0;
    for (const row of uhRows) {
      const p = row.provider || "unknown";
      if (!matchesAllowedModels(patterns, row.model || "*")) continue;
      const count = Number(row.count) || 0;
      const isOk = OK_STATUSES.has(String(row.status || "ok").toLowerCase());
      if (!uhByProvider[p]) uhByProvider[p] = { requests: 0, errors: 0 };
      uhByProvider[p].requests += count;
      grandTotal += count;
      if (!isOk) { uhByProvider[p].errors += count; grandErrors += count; }
    }
    for (const [p, s] of Object.entries(uhByProvider)) {
      if (providerStats[p]) {
        providerStats[p].requests = Math.max(providerStats[p].requests, s.requests);
        providerStats[p].errors = Math.max(providerStats[p].errors, s.errors);
      } else {
        providerStats[p] = s;
      }
    }
    const merged = Object.entries(providerStats).map(([provider, s]) => ({
      provider,
      requests: s.requests,
      errors: s.errors,
      errorRate: pct(s.errors, s.requests),
      avg: s.avg ?? null,
      p95: s.p95 ?? null,
    }));
    merged.sort((a, b) => b.requests - a.requests);

    // --- Hourly error timeline (usageHistory) ---
    const timelineParams = [cutoff];
    let timelineWhere = "timestamp >= ?";
    if (keyFilter) { timelineWhere += " AND apiKey = ?"; timelineParams.push(keyFilter); }
    const tlRows = db.all(
      `SELECT timestamp, status, COUNT(*) as count FROM usageHistory WHERE ${timelineWhere} GROUP BY timestamp, status`,
      timelineParams
    );
    const buckets = {};
    for (const row of tlRows) {
      const ts = new Date(row.timestamp);
      if (Number.isNaN(ts.getTime())) continue;
      const hour = new Date(Math.floor(ts.getTime() / 3600000) * 3600000).toISOString();
      if (!buckets[hour]) buckets[hour] = { total: 0, errors: 0 };
      const count = Number(row.count) || 0;
      buckets[hour].total += count;
      if (!OK_STATUSES.has(String(row.status || "ok").toLowerCase())) buckets[hour].errors += count;
    }
    const timeline = Object.entries(buckets)
      .map(([hour, s]) => ({ hour, ...s, errorRate: pct(s.errors, s.total) }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // --- Proxy pools (admin-level info; scoped sessions see counts only) ---
    let proxyPools = null;
    if (!keyFilter) {
      try {
        const pools = await getProxyPools({});
        const active = pools.filter((p) => p.isActive);
        const statusOf = (p) => String(p.testStatus || "").toLowerCase();
        proxyPools = {
          total: pools.length,
          active: active.length,
          healthy: active.filter((p) => statusOf(p) === "active" || statusOf(p) === "success").length,
          untested: active.filter((p) => statusOf(p) === "" || statusOf(p) === "unknown").length,
          dead: active.filter((p) => statusOf(p) === "error" || statusOf(p) === "failed").length,
          recent: pools.slice(0, 12).map((p) => ({
            name: p.name, isActive: !!p.isActive, testStatus: p.testStatus || null,
            proxyCount: Array.isArray(p.proxies) ? p.proxies.length : (p.proxyCount ?? null),
            updatedAt: p.updatedAt || null,
          })),
        };
      } catch {
        proxyPools = null;
      }
    }

    return NextResponse.json({
      period,
      totals: { requests: grandTotal, errors: grandErrors, errorRate: pct(grandErrors, grandTotal) },
      providers: merged,
      timeline,
      proxyPools,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] monitoring overview failed:", error);
    return NextResponse.json({ error: "Failed to build monitoring overview" }, { status: 500 });
  }
}
