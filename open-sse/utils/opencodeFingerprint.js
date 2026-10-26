/**
 * Helpers for the OpenCode free-tier client fingerprint.
 *
 * Live upstream probes (OpenCode v2, /inference/v1) show that free-tier
 * requests must declare OpenCode's own `read` and `shell` tools with their exact
 * descriptions and parameter schemas; stubbed descriptions, renamed schemas or
 * tool_choice "none" are answered with 403 FreeTierError. Caller tools are sent
 * untouched, except one that already uses an exact fingerprint name with a
 * different definition: it travels under an alias and the response side
 * restores the caller's original name.
 */

/** Names required by the upstream free-tier gate. */
export const OPENCODE_FINGERPRINT_TOOLS = ["read", "shell"];

// Verbatim from the OpenCode v2.0.26 CLI. Upstream compares description and
// parameters, so do not reword or reformat these.
const FINGERPRINT_TOOL_DEFINITIONS = {
  read: {
    description: "Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory to read" },
        offset: { type: "integer", minimum: 0, description: "The line or directory entry to start reading from (1-based)" },
        limit: { type: "integer", minimum: 0, description: "The maximum number of lines or directory entries to read (defaults to and capped at 2000)" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  shell: {
    description: "Execute a shell command and return its output. Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command string to execute" },
        workdir: { type: "string", description: "Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead." },
        timeout: { type: "integer", minimum: 0, description: "Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default." },
        background: { type: "boolean", description: "Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion." },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

// Request body -> names renamed for that request. transformRequest() mutates the
// same body object that chatCore passed into the executor, so a WeakMap keeps the
// mapping request-local without putting transport metadata on the wire.
const renamedToolNames = new WeakMap();

/** The fingerprint name when `name` is exactly one; "" otherwise. */
export function fingerprintToolKey(name) {
  const trimmed = String(name ?? "").trim();
  return OPENCODE_FINGERPRINT_TOOLS.includes(trimmed) ? trimmed : "";
}

/** Read a tool name from either flat ({name}) or chat ({function:{name}}) shape. */
function toolNameOf(tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return "";
  if (typeof tool.name === "string" && tool.name.trim()) return tool.name.trim();
  const fn = tool.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    return fn.name.trim();
  }
  return "";
}

function chatFunctionOf(tool) {
  const fn = tool?.function;
  return fn && typeof fn === "object" && !Array.isArray(fn) ? fn : null;
}

/** True when `tool` already carries OpenCode's exact definition for `key`. */
function isFingerprintDefinition(tool, key) {
  const def = tool && (chatFunctionOf(tool) || tool);
  const want = FINGERPRINT_TOOL_DEFINITIONS[key];
  return !!def && def.description === want.description
    && JSON.stringify(def.parameters) === JSON.stringify(want.parameters);
}

function withToolName(tool, name) {
  const fn = chatFunctionOf(tool);
  return fn ? { ...tool, function: { ...fn, name } } : { ...tool, name };
}

/**
 * Move caller tools off the fingerprint names when their definition differs
 * from OpenCode's, so the exact definitions can be appended without a
 * duplicate name. Everything else, including case variants such as `Read`, is
 * preserved verbatim; upstream accepts them alongside `read`.
 *
 * @param {Array} tools
 * @returns {{ tools: Array, map: Map<string,string> }} map: sent name -> original name
 */
export function concealFingerprintToolNames(tools) {
  const map = new Map();
  if (!Array.isArray(tools) || tools.length === 0) return { tools, map };

  const taken = new Set(tools.map(toolNameOf));
  const seen = new Set();
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      out.push(tool);
      continue;
    }

    const key = fingerprintToolKey(toolNameOf(tool));
    if (!key) {
      out.push(tool);
      continue;
    }

    // Duplicate declarations of one name are rejected upstream; keep the first.
    if (seen.has(key)) continue;
    seen.add(key);

    if (isFingerprintDefinition(tool, key)) {
      out.push(tool);
      continue;
    }

    let alias = `${key}_client`;
    for (let i = 2; taken.has(alias); i++) alias = `${key}_client${i}`;
    taken.add(alias);
    map.set(alias, key);
    out.push(withToolName(tool, alias));
  }
  return { tools: out, map };
}

/**
 * Append OpenCode's definition for each fingerprint tool not already declared.
 *
 * @returns {string[]} names that were appended
 */
export function appendMissingFingerprintTools(tools, flat) {
  const appended = [];
  if (!Array.isArray(tools)) return appended;
  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    if (tools.some((tool) => fingerprintToolKey(toolNameOf(tool)) === name)) continue;
    const { description, parameters } = FINGERPRINT_TOOL_DEFINITIONS[name];
    tools.push(flat
      ? { type: "function", name, description, parameters, strict: false }
      : { type: "function", function: { name, description, parameters } });
    appended.push(name);
  }
  return appended;
}

/** Invert a sent -> original rename map. */
function aliasesByOriginal(map) {
  return new Map([...map].map(([alias, original]) => [original, alias]));
}

/** Point an explicit tool_choice at the alias of a concealed caller tool. */
export function retargetToolChoice(body, map) {
  if (!body || typeof body !== "object" || !map?.size) return;
  const choice = body.tool_choice;
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return;
  const aliases = aliasesByOriginal(map);

  if (typeof choice.name === "string") {
    const alias = aliases.get(choice.name.trim());
    if (alias) body.tool_choice = { ...choice, name: alias };
    return;
  }

  const fn = choice.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    const alias = aliases.get(fn.name.trim());
    if (alias) body.tool_choice = { ...choice, function: { ...fn, name: alias } };
  }
}

/**
 * Rename prior-turn calls to concealed caller tools as well; otherwise the model
 * reads its own earlier calls as calls to OpenCode's tool of the same name.
 */
export function aliasHistoryToolCalls(body, map) {
  if (!body || typeof body !== "object" || !map?.size) return;
  const aliases = aliasesByOriginal(map);

  if (Array.isArray(body.input)) {
    body.input = body.input.map((item) =>
      item?.type === "function_call" && aliases.has(item.name)
        ? { ...item, name: aliases.get(item.name) }
        : item);
  }

  if (Array.isArray(body.messages)) {
    body.messages = body.messages.map((msg) => {
      if (!Array.isArray(msg?.tool_calls)) return msg;
      return {
        ...msg,
        tool_calls: msg.tool_calls.map((call) =>
          aliases.has(call?.function?.name)
            ? { ...call, function: { ...call.function, name: aliases.get(call.function.name) } }
            : call),
      };
    });
  }
}

// Telltale prompt injection ("Do not call the read or shell tools...") is flagged
// by upstream OpenCode filters as third-party relay and answered with 429 FreeUsageLimitError.
// Keep this a no-op so the prompt remains pristine.
function noteUnavailableTools() {}

/**
 * Full request-side pass: alias conflicting caller tools, append OpenCode's
 * fingerprint definitions, and tell the model the appended ones are off-limits.
 *
 * @param {object} body
 * @param {boolean} flat - true for Responses tools ({name}), false for chat tools
 * @returns {Map<string,string>} map: sent name -> original name
 */
export function applyFingerprintTools(body, flat) {
  if (!body || typeof body !== "object") return new Map();

  const { tools, map } = concealFingerprintToolNames(body.tools);
  body.tools = Array.isArray(tools) ? tools : [];
  const appended = appendMissingFingerprintTools(body.tools, flat);
  retargetToolChoice(body, map);
  aliasHistoryToolCalls(body, map);

  // Responses keeps its explicit auto default. Never default to "none": upstream
  // answers tool_choice "none" with 403 FreeTierError.
  if (!body.tool_choice && flat) body.tool_choice = "auto";

  recordRenamedToolNames(body, map);
  return map;
}

/** Store the rename map for `body`. */
export function recordRenamedToolNames(body, map) {
  if (!body || typeof body !== "object" || !map?.size) return;
  renamedToolNames.set(body, map);
}

/** Retrieve the rename map for `body`. */
export function takeRenamedToolNames(body) {
  if (!body || typeof body !== "object") return null;
  return renamedToolNames.get(body) || null;
}

export const OPENCODE_ENV_MARKER =
  "<env>\n  Working directory: /workspace\n  Workspace root folder: /workspace\n</env>";

const ENV_BLOCK_RE = /<env>([\s\S]*?)<\/env>/;
const ENV_WORKDIR_RE = /Working directory:[^\n]*/i;
const ENV_ROOT_RE = /Workspace root folder:[^\n]*/i;

export function hasCompleteEnvBlock(value) {
  if (typeof value !== "string") return false;
  const match = value.match(ENV_BLOCK_RE);
  if (!match) return false;
  const inner = match[1];
  return ENV_WORKDIR_RE.test(inner) && ENV_ROOT_RE.test(inner);
}

export function upgradeEnvBlock(text) {
  if (typeof text !== "string") return text;
  return text.replace(ENV_BLOCK_RE, (block, inner) => {
    const hasWorkdir = ENV_WORKDIR_RE.test(inner);
    const hasRoot = ENV_ROOT_RE.test(inner);
    if (hasWorkdir && hasRoot) return block;

    let upgraded = inner;
    if (!hasWorkdir && !hasRoot) {
      upgraded = `\n  Working directory: /workspace\n  Workspace root folder: /workspace\n`;
    } else if (!hasRoot) {
      upgraded = ENV_WORKDIR_RE.test(upgraded)
        ? upgraded.replace(ENV_WORKDIR_RE, (line) => `${line}\n  Workspace root folder: /workspace`)
        : `${upgraded.replace(/\s*$/, "")}\n  Workspace root folder: /workspace\n`;
    } else if (!hasWorkdir) {
      upgraded = ENV_ROOT_RE.test(upgraded)
        ? upgraded.replace(ENV_ROOT_RE, (line) => `  Working directory: /workspace\n${line}`)
        : `\n  Working directory: /workspace\n${upgraded}`;
    }
    return `<env>${upgraded}</env>`;
  });
}

export function withEnvMarker(value) {
  const text = typeof value === "string" ? value : "";
  if (hasCompleteEnvBlock(text)) return text;
  if (ENV_BLOCK_RE.test(text)) return upgradeEnvBlock(text);
  return text.trim() ? `${text}\n\n${OPENCODE_ENV_MARKER}` : OPENCODE_ENV_MARKER;
}

export function applyFingerprintSystemPrompt(body) {
  if (!body || typeof body !== "object") return;

  if (body.system !== undefined) {
    if (typeof body.system === "string") {
      body.system = withEnvMarker(body.system);
    } else if (Array.isArray(body.system)) {
      const marked = body.system.some((block) => {
        const text = typeof block === "string" ? block : block?.text;
        return hasCompleteEnvBlock(text);
      });
      if (!marked) {
        let upgradedAny = false;
        const newSystem = body.system.map((block) => {
          if (typeof block === "string") {
            if (ENV_BLOCK_RE.test(block)) {
              upgradedAny = true;
              return upgradeEnvBlock(block);
            }
          } else if (block && typeof block === "object" && typeof block.text === "string") {
            if (ENV_BLOCK_RE.test(block.text)) {
              upgradedAny = true;
              return { ...block, text: upgradeEnvBlock(block.text) };
            }
          }
          return block;
        });

        if (upgradedAny) {
          body.system = newSystem;
        } else {
          body.system = [...body.system, { type: "text", text: OPENCODE_ENV_MARKER }];
        }
      }
    }
    return;
  }

  if (body.instructions !== undefined) {
    if (typeof body.instructions === "string") {
      body.instructions = withEnvMarker(body.instructions);
    }
    return;
  }

  if (!Array.isArray(body.messages)) return;

  const first = body.messages[0];
  if (first?.role === "system") {
    if (typeof first.content === "string") {
      body.messages = [{ ...first, content: withEnvMarker(first.content) }, ...body.messages.slice(1)];
      return;
    }
    if (Array.isArray(first.content)) {
      const marked = first.content.some((part) => hasCompleteEnvBlock(part?.text));
      if (!marked) {
        let upgradedAny = false;
        const newContent = first.content.map((part) => {
          if (part && typeof part === "object" && typeof part.text === "string" && ENV_BLOCK_RE.test(part.text)) {
            upgradedAny = true;
            return { ...part, text: upgradeEnvBlock(part.text) };
          }
          return part;
        });
        if (upgradedAny) {
          body.messages = [{ ...first, content: newContent }, ...body.messages.slice(1)];
        } else {
          body.messages = [
            { ...first, content: [...first.content, { type: "text", text: OPENCODE_ENV_MARKER }] },
            ...body.messages.slice(1),
          ];
        }
      }
      return;
    }
  }
}

// Response side -------------------------------------------------------------

/** Restore caller tool spellings in supported response/event shapes. */
export function restoreToolNames(payload, map) {
  if (!map?.size || !payload) return payload;
  if (Array.isArray(payload)) return payload.map((item) => restoreToolNames(item, map));
  if (typeof payload !== "object") return payload;

  let out = payload;
  const put = (key, value) => {
    if (out === payload) out = { ...payload };
    out[key] = value;
  };

  // Claude streaming content_block_start event.
  if (payload.type === "content_block_start") {
    const block = payload.content_block;
    if (block?.type === "tool_use" && typeof block.name === "string" && map.has(block.name)) {
      put("content_block", { ...block, name: map.get(block.name) });
    }
  }

  // Claude non-streaming message body.
  if (Array.isArray(payload.content)) {
    put("content", payload.content.map((block) =>
      block?.type === "tool_use" && typeof block.name === "string" && map.has(block.name)
        ? { ...block, name: map.get(block.name) }
        : block));
  }

  // OpenAI Chat Completions, both streaming delta and JSON message shapes.
  if (Array.isArray(payload.choices)) {
    put("choices", payload.choices.map((choice) => {
      let changed = false;
      const next = { ...choice };
      for (const holder of ["delta", "message"]) {
        const value = choice?.[holder];
        if (!value || !Array.isArray(value.tool_calls) || value.tool_calls.length === 0) continue;
        const calls = value.tool_calls.map((call) => {
          const name = call?.function?.name;
          if (typeof name === "string" && map.has(name)) {
            changed = true;
            return { ...call, function: { ...call.function, name: map.get(name) } };
          }
          return call;
        });
        next[holder] = { ...value, tool_calls: calls };
      }
      return changed ? next : choice;
    }));
  }

  // OpenAI Responses final JSON body.
  if (Array.isArray(payload.output)) {
    put("output", payload.output.map((item) =>
      item?.type === "function_call" && typeof item.name === "string" && map.has(item.name)
        ? { ...item, name: map.get(item.name) }
        : item));
  }

  // OpenAI Responses SSE events such as response.output_item.added/done.
  const item = payload.item;
  if (item?.type === "function_call" && typeof item.name === "string" && map.has(item.name)) {
    put("item", { ...item, name: map.get(item.name) });
  }

  return out;
}
