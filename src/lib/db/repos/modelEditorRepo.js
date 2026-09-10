import { getAdapter } from "../driver.js";
import { stringifyJson, parseJson } from "../helpers/jsonCol.js";

// modelOverrides: key = `{providerNodeId}|{modelId}`, value = { targetModel, contextWindow, systemPrompt, name }
export async function getModelOverrides() {
  const db = await getAdapter();
  const rows = db.all(`SELECT key, value FROM kv WHERE scope = 'modelOverrides'`);
  const result = {};
  for (const row of rows) {
    result[row.key] = parseJson(row.value, {});
  }
  return result;
}

export async function getModelOverride(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = 'modelOverrides' AND key = ?`, [key]);
  return row ? parseJson(row.value, {}) : null;
}

export async function setModelOverride(key, data) {
  const db = await getAdapter();
  db.run(
    `INSERT INTO kv(scope, key, value) VALUES('modelOverrides', ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [key, stringifyJson(data)]
  );
}

export async function deleteModelOverride(key) {
  const db = await getAdapter();
  db.run(`DELETE FROM kv WHERE scope = 'modelOverrides' AND key = ?`, [key]);
}
