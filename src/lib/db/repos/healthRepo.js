import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
import { getProviderConnections } from "./connectionsRepo.js";
import { getDisabledModels } from "./disabledModelsRepo.js";
import { getSettings } from "./settingsRepo.js";
import { getPricingForModel } from "./pricingRepo.js";
import { MODEL_LOCK_PREFIX } from "open-sse/services/accountFallback.js";
import { calculateCostFromTokens } from "open-sse/providers/pricing.js";
import { AI_PROVIDERS, getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";

export const HEALTH_WINDOWS = { "1h": 3600000, "6h": 6 * 3600000, "24h": 24 * 3600000, "7d": 7 * 24 * 3600000 };

// requestDetails is pruned by the observability settings, but a window filter is not a
// bound on its own, so reads stay capped and `sample.capped` says when that mattered.
const MAX_ROWS = 2000;

// A single failed call out of two is noise, so a success rate only colours a card
// once that card has enough traffic to mean something.
const MIN_SAMPLE = 3;
const ERROR_RATE = 50;
const DEGRADED_RATE = 95;

const EMPTY_COOLDOWN = { until: null, secondsLeft: 0, scope: null, model: null };

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Nearest-rank percentile over an ascending-sorted numeric array. */
function percentile(sorted, q) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

function futureIso(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) return null;
  return new Date(t).toISOString();
}

function secondsLeft(untilIso) {
  if (!untilIso) return 0;
  return Math.max(0, Math.round((new Date(untilIso).getTime() - Date.now()) / 1000));
}

function aliasFor(provider) {
  return getProviderAlias(provider) || provider;
}

/** Storage key the existing pause/resume API (`/api/models/disabled`) expects. */
function providerStorageAlias(provider) {
  if (isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider)) return provider;
  return aliasFor(provider);
}

/**
 * Logged rows carry the model as the client sent it (`alias/model`), while disabledModels
 * and pricing key on the bare id — so strip only a prefix that names the provider itself,
 * leaving model ids that legitimately contain a slash alone.
 */
function normalizeModelId(rawModel, provider) {
  const str = String(rawModel || "").trim();
  if (!str.includes("/")) return str;
  const slash = str.indexOf("/");
  const prefix = str.slice(0, slash);
  if (prefix === provider || prefix === aliasFor(provider)) return str.slice(slash + 1);
  return str;
}

function newStats() {
  return {
    requests: 0,
    success: 0,
    error: 0,
    latencies: [],
    tokens: { prompt: 0, completion: 0, cached: 0, total: 0 },
    costUsd: 0,
    lastError: null,
    models: new Map(),
  };
}

function tokenSum(tokens) {
  const prompt = num(tokens?.prompt_tokens ?? tokens?.input_tokens);
  const completion = num(tokens?.completion_tokens ?? tokens?.output_tokens);
  const cached = num(tokens?.cached_tokens ?? tokens?.cache_read_input_tokens);
  // prompt_tokens is cache-inclusive (see canonicalizeUsage), so cached is not added on top.
  return { prompt, completion, cached, total: prompt + completion };
}

/** The log writes "success" or "error" here; anything else is treated as not-a-failure. */
function isErrorRow(row) {
  return row.status === "error";
}

function errorText(parsed) {
  const raw = parsed?.response?.error ?? parsed?.error ?? "";
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, 300);
  if (raw && typeof raw === "object") {
    const nested = raw.message || raw.error?.message;
    if (typeof nested === "string" && nested.trim()) return nested.trim().slice(0, 300);
  }
  return "";
}

function errorCode(parsed) {
  const code = parsed?.response?.status ?? parsed?.status_code;
  return code === undefined || code === null || code === "" ? null : String(code);
}

function rememberError(stats, at, text, code) {
  if (!text && !code) return;
  const stamp = at || new Date().toISOString();
  if (stats.lastError && new Date(stamp) <= new Date(stats.lastError.at)) return;
  stats.lastError = { text, code, at: stamp };
}

/** Fold one parsed requestDetails row into a stats bucket (model, connection, provider or total). */
function record(stats, row, parsed, modelId, pricing) {
  stats.requests += 1;
  if (isErrorRow(row)) stats.error += 1;
  else stats.success += 1;

  const latency = num(parsed?.latency?.total);
  // Latency percentiles describe answered requests only — a fast rejection must not
  // make a connection look snappy.
  if (!isErrorRow(row) && latency > 0) stats.latencies.push(latency);

  const tokens = tokenSum(parsed?.tokens);
  stats.tokens.prompt += tokens.prompt;
  stats.tokens.completion += tokens.completion;
  stats.tokens.cached += tokens.cached;
  stats.tokens.total += tokens.total;
  if (pricing) {
    stats.costUsd += calculateCostFromTokens(
      { prompt_tokens: tokens.prompt, completion_tokens: tokens.completion, cached_tokens: tokens.cached },
      pricing
    );
  }

  if (isErrorRow(row)) rememberError(stats, row.timestamp, errorText(parsed), errorCode(parsed));
  if (!modelId) return;

  let model = stats.models.get(modelId);
  if (!model) {
    model = newStats();
    model.model = modelId;
    stats.models.set(modelId, model);
  }
  record(model, row, parsed, null, pricing);
}

function finalize(stats, extra = {}) {
  const sorted = stats.latencies.slice().sort((a, b) => a - b);
  return {
    requests: stats.requests,
    success: stats.success,
    error: stats.error,
    successRate: stats.requests > 0 ? round((stats.success / stats.requests) * 100, 1) : null,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    tokens: stats.tokens,
    costUsd: round(stats.costUsd, 6),
    lastError: stats.lastError ? { ...stats.lastError } : null,
    models: [...stats.models.values()]
      .map((m) => ({ model: m.model, ...finalize(m) }))
      .sort((a, b) => b.requests - a.requests || String(a.model).localeCompare(String(b.model))),
    ...extra,
  };
}

function emptyModelRow(model, paused, lock) {
  return {
    model,
    requests: 0,
    success: 0,
    error: 0,
    successRate: null,
    p50Ms: null,
    p95Ms: null,
    tokens: { prompt: 0, completion: 0, cached: 0, total: 0 },
    costUsd: 0,
    lastError: null,
    models: [],
    paused,
    cooldownUntil: lock?.until || null,
    cooldownSeconds: lock?.secondsLeft || 0,
  };
}

function pickLatestError(...candidates) {
  let best = null;
  for (const c of candidates) {
    if (!c) continue;
    const text = typeof c.text === "string" ? c.text.trim() : "";
    const at = c.at || null;
    if (!text && !c.code && !at) continue;
    if (!best || (at && new Date(at) > new Date(best.at || 0))) best = { text, code: c.code || null, at };
  }
  return best;
}

/** Active `modelLock_<model>` fields on a connection, soonest expiry first. */
function activeModelLocks(connection) {
  const out = [];
  for (const [key, value] of Object.entries(connection || {})) {
    if (!key.startsWith(MODEL_LOCK_PREFIX) || !value) continue;
    const until = futureIso(value);
    if (!until) continue;
    const model = key.slice(MODEL_LOCK_PREFIX.length);
    out.push({ model: model === "__all" ? null : model, until, secondsLeft: secondsLeft(until) });
  }
  return out.sort((a, b) => new Date(a.until) - new Date(b.until));
}

function cooldownFor(connection, locks) {
  const candidates = [];
  const rateLimitedUntil = futureIso(connection?.rateLimitedUntil);
  if (rateLimitedUntil) candidates.push({ until: rateLimitedUntil, scope: "account", model: null });
  for (const lock of locks) {
    candidates.push({ until: lock.until, scope: lock.model ? "model" : "account", model: lock.model });
  }
  const earliest = candidates.sort((a, b) => new Date(a.until) - new Date(b.until))[0];
  if (!earliest) return { ...EMPTY_COOLDOWN };
  return { ...earliest, secondsLeft: secondsLeft(earliest.until) };
}

function deriveStatus({ isActive, cooldown, testStatus, successRate, requests }) {
  if (isActive === false) return "disabled";
  if (cooldown && cooldown.secondsLeft > 0) return "locked";
  if (testStatus === "unavailable" || testStatus === "error") return "error";
  if (requests >= MIN_SAMPLE && successRate !== null && successRate < ERROR_RATE) return "error";
  if (requests >= MIN_SAMPLE && successRate !== null && successRate < DEGRADED_RATE) return "degraded";
  return "ok";
}

/**
 * Bounded read of the request log inside a window. Only the newest MAX_ROWS rows are
 * parsed; the total comes from a cheap COUNT so a sample never looks like everything.
 */
async function readRequestRows(sinceIso) {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT id, timestamp, provider, model, connectionId, status, data
     FROM requestDetails
     WHERE timestamp >= ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    [sinceIso, MAX_ROWS]
  );
  const counted = db.get(`SELECT COUNT(*) AS c FROM requestDetails WHERE timestamp >= ?`, [sinceIso]);
  return { rows, rowsInWindow: counted?.c || 0 };
}

/**
 * Read-only health rollup: request outcomes from `requestDetails` joined onto the
 * connection records (cooldowns, backoff, last error) and the paused-model list.
 *
 * @param {string} windowKey one of the keys of HEALTH_WINDOWS
 */
/**
 * Mirrors the enablement precedence in requestDetailsRepo so the board can tell
 * "no traffic in this window" apart from "request logging is switched off".
 */
async function isRequestLoggingEnabled() {
  const env = process.env.ENABLE_REQUEST_LOGS;
  if (env !== undefined) return env.toLowerCase() === "true";
  const settings = await getSettings().catch(() => ({}));
  if (typeof settings?.enableObservability === "boolean") return settings.enableObservability;
  return process.env.OBSERVABILITY_ENABLED !== "false";
}

export async function getHealthSnapshot(windowKey = "24h") {
  const windowMs = HEALTH_WINDOWS[windowKey];
  if (!windowMs) throw new Error(`Unsupported window: ${windowKey}`);

  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  const [{ rows, rowsInWindow }, connections, disabledMap, loggingEnabled] = await Promise.all([
    readRequestRows(sinceIso),
    getProviderConnections(),
    getDisabledModels().catch(() => ({})),
    isRequestLoggingEnabled(),
  ]);
  const knownConnections = new Set(connections.map((c) => c.id));

  const pricingCache = new Map();
  async function pricingFor(provider, modelId) {
    if (!modelId) return null;
    const key = `${provider}\u0000${modelId}`;
    if (!pricingCache.has(key)) {
      pricingCache.set(key, await getPricingForModel(provider, modelId).then((p) => p || null).catch(() => null));
    }
    return pricingCache.get(key);
  }

  function pausedIds(provider) {
    const alias = providerStorageAlias(provider);
    return [...new Set([...(disabledMap[alias] || []), ...(disabledMap[provider] || [])])];
  }

  const totals = newStats();
  const byConnection = new Map();
  const byProvider = new Map();
  const orphanProvider = new Map();

  for (const row of rows) {
    const parsed = parseJson(row.data, {});
    const provider = row.provider || parsed?.provider || "unknown";
    const modelId = normalizeModelId(row.model || parsed?.model, provider);
    const pricing = await pricingFor(provider, modelId);

    let providerBucket = byProvider.get(provider);
    if (!providerBucket) {
      providerBucket = newStats();
      byProvider.set(provider, providerBucket);
    }

    if (row.connectionId) {
      let connBucket = byConnection.get(row.connectionId);
      if (!connBucket) {
        connBucket = newStats();
        byConnection.set(row.connectionId, connBucket);
      }
      record(connBucket, row, parsed, modelId, pricing);
      if (!knownConnections.has(row.connectionId)) orphanProvider.set(row.connectionId, provider);
    }
    record(providerBucket, row, parsed, modelId, pricing);
    record(totals, row, parsed, modelId, pricing);
  }

  const connectionList = [];
  for (const conn of connections) {
    const raw = byConnection.get(conn.id) || newStats();
    const paused = pausedIds(conn.provider);
    const locks = activeModelLocks(conn);
    const lockByModel = new Map(locks.map((lock) => [lock.model, lock]));
    const models = finalize(raw).models.map((m) => ({
      ...m,
      paused: paused.includes(m.model),
      cooldownUntil: lockByModel.get(m.model)?.until || null,
      cooldownSeconds: lockByModel.get(m.model)?.secondsLeft || 0,
    }));
    // Paused or locked models with no traffic in the window still get a row, otherwise
    // there would be nothing on screen to click "resume" on.
    const seen = new Set(models.map((m) => m.model));
    for (const id of [...locks.map((l) => l.model), ...paused]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push(emptyModelRow(id, paused.includes(id), lockByModel.get(id)));
    }
    const cooldown = cooldownFor(conn, locks);
    const stats = finalize(raw, {
      id: conn.id,
      provider: conn.provider,
      providerAlias: providerStorageAlias(conn.provider),
      providerName: AI_PROVIDERS[conn.provider]?.name || conn.provider,
      name: conn.name || conn.displayName || conn.email || String(conn.id).slice(0, 8),
      authType: conn.authType || null,
      isActive: conn.isActive !== false,
      testStatus: conn.testStatus || null,
      backoffLevel: num(conn.backoffLevel),
      lastTested: conn.lastTested || null,
      removed: false,
      cooldown,
      modelLocks: locks,
      pausedModels: paused,
      lastError: pickLatestError(
        {
          text: conn.lastError || "",
          code: conn.errorCode === undefined || conn.errorCode === null ? null : String(conn.errorCode),
          at: conn.lastErrorAt,
        },
        raw.lastError
      ),
      models,
    });
    stats.status = deriveStatus({
      isActive: conn.isActive,
      cooldown,
      testStatus: conn.testStatus,
      successRate: stats.successRate,
      requests: stats.requests,
    });
    connectionList.push(stats);
  }

  // Requests logged against a since-deleted connection still count towards their provider
  // rollup, and get one card each so the numbers on the board always add up.
  for (const [id, provider] of orphanProvider.entries()) {
    const raw = byConnection.get(id) || newStats();
    const models = finalize(raw).models.map((m) => ({ ...m, paused: false, cooldownUntil: null, cooldownSeconds: 0 }));
    const stats = finalize(raw, {
      id,
      provider,
      providerAlias: providerStorageAlias(provider),
      providerName: AI_PROVIDERS[provider]?.name || provider,
      name: "removed connection",
      authType: null,
      isActive: false,
      testStatus: null,
      backoffLevel: 0,
      lastTested: null,
      removed: true,
      cooldown: { ...EMPTY_COOLDOWN },
      modelLocks: [],
      pausedModels: [],
      models,
    });
    stats.status = "disabled";
    connectionList.push(stats);
  }

  connectionList.sort((a, b) => b.requests - a.requests || String(a.name).localeCompare(String(b.name)));

  // Idle providers belong on the board too — an account that never routed a request in
  // the window is exactly the kind of thing worth seeing.
  const providerKeys = [...new Set([...byProvider.keys(), ...connections.map((c) => c.provider)])];
  const providers = providerKeys.map((provider) => {
    const raw = byProvider.get(provider) || newStats();
    const stats = finalize(raw);
    const conns = connectionList.filter((c) => c.provider === provider);
    const cooling = conns.filter((c) => c.cooldown.secondsLeft > 0).map((c) => c.cooldown);
    const cooldown = cooling.sort((a, b) => a.secondsLeft - b.secondsLeft)[0] || { ...EMPTY_COOLDOWN };
    const paused = pausedIds(provider);
    const providerStats = {
      ...stats,
      provider,
      providerAlias: providerStorageAlias(provider),
      providerName: AI_PROVIDERS[provider]?.name || provider,
      // Counts, not the list — the flat `connections[]` array is the canonical list.
      accountCount: conns.length,
      activeAccountCount: conns.filter((c) => c.isActive).length,
      coolingDown: cooling.length,
      disabledModels: paused,
      models: stats.models.map((m) => ({ ...m, paused: paused.includes(m.model) })),
      lastError: pickLatestError(...conns.map((c) => c.lastError)),
      cooldown,
    };
    providerStats.status = deriveStatus({
      isActive: conns.length === 0 || conns.some((c) => c.isActive),
      cooldown,
      testStatus: conns.some((c) => c.status === "error") ? "unavailable" : null,
      successRate: stats.successRate,
      requests: stats.requests,
    });
    return providerStats;
  });

  providers.sort((a, b) => b.requests - a.requests || a.provider.localeCompare(b.provider));

  const grand = finalize(totals);
  return {
    window: windowKey,
    windowMs,
    since: sinceIso,
    generatedAt: new Date().toISOString(),
    observability: { enabled: loggingEnabled },
    sample: { rowsInWindow, rowsAnalysed: rows.length, capped: rowsInWindow > rows.length },
    totals: {
      requests: grand.requests,
      success: grand.success,
      error: grand.error,
      successRate: grand.successRate,
      p50Ms: grand.p50Ms,
      p95Ms: grand.p95Ms,
      tokens: grand.tokens,
      costUsd: grand.costUsd,
      providers: providers.length,
      connections: connectionList.length,
      coolingDown: connectionList.filter((c) => c.cooldown.secondsLeft > 0).length,
    },
    providers,
    connections: connectionList,
  };
}
