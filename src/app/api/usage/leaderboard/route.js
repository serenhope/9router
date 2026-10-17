import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getSessionContext } from "@/lib/auth/dashboardPermissions";
import { parseAllowedModels, matchesAllowedModels } from "@/lib/db/repos/allowedModels.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    const now = new Date();
    let cutoff = null;
    if (period === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay.toISOString();
    } else if (period !== "all") {
      let cutoffDays = 7;
      if (period === "24h") cutoffDays = 1;
      else if (period === "30d") cutoffDays = 30;
      else if (period === "60d") cutoffDays = 60;
      cutoff = new Date(now.getTime() - cutoffDays * 86400000).toISOString();
    }

    const ctx = await getSessionContext();
    const keyFilter = ctx.apiKeyFilter;
    const patterns = parseAllowedModels(ctx.allowedModels || "*");

    const conds = [];
    const params = [];
    if (cutoff) { conds.push("timestamp >= ?"); params.push(cutoff); }
    if (keyFilter) { conds.push("apiKey = ?"); params.push(keyFilter); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const db = await getAdapter();
    const comboMap = {};
    try {
      const comboRows = db.all(`SELECT name, models FROM combos`);
      for (const c of comboRows) {
        try {
          const list = typeof c.models === "string" ? JSON.parse(c.models) : c.models;
          for (const m of (list || [])) {
            const lower = String(m).toLowerCase();
            comboMap[lower] = c.name;
            const slash = lower.indexOf("/");
            if (slash !== -1) comboMap[lower.slice(slash + 1)] = c.name;
          }
        } catch {}
      }
    } catch {}

    const rows = db.all(
      `SELECT model, provider,
              COUNT(*) as requests,
              SUM(CASE WHEN status IN ('ok','200','success') THEN 1 ELSE 0 END) as successes,
              SUM(promptTokens) as promptTokens,
              SUM(completionTokens) as completionTokens,
              SUM(promptTokens + completionTokens) as totalTokens,
              SUM(cost) as totalCost
       FROM usageHistory ${where}
       GROUP BY model ORDER BY requests DESC`,
      params
    );

    const leaderboard = rows
      .filter(r => r.model && matchesAllowedModels(patterns, r.model, comboMap))
      .map((r) => {
        const lower = String(r.model).toLowerCase();
        const slash = lower.indexOf("/");
        const bare = slash !== -1 ? lower.slice(slash + 1) : lower;
        const displayModel = comboMap[lower] || comboMap[bare] || r.model;
        return {
          model: displayModel,
          provider: r.provider || "",
          requests: r.requests || 0,
          successes: r.successes || 0,
          successRate: r.requests > 0 ? ((r.successes / r.requests) * 100).toFixed(1) : "0.0",
          promptTokens: r.promptTokens || 0,
          completionTokens: r.completionTokens || 0,
          totalTokens: r.totalTokens || 0,
          avgTokensPerRequest: r.requests > 0 ? Math.round(r.totalTokens / r.requests) : 0,
          totalCost: r.totalCost || 0,
        };
      })
      .slice(0, 50);

    return NextResponse.json({ period, leaderboard });
  } catch (error) {
    console.error("Model leaderboard failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
