import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A custom model is its own model: the name is what callers and the dashboards see,
// the base model behind it stays internal.
const originalDataDir = process.env.DATA_DIR;

let ctx;

beforeEach(async () => {
 const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-studio-naming-"));
 process.env.DATA_DIR = tempDir;
 vi.resetModules();
 const db = await import("@/lib/db/index.js");
 const editor = await import("@/lib/db/repos/modelEditorRepo.js");
 const node = await db.createProviderNode({
 name: "Oss Node", type: "openai-compatible", prefix: "ossnode", apiType: "chat", baseUrl: "https://upstream.test/v1",
 });
 ctx = { db, editor, nodeId: node.id, tempDir };
}, 60_000);

afterEach(() => {
 fs.rmSync(ctx.tempDir, { recursive: true, force: true });
 if (originalDataDir === undefined) delete process.env.DATA_DIR;
 else process.env.DATA_DIR = originalDataDir;
});

async function addStudio(callName, targetModel) {
 await ctx.editor.setStudioModel({
 callName, displayName: "", targetModel, targetLabel: targetModel, contextWindow: 0, systemPrompt: "",
 });
}

describe("custom model resolution", () => {
 it("resolves a target typed with a node prefix to that node", async () => {
 await addStudio("claude-sonnet-5", "ossnode/gpt-oss-120b");
 const { getModelInfo } = await import("@/sse/services/model.js");
 expect(await getModelInfo("claude-sonnet-5")).toEqual({ provider: ctx.nodeId, model: "gpt-oss-120b" });
 });

 it("resolves a target typed as a resolved connection id", async () => {
 await addStudio("claude-sonnet-5", `${ctx.nodeId}/gpt-oss-120b`);
 const { getModelInfo } = await import("@/sse/services/model.js");
 expect(await getModelInfo("claude-sonnet-5")).toEqual({ provider: ctx.nodeId, model: "gpt-oss-120b" });
 });

 it("stops chaining custom names instead of looping forever", async () => {
 await addStudio("loop-a", "ossnode/loop-b");
 await addStudio("loop-b", "ossnode/loop-a");
 const { getModelInfo } = await import("@/sse/services/model.js");
 // A cycle has to fall through to the plain resolver rather than blow the stack.
 expect(await getModelInfo("loop-a")).toBeTruthy();
 });
});

describe("usage naming", () => {
 it("bills a custom name under that name and records the base model beside it", async () => {
 const { saveRequestUsage, getUsageHistory } = await import("@/lib/db/repos/usageRepo.js");
 await saveRequestUsage({
 provider: ctx.nodeId,
 model: "gpt-oss-120b",
 requestedModel: "claude-sonnet-5",
 tokens: { prompt_tokens: 5, completion_tokens: 7 },
 timestamp: new Date().toISOString(),
 });
 const rows = await getUsageHistory({ limit: 5 });
 const row = rows.find((r) => r.model === "claude-sonnet-5");
 expect(row).toBeDefined();
 expect(row.resolvedModel).toBe("gpt-oss-120b");
 expect(rows.some((r) => r.model === "gpt-oss-120b")).toBe(false);
 });

 it("keeps an ordinary call named exactly as it was made", async () => {
 const { saveRequestUsage, getUsageHistory } = await import("@/lib/db/repos/usageRepo.js");
 await saveRequestUsage({
 provider: ctx.nodeId,
 model: "gpt-oss-120b",
 tokens: { prompt_tokens: 2, completion_tokens: 3 },
 timestamp: new Date().toISOString(),
 });
 const rows = await getUsageHistory({ limit: 5 });
 expect(rows.some((r) => r.model === "gpt-oss-120b")).toBe(true);
 });
});

describe("response naming", () => {
 it("answers with the name the caller spoke", async () => {
 const { applyModelAlias, calledModelName } = await import("open-sse/utils/modelAlias.js");
 expect(calledModelName("claude-sonnet-5", "gpt-oss-120b")).toBe("claude-sonnet-5");
 expect(calledModelName("gpt-oss-120b", "gpt-oss-120b")).toBeNull();
// the helper mutates in place and reports whether anything changed
 const chunk = { choices: [], model: "gpt-oss-120b" };
 expect(applyModelAlias(chunk, "claude-sonnet-5")).toBe(true);
 expect(chunk.model).toBe("claude-sonnet-5");
 expect(applyModelAlias(chunk, "claude-sonnet-5")).toBe(false);
 const claude = { type: "message_start", message: { model: "gpt-oss-120b" } };
 applyModelAlias(claude, "claude-sonnet-5");
 expect(claude.message.model).toBe("claude-sonnet-5");
 expect(applyModelAlias({ model: "x" }, null)).toBe(false);
 });
});
