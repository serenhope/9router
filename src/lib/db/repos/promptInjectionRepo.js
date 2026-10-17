import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const SCOPE = "promptInjections";
const REVISION_SCOPE = "promptInjectionRevisions";
const MAX_REVISIONS = 50;

// In-memory cache for ultra-low latency gateway request routing (0ms disk I/O)
let memoryCache = null;
let memoryCacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export function invalidatePromptInjectionCache() {
  memoryCache = null;
  memoryCacheExpiry = 0;
}

function rowToRule(row) {
  if (!row) return null;
  const val = parseJson(row.value, {});
  return {
    id: row.key,
    name: val.name || "Untitled Injection",
    description: val.description || "",
    enabled: val.enabled !== false,
    // "all" | "models" | "combos" | "custom"
    targetType: val.targetType || "models",
    targetCombos: Array.isArray(val.targetCombos) ? val.targetCombos : [],
    targetModels: Array.isArray(val.targetModels) ? val.targetModels : [],
    // Target API keys (empty = all keys or unauthenticated)
    targetKeys: Array.isArray(val.targetKeys) ? val.targetKeys : [],
    // Prompt keyword / regex / compound match condition
    matchCondition:
      Array.isArray(val.matchCondition?.conditions) && val.matchCondition.conditions.length > 0
        ? {
            logic: (val.matchCondition.logic || "AND").toUpperCase(),
            conditions: val.matchCondition.conditions.map((c) => ({
              field: c.field || "user_text",
              operator: c.operator || c.type || "contains",
              value:
                typeof c.value === "string"
                  ? c.value
                  : typeof c.pattern === "string"
                  ? c.pattern
                  : "",
              caseSensitive: !!c.caseSensitive,
            })),
          }
        : {
            type: val.matchCondition?.type || "always",
            pattern: typeof val.matchCondition?.pattern === "string" ? val.matchCondition.pattern : "",
            caseSensitive: !!val.matchCondition?.caseSensitive,
          },
    // "system_prepend" | "system_append" | "system_override" | "user_prepend" | "user_append"
    position: val.position || "system_prepend",
    content: typeof val.content === "string" ? val.content : "",
    priority: Number.isFinite(Number(val.priority)) ? Number(val.priority) : 10,
    hitCount: Number.isFinite(val.hitCount) ? val.hitCount : 0,
    lastTriggeredAt: val.lastTriggeredAt || null,
    createdAt: val.createdAt || new Date().toISOString(),
    updatedAt: val.updatedAt || new Date().toISOString(),
  };
}

export async function getPromptInjections(useCache = false) {
  if (useCache && memoryCache && Date.now() < memoryCacheExpiry) {
    return memoryCache;
  }

  const db = await getAdapter();
  const rows = db.all(`SELECT key, value FROM kv WHERE scope = ?`, [SCOPE]);
  const rules = rows
    .map(rowToRule)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  memoryCache = rules;
  memoryCacheExpiry = Date.now() + CACHE_TTL_MS;
  return rules;
}

export async function getPromptInjectionById(id) {
  if (!id) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT key, value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, id]);
  return rowToRule(row);
}

export async function createPromptInjection(data) {
  const db = await getAdapter();
  const id = data.id || randomUUID();
  const now = new Date().toISOString();
  const rule = {
    id,
    name: (data.name || "New Prompt Injection").trim(),
    description: (data.description || "").trim(),
    enabled: data.enabled !== false,
    targetType: data.targetType || "models",
    targetCombos: Array.isArray(data.targetCombos) ? data.targetCombos.map((s) => String(s).trim()).filter(Boolean) : [],
    targetModels: Array.isArray(data.targetModels) ? data.targetModels.map((s) => String(s).trim()).filter(Boolean) : [],
    targetKeys: Array.isArray(data.targetKeys) ? data.targetKeys.map((s) => String(s).trim()).filter(Boolean) : [],
    matchCondition:
      Array.isArray(data.matchCondition?.conditions) && data.matchCondition.conditions.length > 0
        ? {
            logic: (data.matchCondition.logic || "AND").toUpperCase(),
            conditions: data.matchCondition.conditions.map((c) => ({
              field: c.field || "user_text",
              operator: c.operator || c.type || "contains",
              value:
                typeof c.value === "string"
                  ? c.value.trim()
                  : typeof c.pattern === "string"
                  ? c.pattern.trim()
                  : "",
              caseSensitive: !!c.caseSensitive,
            })),
          }
        : {
            type: data.matchCondition?.type || "always",
            pattern: typeof data.matchCondition?.pattern === "string" ? data.matchCondition.pattern.trim() : "",
            caseSensitive: !!data.matchCondition?.caseSensitive,
          },
    position: data.position || "system_prepend",
    content: typeof data.content === "string" ? data.content : "",
    priority: Number.isFinite(data.priority) ? Number(data.priority) : 10,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, id, stringifyJson(rule)]
  );
  invalidatePromptInjectionCache();
  recordPromptInjectionRevision({
    ruleId: id,
    ruleName: rule.name,
    action: "create",
    snapshot: rule,
    summary: `Created rule #${rule.priority} (${rule.position})`,
  }).catch(() => {});
  return rule;
}

export async function updatePromptInjection(id, data) {
  if (!id) return null;
  const db = await getAdapter();
  const existing = await getPromptInjectionById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const numPriority = data.priority !== undefined ? Number(data.priority) : existing.priority;
  const safePriority = Number.isFinite(numPriority) ? numPriority : existing.priority;

  const updated = {
    ...existing,
    name: typeof data.name === "string" ? data.name.trim() : existing.name,
    description: typeof data.description === "string" ? data.description.trim() : existing.description,
    enabled: typeof data.enabled === "boolean" ? data.enabled : existing.enabled,
    targetType: data.targetType || existing.targetType,
    position: data.position || existing.position,
    content: typeof data.content === "string" ? data.content : existing.content,
    priority: safePriority,
    id,
    targetCombos: Array.isArray(data.targetCombos)
      ? data.targetCombos.map((s) => String(s).trim()).filter(Boolean)
      : existing.targetCombos,
    targetModels: Array.isArray(data.targetModels)
      ? data.targetModels.map((s) => String(s).trim()).filter(Boolean)
      : existing.targetModels,
    targetKeys: Array.isArray(data.targetKeys)
      ? data.targetKeys.map((s) => String(s).trim()).filter(Boolean)
      : existing.targetKeys,
    matchCondition:
      data.matchCondition !== undefined
        ? Array.isArray(data.matchCondition?.conditions) && data.matchCondition.conditions.length > 0
          ? {
              logic: (data.matchCondition.logic || "AND").toUpperCase(),
              conditions: data.matchCondition.conditions.map((c) => ({
                field: c.field || "user_text",
                operator: c.operator || c.type || "contains",
                value:
                  typeof c.value === "string"
                    ? c.value.trim()
                    : typeof c.pattern === "string"
                    ? c.pattern.trim()
                    : "",
                caseSensitive: !!c.caseSensitive,
              })),
            }
          : {
              type: data.matchCondition?.type || "always",
              pattern:
                typeof data.matchCondition?.pattern === "string"
                  ? data.matchCondition.pattern.trim()
                  : "",
              caseSensitive: !!data.matchCondition?.caseSensitive,
            }
        : existing.matchCondition,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, id, stringifyJson(updated)]
  );
  invalidatePromptInjectionCache();
  recordPromptInjectionRevision({
    ruleId: id,
    ruleName: updated.name,
    action: "update",
    snapshot: existing,
    summary: `Updated: ${Object.keys(data).filter((k) => k !== "updatedAt").join(", ")}`,
  }).catch(() => {});
  return updated;
}

export async function deletePromptInjection(id) {
  if (!id) return false;
  const db = await getAdapter();
  const existing = await getPromptInjectionById(id);
  const res = db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, id]);
  invalidatePromptInjectionCache();
  if (existing) {
    recordPromptInjectionRevision({
      ruleId: id,
      ruleName: existing.name,
      action: "delete",
      snapshot: existing,
      summary: `Deleted rule "${existing.name}"`,
    }).catch(() => {});
  }
  return (res?.changes ?? 0) > 0;
}

export async function togglePromptInjection(id, enabled) {
  return await updatePromptInjection(id, { enabled });
}

export async function reorderPromptInjections(orderedIds) {
  if (!Array.isArray(orderedIds)) return false;
  const db = await getAdapter();
  db.transaction(() => {
    orderedIds.forEach((id, index) => {
      const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, id]);
      if (row) {
        const val = parseJson(row.value, {});
        val.priority = index + 1;
        val.updatedAt = new Date().toISOString();
        db.run(`UPDATE kv SET value = ? WHERE scope = ? AND key = ?`, [stringifyJson(val), SCOPE, id]);
      }
    });
  });
  invalidatePromptInjectionCache();
  recordPromptInjectionRevision({
    ruleId: "reorder",
    ruleName: "Studio Reordering",
    action: "reorder",
    snapshot: { orderedIds },
    summary: `Reordered ${orderedIds.length} rule priorities`,
  }).catch(() => {});
  return true;
}

/**
 * Record a revision snapshot for audit trail and rollback
 */
export async function recordPromptInjectionRevision({
  ruleId,
  ruleName = "",
  action = "update",
  snapshot = null,
  summary = "",
} = {}) {
  try {
    const db = await getAdapter();
    const id = `rev_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const revision = {
      id,
      ruleId,
      ruleName: ruleName || snapshot?.name || "Rule",
      action,
      summary,
      snapshot,
      at: now,
    };
    db.run(
      `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
       ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
      [REVISION_SCOPE, id, stringifyJson(revision)]
    );
    const countRow = db.get(`SELECT COUNT(*) as cnt FROM kv WHERE scope = ?`, [REVISION_SCOPE]);
    if ((countRow?.cnt || 0) > MAX_REVISIONS) {
      db.run(
        `DELETE FROM kv WHERE scope = ? AND key NOT IN (
           SELECT key FROM kv WHERE scope = ? ORDER BY key DESC LIMIT ?
         )`,
        [REVISION_SCOPE, REVISION_SCOPE, MAX_REVISIONS]
      );
    }
    return revision;
  } catch (err) {
    return null;
  }
}

/**
 * List recent revisions, optionally filtered by ruleId
 */
export async function listPromptInjectionRevisions({ ruleId = null, limit = 30 } = {}) {
  try {
    const db = await getAdapter();
    const rows = db.all(`SELECT key, value FROM kv WHERE scope = ? ORDER BY key DESC`, [REVISION_SCOPE]);
    let revisions = rows
      .map((r) => parseJson(r.value, null))
      .filter(Boolean);

    if (ruleId) {
      revisions = revisions.filter((rev) => rev.ruleId === ruleId);
    }
    return revisions.slice(0, Math.min(limit, MAX_REVISIONS));
  } catch (err) {
    return [];
  }
}

/**
 * Roll back a rule to a past revision snapshot
 */
export async function rollbackPromptInjectionRevision(revisionId) {
  if (!revisionId) throw new Error("Revision ID is required");
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [REVISION_SCOPE, revisionId]);
  if (!row) throw new Error("Revision snapshot not found");

  const rev = parseJson(row.value, null);
  if (!rev || !rev.snapshot) throw new Error("Invalid revision snapshot data");

  if (rev.action === "reorder") {
    const ids = rev.snapshot?.orderedIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("Invalid reorder snapshot data");
    }
    await reorderPromptInjections(ids);
    recordPromptInjectionRevision({
      ruleId: "reorder",
      ruleName: "Studio Reordering",
      action: "rollback",
      snapshot: { orderedIds: ids },
      summary: `Rolled back to previous rule order (${ids.length} rules)`,
    }).catch(() => {});
    return { success: true, action: "reorder_rollback", count: ids.length };
  }

  if (!rev.snapshot.id) throw new Error("Invalid revision snapshot data");

  const targetId = rev.snapshot.id;
  const now = new Date().toISOString();
  const restored = {
    ...rev.snapshot,
    updatedAt: now,
  };

  db.transaction(() => {
    db.run(
      `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
       ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
      [SCOPE, targetId, stringifyJson(restored)]
    );
  });
  invalidatePromptInjectionCache();

  await recordPromptInjectionRevision({
    ruleId: targetId,
    ruleName: restored.name,
    action: "rollback",
    snapshot: restored,
    summary: `Restored to revision from ${new Date(rev.at).toLocaleDateString()} ${new Date(rev.at).toLocaleTimeString()}`,
  });

  return restored;
}

/**
 * Record rule hits asynchronously without blocking chat flow
 */
export async function recordRuleHits(ruleIds) {
  if (!Array.isArray(ruleIds) || ruleIds.length === 0) return;
  try {
    const db = await getAdapter();
    const now = new Date().toISOString();
    for (const id of ruleIds) {
      db.run(
        `UPDATE kv 
         SET value = json_set(
           value, 
           '$.hitCount', coalesce(json_extract(value, '$.hitCount'), 0) + 1,
           '$.lastTriggeredAt', ?
         ) 
         WHERE scope = ? AND key = ?`,
        [now, SCOPE, id]
      );
    }
    // Mirror update into in-memory cache directly
    if (memoryCache) {
      for (const r of memoryCache) {
        if (ruleIds.includes(r.id)) {
          r.hitCount = (Number(r.hitCount) || 0) + 1;
          r.lastTriggeredAt = now;
        }
      }
    }
  } catch {
    // Non-blocking best effort
  }
}

/**
 * Extract user prompt text across different wire formats for keyword/regex checks
 */
export function extractUserText(body) {
  if (!body) return "";
  if (Array.isArray(body.messages)) {
    const userMsgs = body.messages.filter((m) => m && m.role === "user");
    return userMsgs
      .map((m) => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .filter((p) => p && (p.type === "text" || typeof p.text === "string"))
            .map((p) => p.text || "")
            .join(" ");
        }
        return "";
      })
      .join("\n");
  }
  if (Array.isArray(body.contents)) {
    return body.contents
      .filter((c) => c && c.role === "user")
      .flatMap((c) => (Array.isArray(c.parts) ? c.parts.map((p) => p?.text || "") : []))
      .join("\n");
  }
  if (typeof body.input === "string") return body.input;
  if (Array.isArray(body.input)) {
    return body.input
      .filter((i) => i && (i.role === "user" || i.type === "message"))
      .map((i) => (typeof i.content === "string" ? i.content : ""))
      .join("\n");
  }
  if (typeof body.prompt === "string") return body.prompt;
  return "";
}

/**
 * Match a target against pattern with full glob wildcard support (* matches any sequence)
 */
function matchesPattern(target, pattern) {
  if (!target || !pattern) return false;
  const t = String(target).trim().toLowerCase();
  const p = String(pattern).trim().toLowerCase();
  if (p === "*" || p === t) return true;
  if (!p.includes("*")) return t === p;
  try {
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").split("*").join(".*");
    return new RegExp(`^${escaped}$`, "i").test(t);
  } catch {
    return false;
  }
}

/**
 * Evaluate an individual condition rule against request context
 */
export function evaluateConditionNode(
  cond,
  { userText = "", modelStr = "", provider = "", model = "", comboName = "" } = {}
) {
  if (!cond) return { matches: true, reason: "Empty condition" };

  const field = cond.field || "user_text";
  let targetVal = "";
  if (field === "user_text") {
    targetVal = userText || "";
  } else if (field === "model") {
    targetVal = model || (modelStr && modelStr.includes("/") ? modelStr.split("/")[1] : modelStr) || "";
  } else if (field === "provider") {
    targetVal = provider || (modelStr && modelStr.includes("/") ? modelStr.split("/")[0] : "") || "";
  } else if (field === "combo") {
    targetVal = comboName || "";
  } else {
    targetVal = userText || "";
  }

  const op = cond.operator || cond.type || "contains";
  const rawVal = cond.value !== undefined && cond.value !== null ? cond.value : cond.pattern || "";
  const val = typeof rawVal === "string" ? rawVal.trim() : String(rawVal).trim();
  const isCase = !!cond.caseSensitive;

  if (op === "always") return { matches: true, reason: "Always matches" };
  if (!val) return { matches: false, reason: `Condition value for field "${field}" is empty` };

  const strA = isCase ? targetVal : targetVal.toLowerCase();
  const strB = isCase ? val : val.toLowerCase();

  switch (op) {
    case "contains": {
      const keywords = val.split(",").map((k) => k.trim()).filter(Boolean);
      const matched = keywords.some((kw) => strA.includes(isCase ? kw : kw.toLowerCase()));
      return {
        matches: matched,
        reason: matched
          ? `Field "${field}" contains keyword "${val}"`
          : `Field "${field}" does not contain keyword "${val}"`,
      };
    }
    case "not_contains": {
      const keywords = val.split(",").map((k) => k.trim()).filter(Boolean);
      const matched = !keywords.some((kw) => strA.includes(isCase ? kw : kw.toLowerCase()));
      return {
        matches: matched,
        reason: matched
          ? `Field "${field}" does not contain negative keyword "${val}"`
          : `Field "${field}" matched negative keyword "${val}"`,
      };
    }
    case "equals": {
      const matched = strA === strB;
      return {
        matches: matched,
        reason: matched ? `Field "${field}" equals "${val}"` : `Field "${field}" does not equal "${val}"`,
      };
    }
    case "not_equals": {
      const matched = strA !== strB;
      return {
        matches: matched,
        reason: matched ? `Field "${field}" does not equal "${val}"` : `Field "${field}" equals "${val}"`,
      };
    }
    case "starts_with": {
      const matched = strA.startsWith(strB);
      return {
        matches: matched,
        reason: matched ? `Field "${field}" starts with "${val}"` : `Field "${field}" does not start with "${val}"`,
      };
    }
    case "ends_with": {
      const matched = strA.endsWith(strB);
      return {
        matches: matched,
        reason: matched ? `Field "${field}" ends with "${val}"` : `Field "${field}" does not end with "${val}"`,
      };
    }
    case "regex": {
      try {
        if (val.length > 250) return { matches: false, reason: "Regex pattern exceeds 250 character limit" };
        if (
          /(\([^\)]*[*+]\)[*+])|(\[[^\]]*[*+\]][*+])|(\([^)]*\|[^)]*\)[*+])|(\([^\)]*[*+]\)\{[^}]+\})|(\([^\)]*\{[^}]+\}\)[*+])/.test(
            val
          )
        ) {
          return { matches: false, reason: "Potentially catastrophic regex pattern rejected" };
        }
        const flags = isCase ? "" : "i";
        const boundedText = typeof targetVal === "string" ? targetVal.slice(0, 32768) : "";
        const re = new RegExp(val, flags);
        const matched = re.test(boundedText);
        return {
          matches: matched,
          reason: matched ? `Regex /${val}/ matched "${field}"` : `Regex /${val}/ did not match "${field}"`,
        };
      } catch (err) {
        return { matches: false, reason: `Regex error: ${err.message}` };
      }
    }
    default:
      return { matches: false, reason: `Unsupported condition operator "${op}"` };
  }
}

/**
 * Detailed evaluation of whether a rule matches request context, returning reason for debugging
 */
export async function evaluateRuleMatch(
  rule,
  { modelStr = "", comboName = "", provider = "", model = "", apiKey = "", userText = "" } = {}
) {
  if (!rule) return { matches: false, reason: "Rule is undefined" };
  if (!rule.enabled) return { matches: false, reason: "Rule is disabled" };
  if (!rule.content || !rule.content.trim()) return { matches: false, reason: "Rule prompt content is empty" };

  // 1. Target API Keys restriction check
  if (Array.isArray(rule.targetKeys) && rule.targetKeys.length > 0) {
    if (!apiKey) return { matches: false, reason: "Request has no API key, but rule restricts to specific keys" };
    let matchesKey = rule.targetKeys.includes(apiKey);
    if (!matchesKey) {
      try {
        const { getApiKeyByKey } = await import("./apiKeysRepo.js");
        const keyObj = await getApiKeyByKey(apiKey);
        if (
          keyObj &&
          (rule.targetKeys.includes(keyObj.id) ||
            rule.targetKeys.includes(keyObj.name) ||
            rule.targetKeys.includes(keyObj.key))
        ) {
          matchesKey = true;
        }
      } catch {}
    }
    if (!matchesKey) return { matches: false, reason: "API key does not match target keys" };
  }

  // 2. Keyword / Multi-Condition Group trigger check
  if (rule.matchCondition) {
    if (Array.isArray(rule.matchCondition.conditions) && rule.matchCondition.conditions.length > 0) {
      const logic = (rule.matchCondition.logic || "AND").toUpperCase();
      const results = [];
      for (const cond of rule.matchCondition.conditions) {
        results.push(evaluateConditionNode(cond, { userText, modelStr, provider, model, comboName }));
      }

      const groupMatches =
        logic === "OR" ? results.some((r) => r.matches) : results.every((r) => r.matches);

      if (!groupMatches) {
        const failed = results
          .filter((r) => !r.matches)
          .map((r) => r.reason)
          .join("; ");
        return { matches: false, reason: `Condition group (${logic}) failed: ${failed}` };
      }
    } else if (rule.matchCondition.type && rule.matchCondition.type !== "always") {
      const singleRes = evaluateConditionNode(
        {
          field: "user_text",
          operator: rule.matchCondition.type,
          value: rule.matchCondition.pattern,
          caseSensitive: rule.matchCondition.caseSensitive,
        },
        { userText, modelStr, provider, model, comboName }
      );
      if (!singleRes.matches) {
        return singleRes;
      }
    }
  }

  // 3. Target Scope check (Combos / Models / Global / Custom)
  const targetType = rule.targetType || "models";

  if (targetType === "all") {
    return { matches: true, reason: "Target scope: Global (All models)" };
  }

  const matchesCombo = () => {
    if (!rule.targetCombos || rule.targetCombos.length === 0) return false;
    const candidates = [comboName, modelStr].filter(Boolean);
    return rule.targetCombos.some((combo) => candidates.some((cand) => matchesPattern(cand, combo)));
  };

  const matchesModel = () => {
    if (!rule.targetModels || rule.targetModels.length === 0) return false;
    const fullModel = provider && model ? `${provider}/${model}` : "";
    const candidates = [modelStr, model, fullModel].filter(Boolean);
    return rule.targetModels.some((pat) => candidates.some((cand) => matchesPattern(cand, pat)));
  };

  if (targetType === "combos") {
    const isComboMatch = matchesCombo();
    return {
      matches: isComboMatch,
      reason: isComboMatch
        ? `Target combo matched: ${comboName || modelStr}`
        : `Target combos [${(rule.targetCombos || []).join(", ")}] did not match "${comboName || modelStr}"`,
    };
  }

  if (targetType === "models") {
    const isModelMatch = matchesModel();
    return {
      matches: isModelMatch,
      reason: isModelMatch
        ? `Target model matched: ${modelStr || model}`
        : `Target models [${(rule.targetModels || []).join(", ")}] did not match "${modelStr || model}"`,
    };
  }

  if (targetType === "custom") {
    const isCustomMatch = matchesCombo() || matchesModel();
    return {
      matches: isCustomMatch,
      reason: isCustomMatch ? "Target custom scope matched" : "Custom scope did not match target model/combo",
    };
  }

  return { matches: false, reason: "Unknown targetType" };
}

/**
 * Evaluate if a rule matches the current request context (async to check API keys if needed)
 */
export async function isRuleMatching(rule, context = {}) {
  const res = await evaluateRuleMatch(rule, context);
  return res.matches;
}

/**
 * Substitute variables in prompt content
 */
export function interpolateVariables(template, { modelStr = "", provider = "", model = "", comboName = "", apiKey = "" } = {}) {
  if (typeof template !== "string") return "";
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayStr = weekdays[now.getDay()];
  const effectiveModel = modelStr || (provider && model ? `${provider}/${model}` : model || "");
  const effectiveProvider = provider || (modelStr && modelStr.includes("/") ? modelStr.split("/")[0] : "");

  return template
    .replaceAll("{{model}}", effectiveModel)
    .replaceAll("{{provider}}", effectiveProvider)
    .replaceAll("{{comboName}}", comboName || "")
    .replaceAll("{{weekday}}", weekdayStr)
    .replaceAll("{{date}}", dateStr)
    .replaceAll("{{time}}", timeStr)
    .replaceAll("{{datetime}}", now.toISOString());
}

/**
 * Apply prompt injection rules to a request body.
 * Mutates body in place and returns applied rule info and trace.
 */
export async function applyPromptInjectionsToBody(body, context = {}, options = {}) {
  try {
    if (!body || typeof body !== "object") {
      return { modified: false, injectedRules: [], appliedRules: [], skippedRules: [], trace: [] };
    }

    // Fast in-memory cache for zero disk latency
    let rules = await getPromptInjections(true);
    if (!rules || rules.length === 0) {
      return { modified: false, injectedRules: [], appliedRules: [], skippedRules: [], trace: [] };
    }

    if (options.onlyRuleId) {
      rules = rules.filter((r) => r.id === options.onlyRuleId);
    }

    // Non-enumerable tracker on body to guarantee zero leakage to upstream LLM APIs
    if (!body._appliedPromptInjections) {
      Object.defineProperty(body, "_appliedPromptInjections", {
        value: [],
        writable: true,
        configurable: true,
        enumerable: false, // Prevents serialization into JSON sent upstream
      });
    }

    const userText = context.userText !== undefined ? context.userText : extractUserText(body);
    const enrichedContext = { ...context, userText };

    const appliedRuleNames = [];
    const appliedRuleIds = [];
    const appliedRules = [];
    const skippedRules = [];
    const trace = [];

    for (const rule of rules) {
      if (body._appliedPromptInjections.includes(rule.id)) {
        skippedRules.push({ id: rule.id, name: rule.name, reason: "Already applied to this request" });
        trace.push({
          id: rule.id,
          name: rule.name,
          priority: rule.priority,
          matched: false,
          reason: "Already applied to this request (Idempotent)",
        });
        continue;
      }

      const evalRes = await evaluateRuleMatch(rule, enrichedContext);
      if (!evalRes.matches) {
        skippedRules.push({ id: rule.id, name: rule.name, reason: evalRes.reason });
        trace.push({
          id: rule.id,
          name: rule.name,
          priority: rule.priority,
          matched: false,
          reason: evalRes.reason,
        });
        continue;
      }

      const promptText = interpolateVariables(rule.content, enrichedContext).trim();
      if (!promptText) {
        skippedRules.push({ id: rule.id, name: rule.name, reason: "Interpolated prompt text is empty" });
        trace.push({
          id: rule.id,
          name: rule.name,
          priority: rule.priority,
          matched: false,
          reason: "Interpolated prompt text is empty",
        });
        continue;
      }

      const mutationRes = executeInjection(body, rule.position, promptText, enrichedContext);
      if (!mutationRes?.mutated) {
        const failureReason = mutationRes?.reason || "Payload was not mutated by rule position";
        skippedRules.push({ id: rule.id, name: rule.name, reason: failureReason });
        trace.push({
          id: rule.id,
          name: rule.name,
          priority: rule.priority,
          matched: false,
          reason: failureReason,
        });
        continue;
      }

      body._appliedPromptInjections.push(rule.id);
      appliedRuleNames.push(rule.name || rule.id);
      appliedRuleIds.push(rule.id);
      appliedRules.push({
        id: rule.id,
        name: rule.name,
        position: rule.position,
        priority: rule.priority,
        injectedPrompt: promptText,
      });
      trace.push({
        id: rule.id,
        name: rule.name,
        priority: rule.priority,
        matched: true,
        position: rule.position,
        reason: evalRes.reason,
        injectedPrompt: promptText,
      });
    }

    if (appliedRuleIds.length > 0 && !options.skipHitTracking) {
      recordRuleHits(appliedRuleIds).catch(() => {});
    }

    return {
      modified: appliedRuleNames.length > 0,
      injectedRules: appliedRuleNames,
      appliedRules,
      skippedRules,
      trace,
    };
  } catch (err) {
    // Fail-open: never break chat requests
    return { modified: false, injectedRules: [], appliedRules: [], skippedRules: [], trace: [] };
  }
}

/**
 * Execute actual mutation on body based on position with wire protocol awareness
 */
export function executeInjection(body, position, promptText, context = {}) {
  if (!body || !promptText) return { mutated: false, reason: "Missing body or promptText" };

  const pos = position || "system_prepend";
  const isAnthropicFormat = typeof body.system !== "undefined" ||
    context.provider === "anthropic" ||
    context.provider === "claude" ||
    (Array.isArray(body.messages) &&
      body.messages.length > 0 &&
      body.messages.every((m) => m && m.role !== "system" && m.role !== "developer") &&
      ((context.modelStr && context.modelStr.toLowerCase().includes("claude")) ||
       (context.model && context.model.toLowerCase().includes("claude"))));

  // 1. SYSTEM PREPEND
  if (pos === "system_prepend") {
    // Claude / Anthropic format (takes precedence when body.system is defined or target is Anthropic)
    if (typeof body.system === "string") {
      body.system = `${promptText}\n\n${body.system}`;
      return { mutated: true };
    }
    if (Array.isArray(body.system)) {
      body.system.unshift({ type: "text", text: promptText });
      return { mutated: true };
    }
    if (isAnthropicFormat) {
      body.system = promptText;
      return { mutated: true };
    }

    // OpenAI Responses / instructions
    if (typeof body.instructions === "string") {
      body.instructions = `${promptText}\n\n${body.instructions}`;
      return { mutated: true };
    }

    // Gemini system_instruction / systemInstruction format
    const geminiSys = body.systemInstruction || body.system_instruction;
    if (geminiSys && Array.isArray(geminiSys.parts)) {
      geminiSys.parts.unshift({ text: promptText });
      return { mutated: true };
    }
    if (body.contents && !geminiSys) {
      body.system_instruction = { parts: [{ text: promptText }] };
      return { mutated: true };
    }

    // OpenAI Chat format
    if (Array.isArray(body.messages)) {
      const idx = body.messages.findIndex((m) => m && (m.role === "system" || m.role === "developer"));
      if (idx >= 0) {
        const existing = body.messages[idx];
        if (typeof existing.content === "string") {
          existing.content = `${promptText}\n\n${existing.content}`;
        } else if (Array.isArray(existing.content)) {
          existing.content.unshift({ type: "text", text: promptText });
        }
      } else {
        body.messages.unshift({ role: "system", content: promptText });
      }
      return { mutated: true };
    }

    if (body.system === undefined && !Array.isArray(body.messages) && !body.contents) {
      body.system = promptText;
      return { mutated: true };
    }

    return { mutated: false, reason: "No suitable container found for system_prepend" };
  }

  // 2. SYSTEM APPEND
  if (pos === "system_append") {
    // Claude / Anthropic format
    if (typeof body.system === "string") {
      body.system = `${body.system}\n\n${promptText}`;
      return { mutated: true };
    }
    if (Array.isArray(body.system)) {
      body.system.push({ type: "text", text: promptText });
      return { mutated: true };
    }
    if (isAnthropicFormat) {
      body.system = promptText;
      return { mutated: true };
    }

    // OpenAI Responses
    if (typeof body.instructions === "string") {
      body.instructions = body.instructions ? `${body.instructions}\n\n${promptText}` : promptText;
      return { mutated: true };
    }

    // Gemini
    const geminiSys = body.systemInstruction || body.system_instruction;
    if (geminiSys && Array.isArray(geminiSys.parts)) {
      geminiSys.parts.push({ text: promptText });
      return { mutated: true };
    }
    if (body.contents && !geminiSys) {
      body.system_instruction = { parts: [{ text: promptText }] };
      return { mutated: true };
    }

    // OpenAI Chat messages
    if (Array.isArray(body.messages)) {
      const idx = body.messages.findIndex((m) => m && (m.role === "system" || m.role === "developer"));
      if (idx >= 0) {
        const existing = body.messages[idx];
        if (typeof existing.content === "string") {
          existing.content = `${existing.content}\n\n${promptText}`;
        } else if (Array.isArray(existing.content)) {
          existing.content.push({ type: "text", text: promptText });
        }
      } else {
        body.messages.unshift({ role: "system", content: promptText });
      }
      return { mutated: true };
    }

    if (body.system === undefined && !Array.isArray(body.messages) && !body.contents) {
      body.system = promptText;
      return { mutated: true };
    }

    return { mutated: false, reason: "No suitable container found for system_append" };
  }

  // 3. SYSTEM OVERRIDE
  if (pos === "system_override") {
    // Claude format
    if (body.system !== undefined || isAnthropicFormat) {
      body.system = promptText;
      return { mutated: true };
    }

    // Responses format
    if (body.instructions !== undefined) {
      body.instructions = promptText;
      return { mutated: true };
    }

    // Gemini format
    if (body.contents) {
      if (body.system_instruction) {
        body.system_instruction = { parts: [{ text: promptText }] };
      } else {
        body.systemInstruction = { parts: [{ text: promptText }] };
      }
      return { mutated: true };
    }

    // OpenAI Chat
    if (Array.isArray(body.messages)) {
      body.messages = body.messages.filter((m) => m && m.role !== "system" && m.role !== "developer");
      body.messages.unshift({ role: "system", content: promptText });
      return { mutated: true };
    }

    body.system = promptText;
    return { mutated: true };
  }

  // 4. USER PREPEND
  if (pos === "user_prepend") {
    if (Array.isArray(body.messages)) {
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const m = body.messages[i];
        if (m && m.role === "user") {
          if (Array.isArray(m.content) && m.content.length > 0 && m.content.every((b) => b && b.type === "tool_result")) {
            continue;
          }
          if (typeof m.content === "string") {
            m.content = `${promptText}\n\n${m.content}`;
            return { mutated: true };
          } else if (Array.isArray(m.content)) {
            m.content.unshift({ type: "text", text: promptText });
            return { mutated: true };
          }
        }
      }
      return { mutated: false, reason: "No suitable user message turn found to prepend" };
    }

    if (Array.isArray(body.contents)) {
      for (let i = body.contents.length - 1; i >= 0; i--) {
        const turn = body.contents[i];
        if (turn && turn.role === "user" && Array.isArray(turn.parts)) {
          turn.parts.unshift({ text: promptText });
          return { mutated: true };
        }
      }
      return { mutated: false, reason: "No user content turn found in Gemini payload to prepend" };
    }

    return { mutated: false, reason: "No messages or contents array found" };
  }

  // 5. USER APPEND
  if (pos === "user_append") {
    if (Array.isArray(body.messages)) {
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const m = body.messages[i];
        if (m && m.role === "user") {
          if (Array.isArray(m.content) && m.content.length > 0 && m.content.every((b) => b && b.type === "tool_result")) {
            continue;
          }
          if (typeof m.content === "string") {
            m.content = `${m.content}\n\n${promptText}`;
            return { mutated: true };
          } else if (Array.isArray(m.content)) {
            m.content.push({ type: "text", text: promptText });
            return { mutated: true };
          }
        }
      }
      return { mutated: false, reason: "No suitable user message turn found to append" };
    }

    if (Array.isArray(body.contents)) {
      for (let i = body.contents.length - 1; i >= 0; i--) {
        const turn = body.contents[i];
        if (turn && turn.role === "user" && Array.isArray(turn.parts)) {
          turn.parts.push({ text: promptText });
          return { mutated: true };
        }
      }
      return { mutated: false, reason: "No user content turn found in Gemini payload to append" };
    }

    return { mutated: false, reason: "No messages or contents array found" };
  }

  return { mutated: false, reason: `Unsupported position "${pos}"` };
}
