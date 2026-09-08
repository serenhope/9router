import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    tokenLimit: row.tokenLimit || 0,
    usedTokens: row.usedTokens || 0,
    resetInterval: row.resetInterval || "never",
    lastResetAt: row.lastResetAt || null,
    allowedModels: row.allowedModels || "*",
    rpmLimit: row.rpmLimit || 0,
    tpmLimit: row.tpmLimit || 0,
    ipWhitelist: row.ipWhitelist || "",
    expiresAt: row.expiresAt || null,
    systemPrompt: row.systemPrompt || "",
    budgetGroupId: row.budgetGroupId || "",
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function getApiKeyByKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, options = {}) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const now = new Date().toISOString();
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: now,
    tokenLimit: Number(options.tokenLimit) || 0,
    usedTokens: Number(options.usedTokens) || 0,
    resetInterval: options.resetInterval || "never",
    lastResetAt: options.lastResetAt || now,
    allowedModels: options.allowedModels || "*",
    rpmLimit: Number(options.rpmLimit) || 0,
    tpmLimit: Number(options.tpmLimit) || 0,
    ipWhitelist: options.ipWhitelist || "",
    expiresAt: options.expiresAt || null,
    systemPrompt: options.systemPrompt || "",
    budgetGroupId: options.budgetGroupId || "",
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, tokenLimit, usedTokens, resetInterval, lastResetAt, allowedModels, rpmLimit, tpmLimit, ipWhitelist, expiresAt, systemPrompt, budgetGroupId) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      apiKey.id,
      apiKey.key,
      apiKey.name,
      apiKey.machineId,
      1,
      apiKey.createdAt,
      apiKey.tokenLimit,
      apiKey.usedTokens,
      apiKey.resetInterval,
      apiKey.lastResetAt,
      apiKey.allowedModels,
      apiKey.rpmLimit,
      apiKey.tpmLimit,
      apiKey.ipWhitelist,
      apiKey.expiresAt,
      apiKey.systemPrompt,
      apiKey.budgetGroupId,
    ]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, tokenLimit = ?, usedTokens = ?, resetInterval = ?, lastResetAt = ?, allowedModels = ?, rpmLimit = ?, tpmLimit = ?, ipWhitelist = ?, expiresAt = ?, systemPrompt = ?, budgetGroupId = ? WHERE id = ?`,
      [
        merged.key,
        merged.name,
        merged.machineId,
        merged.isActive ? 1 : 0,
        Number(merged.tokenLimit) || 0,
        Number(merged.usedTokens) || 0,
        merged.resetInterval || "never",
        merged.lastResetAt || null,
        merged.allowedModels || "*",
        Number(merged.rpmLimit) || 0,
        Number(merged.tpmLimit) || 0,
        merged.ipWhitelist || "",
        merged.expiresAt || null,
        merged.systemPrompt || "",
        merged.budgetGroupId || "",
        id,
      ]
    );
    result = merged;
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

// In-memory sliding window rate limiter state for RPM/TPM per API key
if (!global._apiKeyRateLimits) global._apiKeyRateLimits = {};
const rateLimits = global._apiKeyRateLimits;

function checkRateLimits(key, rpmLimit, tpmLimit) {
  if (rpmLimit <= 0 && tpmLimit <= 0) return true;
  const now = Date.now();
  if (!rateLimits[key]) {
    rateLimits[key] = [];
  }

  // Filter out events older than 60 seconds (1 minute window)
  rateLimits[key] = rateLimits[key].filter((req) => now - req.ts < 60000);
  const recent = rateLimits[key];

  if (rpmLimit > 0 && recent.length >= rpmLimit) {
    return "RPM_EXCEEDED";
  }

  if (tpmLimit > 0) {
    const totalTokensInWindow = recent.reduce((sum, r) => sum + (r.tokens || 0), 0);
    if (totalTokensInWindow >= tpmLimit) {
      return "TPM_EXCEEDED";
    }
  }

  return true;
}

export function recordApiKeyUsageInWindow(key, tokens = 0) {
  if (!key) return;
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = [];
  rateLimits[key].push({ ts: now, tokens: tokens || 0 });
}

export async function validateApiKey(key, requestedModel = null, clientIp = null) {
  const db = await getAdapter();
  let result = false;

  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
    if (!row) {
      result = false;
      return;
    }
    if (row.isActive !== 1 && row.isActive !== true) {
      result = false;
      return;
    }

    // Check expiry (#3)
    if (row.expiresAt) {
      const expMs = new Date(row.expiresAt).getTime();
      if (!isNaN(expMs) && Date.now() > expMs) {
        result = "KEY_EXPIRED";
        return;
      }
    }

    // Check shared budget group quota (#34)
    if (row.budgetGroupId) {
      const group = db.get(`SELECT * FROM budgetGroups WHERE id = ?`, [row.budgetGroupId]);
      if (group && Number(group.tokenLimit) > 0) {
        // shared reset if interval elapsed handled by caller; here only check
        const groupUsed = Number(group.usedTokens) || 0;
        if (groupUsed >= Number(group.tokenLimit)) {
          result = "BUDGET_GROUP_EXCEEDED";
          return;
        }
      }
    }

    // Check IP whitelist (empty = disabled/allow all)
    const ipWhitelist = (row.ipWhitelist || "").trim();
    if (ipWhitelist && clientIp) {
      const allowedIps = ipWhitelist.split(",").map((ip) => ip.trim()).filter(Boolean);
      if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
        result = "IP_NOT_ALLOWED";
        return;
      }
    }

    const tokenLimit = Number(row.tokenLimit) || 0;
    let usedTokens = Number(row.usedTokens) || 0;
    const resetInterval = row.resetInterval || "never";
    const allowedModels = row.allowedModels || "*";
    const nowMs = Date.now();
    let lastResetMs = row.lastResetAt
      ? new Date(row.lastResetAt).getTime()
      : new Date(row.createdAt).getTime();

    if (isNaN(lastResetMs)) lastResetMs = nowMs;

    let shouldReset = false;
    if (tokenLimit > 0 && resetInterval && resetInterval !== "never") {
      let intervalMs = 0;
      const num = parseInt(resetInterval, 10);
      if (resetInterval.endsWith("m")) {
        intervalMs = num * 60 * 1000;
      } else if (resetInterval.endsWith("h")) {
        intervalMs = num * 60 * 60 * 1000;
      } else if (resetInterval.endsWith("d")) {
        intervalMs = num * 24 * 60 * 60 * 1000;
      }

      if (intervalMs > 0 && nowMs - lastResetMs >= intervalMs) {
        shouldReset = true;
        const periodsPassed = Math.floor((nowMs - lastResetMs) / intervalMs);
        lastResetMs = lastResetMs + periodsPassed * intervalMs;
      }
    }

    if (shouldReset) {
      usedTokens = 0;
      const newResetIso = new Date(lastResetMs).toISOString();
      db.run(`UPDATE apiKeys SET usedTokens = 0, lastResetAt = ? WHERE id = ?`, [
        newResetIso,
        row.id,
      ]);
    }

    if (tokenLimit > 0 && usedTokens >= tokenLimit) {
      result = "QUOTA_EXCEEDED";
      return;
    }

    // Check allowed models
    if (requestedModel && allowedModels && allowedModels.trim() !== "*" && allowedModels.trim() !== "") {
      const allowedList = allowedModels
        .split(",")
        .map((m) => m.trim().toLowerCase())
        .filter(Boolean);

      const req = requestedModel.toLowerCase();
      const isAllowed = allowedList.some((allowed) => {
        if (allowed === "*" || allowed === req) return true;
        if (allowed.endsWith("*")) {
          const prefix = allowed.slice(0, -1);
          return req.startsWith(prefix);
        }
        if (allowed.startsWith("*")) {
          const suffix = allowed.slice(1);
          return req.endsWith(suffix);
        }
        return false;
      });

      if (!isAllowed) {
        result = "MODEL_NOT_ALLOWED";
        return;
      }
    }

    // Check RPM & TPM rate limits
    const rpmLimit = Number(row.rpmLimit) || 0;
    const tpmLimit = Number(row.tpmLimit) || 0;
    const rateCheck = checkRateLimits(key, rpmLimit, tpmLimit);
    if (rateCheck !== true) {
      result = rateCheck;
      return;
    }

    result = true;
  });

  return result;
}

// ── Budget Groups (#34) ──────────────────────────────────────────────────────

function rowToBudgetGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tokenLimit: Number(row.tokenLimit) || 0,
    usedTokens: Number(row.usedTokens) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getBudgetGroups() {
  const db = await getAdapter();
  return db.all(`SELECT * FROM budgetGroups ORDER BY createdAt ASC`).map(rowToBudgetGroup);
}

export async function getBudgetGroupById(id) {
  const db = await getAdapter();
  return rowToBudgetGroup(db.get(`SELECT * FROM budgetGroups WHERE id = ?`, [id]));
}

export async function createBudgetGroup(name, options = {}) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const group = {
    id: uuidv4(),
    name: name || "Untitled Group",
    tokenLimit: Number(options.tokenLimit) || 0,
    usedTokens: Number(options.usedTokens) || 0,
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO budgetGroups(id, name, tokenLimit, usedTokens, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [group.id, group.name, group.tokenLimit, group.usedTokens, group.createdAt, group.updatedAt]
  );
  return group;
}

export async function updateBudgetGroup(id, data) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM budgetGroups WHERE id = ?`, [id]);
  if (!row) return null;
  const merged = { ...rowToBudgetGroup(row), ...data };
  db.run(
    `UPDATE budgetGroups SET name = ?, tokenLimit = ?, usedTokens = ?, updatedAt = ? WHERE id = ?`,
    [merged.name, Number(merged.tokenLimit) || 0, Number(merged.usedTokens) || 0, new Date().toISOString(), id]
  );
  return merged;
}

export async function deleteBudgetGroup(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM budgetGroups WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

// Increment shared budget used by tokens (called from usageRepo after each request)
export async function incrementBudgetGroupUsage(groupId, tokens) {
  if (!groupId || !tokens) return;
  const db = await getAdapter();
  db.run(
    `UPDATE budgetGroups SET usedTokens = COALESCE(usedTokens, 0) + ?, updatedAt = ? WHERE id = ?`,
    [tokens, new Date().toISOString(), groupId]
  );
}

// ── Key Clone (#4) ────────────────────────────────────────────────────────────

export async function cloneApiKey(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  if (!row) return null;
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(row.machineId || "cloned");
  const now = new Date().toISOString();
  const newKey = {
    id: uuidv4(),
    key: result.key,
    name: `${row.name || "key"} (copy)`,
    machineId: row.machineId,
    isActive: false,
    createdAt: now,
    tokenLimit: row.tokenLimit || 0,
    usedTokens: 0,
    resetInterval: row.resetInterval || "never",
    lastResetAt: now,
    allowedModels: row.allowedModels || "*",
    rpmLimit: row.rpmLimit || 0,
    tpmLimit: row.tpmLimit || 0,
    ipWhitelist: row.ipWhitelist || "",
    expiresAt: row.expiresAt || null,
    systemPrompt: row.systemPrompt || "",
    budgetGroupId: row.budgetGroupId || "",
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, tokenLimit, usedTokens, resetInterval, lastResetAt, allowedModels, rpmLimit, tpmLimit, ipWhitelist, expiresAt, systemPrompt, budgetGroupId) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newKey.id, newKey.key, newKey.name, newKey.machineId, 0,
      newKey.createdAt, newKey.tokenLimit, newKey.usedTokens, newKey.resetInterval,
      newKey.lastResetAt, newKey.allowedModels, newKey.rpmLimit, newKey.tpmLimit,
      newKey.ipWhitelist, newKey.expiresAt, newKey.systemPrompt, newKey.budgetGroupId,
    ]
  );
  return newKey;
}

// ── Key Security Audit (#36) ─────────────────────────────────────────────────

export async function auditApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys`);
  const issues = [];
  for (const row of rows) {
    const risks = [];
    if (!row.ipWhitelist || !row.ipWhitelist.trim()) risks.push("no_ip_whitelist");
    if (!row.tokenLimit || Number(row.tokenLimit) === 0) risks.push("unlimited_tokens");
    if (!row.allowedModels || row.allowedModels.trim() === "*") risks.push("all_models_allowed");
    if (!row.expiresAt) risks.push("no_expiry");
    if (!row.rpmLimit || Number(row.rpmLimit) === 0) risks.push("no_rpm_limit");
    if (risks.length > 0) {
      issues.push({
        id: row.id,
        name: row.name,
        key: row.key ? row.key.slice(0, 8) + "***" : "?",
        risks,
        riskLevel: risks.includes("unlimited_tokens") && risks.includes("no_ip_whitelist") ? "high" : risks.length >= 3 ? "medium" : "low",
      });
    }
  }
  return issues;
}
