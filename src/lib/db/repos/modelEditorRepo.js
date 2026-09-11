import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// Two record shapes live in the `modelOverrides` kv scope:
//  • `{callName}`           → a studio model: a user-owned callable name that points at any
//                             `provider/model` and may override context window + system prompt.
//                             It is aliased so the router resolves the name.
//  • `{provider}|{model}`   → legacy per-model override, still honoured at request time.
const SCOPE = "modelOverrides";

function store() {
  return {
  async all() {
  const db = await getAdapter();
  const rows = db.all(`SELECT key, value FROM kv WHERE scope = ?`, [SCOPE]);
  const out = {};
  for (const row of rows) out[row.key] = parseJson(row.value, {});
  return out;
  },
  async get(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
  return row ? parseJson(row.value, {}) : null;
  },
  async set(key, value) {
  const db = await getAdapter();
  db.run(
  `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
  ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
  [SCOPE, key, stringifyJson(value)]
  );
  },
  async remove(key) {
  const db = await getAdapter();
  db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
  },
  };
}

function toModel(callName, value) {
  if (!value || typeof value !== "object") return null;
  const target = typeof value.targetModel === "string" ? value.targetModel.trim() : "";
  if (!target || !target.includes("/")) return null;
  const firstSlash = target.indexOf("/");
  return {
  callName,
  displayName: (value.displayName || "").trim() || callName,
  targetModel: target,
   targetLabel: (value.targetLabel || value.targetModel || "").trim() || target,
  provider: target.slice(0, firstSlash),
  model: target.slice(firstSlash + 1),
  contextWindow: Number(value.contextWindow) || 0,
  systemPrompt: typeof value.systemPrompt === "string" ? value.systemPrompt : "",
  createdAt: value.createdAt || "",
  };
}

/** Studio models (keyed by their callable name), sorted by name. */
export async function getStudioModels() {
  const rows = await store().all();
  return Object.entries(rows)
  .filter(([key]) => !key.includes("|"))
  .map(([key, value]) => toModel(key, value))
  .filter(Boolean)
  .sort((a, b) => a.callName.localeCompare(b.callName));
}

/** One studio model by callable name, or null. */
export async function getStudioModel(callName) {
  if (!callName || callName.includes("|") || callName.includes("/")) return null;
  const value = await store().get(callName);
  return value ? toModel(callName, value) : null;
}

export async function setStudioModel({ callName, displayName, targetModel, targetLabel, contextWindow, systemPrompt }) {
  const payload = {
  callName,
  displayName: (displayName || "").trim(),
  targetModel: (targetModel || "").trim(),
   targetLabel: (targetLabel || targetModel || "").trim(),
  contextWindow: Number(contextWindow) || 0,
  systemPrompt: systemPrompt || "",
  createdAt: new Date().toISOString(),
  };
  await store().set(callName, payload);
  return toModel(callName, payload);
}

export async function deleteStudioModel(callName) {
  await store().remove(callName);
}

/** Legacy `{provider}|{model}` records only. */
export async function getModelOverrides() {
  const rows = await store().all();
  const out = {};
  for (const [key, value] of Object.entries(rows)) {
  if (key.includes("|")) out[key] = value;
  }
  return out;
}

export async function getModelOverride(key) {
  if (!key) return null;
  return await store().get(key);
}

export async function setModelOverride(key, data) {
  await store().set(key, data);
}

export async function deleteModelOverride(key) {
  await store().remove(key);
}
