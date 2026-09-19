import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { getThinkingLevels } from "../providers/thinkingLevels.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";

const OPENCODE_UA = "opencode/1.18.30";
// Models served by /zen/v1/responses; every other model stays on /chat/completions.
const RESPONSES_MODELS = new Set([
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
]);

let _lt = 0;
let _cnt = 0;
const _b62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateOpenCodeId(desc, now = Date.now()) {
  if (now !== _lt) {
    _lt = now;
    _cnt = 0;
  }
  _cnt++;
  const val = BigInt(now) * 4096n + BigInt(_cnt);
  const a = desc ? ~val : val;
  let hex = "";
  for (let i = 0; i < 6; i++) {
    hex += Number((a >> BigInt(40 - 8 * i)) & 255n).toString(16).padStart(2, "0");
  }
  const rb = crypto.randomBytes(14);
  let rs = "";
  for (let i = 0; i < 14; i++) {
    rs += _b62[rb[i] % 62];
  }
  return hex + rs;
}

function generateRequestId() {
  return `msg_${generateOpenCodeId(false)}`;
}

function generateSessionId() {
  return `ses_${generateOpenCodeId(true)}`;
}

// Strip the thinking suffix "model(level)" so registry lookups hit the base id.
function baseModelId(model) {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
}

function isResponsesModel(model) {
  const base = baseModelId(model);
  return RESPONSES_MODELS.has(base) || isMuseSparkModel(base);
}

function resolveOpencodeSession(body, credentials) {
  const headers = credentials?.rawHeaders || {};
  return resolveSessionId({
    headers,
    body,
    connectionId: credentials?.connectionId,
    scope: "opencode",
    generate: generateSessionId,
  });
}

function normalizeOpencodeReasoning(model, body) {
  const current = body.reasoning;
  const currentReasoning = current && typeof current === "object" && !Array.isArray(current)
    ? current
    : null;
  const requestedEffort = typeof body.reasoning_effort === "string"
    ? body.reasoning_effort
    : currentReasoning?.effort;
  if (typeof requestedEffort !== "string") return;

  const cleanModel = baseModelId(model || body.model);
  const supportedLevels = getThinkingLevels("opencode", cleanModel);
  let effort = requestedEffort.toLowerCase().trim();
  if ((effort === "max" || effort === "ultra") && supportedLevels?.length && !supportedLevels.includes(effort)) {
    if (effort === "ultra" && supportedLevels.includes("max")) effort = "max";
    else if (supportedLevels.includes("xhigh")) effort = "xhigh";
  }

  body.reasoning = { ...currentReasoning, effort };
  if (!body.reasoning.summary) body.reasoning.summary = "auto";
  delete body.reasoning_effort;
}

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
    this._currentSessionId = null;
  }

  transformRequest(model, body, stream, credentials) {
    this._currentSessionId = resolveOpencodeSession(body, credentials);
    if (isResponsesModel(model)) {
      // Responses API names the output cap max_output_tokens and takes thinking
      // as reasoning:{effort,summary} — normalize the Chat fields at this boundary.
      if (body.max_output_tokens === undefined) {
        if (body.max_completion_tokens !== undefined) body.max_output_tokens = body.max_completion_tokens;
        else if (body.max_tokens !== undefined) body.max_output_tokens = body.max_tokens;
      }
      delete body.max_tokens;
      delete body.max_completion_tokens;
      normalizeOpencodeReasoning(model, body);
    }
    // Free-tier request contract: upstream /zen/v1 answers 403 FreeTierError
    // unless the body carries stream:true AND a tools array containing the core
    // OpenCode tool pair bash+read (measured live 2026-09-19: bash+read → 200
    // on every surface/model; read-only, bash-only, or placeholder-only → 403).
    // The official client always sends these; a proxied request may not.
    body.stream = true;
    const tools = Array.isArray(body.tools) ? body.tools : [];
    const names = new Set(tools.map((t) => t?.name ?? t?.function?.name));
    const isResponses = isResponsesModel(model) || body.input;
    const coreTools = isResponses
      ? [
          // Responses surface (/zen/v1/responses) takes the flat function shape.
          { type: "function", name: "bash", description: "Run a bash command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
          { type: "function", name: "read", description: "Read a file", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } },
        ]
      : body.messages
        ? [
            // Chat completions surface (/zen/v1/chat/completions) nests the function.
            { type: "function", function: { name: "bash", description: "Run a bash command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
            { type: "function", function: { name: "read", description: "Read a file", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } } },
          ]
        : [
            // Claude surface (/zen/v1/messages, union-alpha) takes input_schema.
            { name: "bash", description: "Run a bash command", input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
            { name: "read", description: "Read a file", input_schema: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } },
          ];
    for (const tool of coreTools) {
      const name = tool.name ?? tool.function?.name;
      if (!names.has(name)) tools.push(tool);
    }
    body.tools = tools;
    return injectReasoningContent({ provider: this.provider, model, body });
  }

  buildUrl(model) {
    const base = this.config.baseUrl;
    const cleanModel = baseModelId(model);
    if (isResponsesModel(model)) {
      return `${base}/zen/v1/responses`;
    }
    if (cleanModel === "union-alpha" || cleanModel === "union-alpha-free") {
      return `${base}/zen/v1/messages`;
    }
    return `${base}/zen/v1/chat/completions`;
  }

  buildHeaders(credentials, stream = true) {
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;

    const downstreamUa = lower["user-agent"] || "";
    const isOpencodeDownstream = downstreamUa.toLowerCase().includes("opencode");
    const auth = credentials?.apiKey ? `Bearer ${credentials.apiKey}` : "Bearer public";

    return {
      "Content-Type": "application/json",
      "Authorization": auth,
      "anthropic-version": "2023-06-01",
      "User-Agent": isOpencodeDownstream ? downstreamUa : "opencode/1.18.30",
      "x-opencode-client": lower["x-opencode-client"] || "desktop",
      "x-opencode-session": lower["x-opencode-session"] || this._currentSessionId || generateSessionId(),
      "x-opencode-request": lower["x-opencode-request"] || generateRequestId(),
      "x-opencode-project": lower["x-opencode-project"] || "global",
      "Accept": stream ? "text/event-stream" : "*/*",
    };
  }
}
