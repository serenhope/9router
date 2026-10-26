import { describe, it, expect } from "vitest";
import {
  applyFingerprintTools,
  concealFingerprintToolNames,
  appendMissingFingerprintTools,
  fingerprintToolKey,
  restoreToolNames,
  takeRenamedToolNames,
  OPENCODE_FINGERPRINT_TOOLS,
  hasCompleteEnvBlock,
  upgradeEnvBlock,
  withEnvMarker,
  applyFingerprintSystemPrompt,
  OPENCODE_ENV_MARKER,
} from "open-sse/utils/opencodeFingerprint.js";

const CC_TOOLS = ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", "WebFetch"];
const flat = (names) => names.map((name) => ({ type: "function", name }));
const chat = (names) => names.map((name) => ({ type: "function", function: { name } }));
const namesOf = (tools) => tools.map((tool) => tool.name ?? tool.function?.name);

describe("opencodeFingerprint — request side", () => {
  it("appends exact read/shell definitions and leaves case variants untouched", () => {
    const body = { tools: flat(CC_TOOLS) };
    const map = applyFingerprintTools(body, true);

    expect(namesOf(body.tools)).toEqual([...CC_TOOLS, ...OPENCODE_FINGERPRINT_TOOLS]);
    expect(map.size).toBe(0);
    const shell = body.tools.find((tool) => tool.name === "shell");
    expect(shell.description).toMatch(/^Execute a shell command/);
    expect(shell.parameters.required).toEqual(["command"]);
    expect(shell.strict).toBe(false);
  });

  it("handles the nested chat shape without dropping .function", () => {
    const body = { tools: chat(["Edit"]) };
    applyFingerprintTools(body, false);

    expect(namesOf(body.tools)).toEqual(["Edit", "read", "shell"]);
    const read = body.tools.find((tool) => tool.function?.name === "read");
    expect(read.function.parameters.required).toEqual(["path"]);
  });

  it("aliases a caller tool that reuses an exact fingerprint name", () => {
    const body = { tools: flat(["read", "read_client", "Edit"]) };
    const map = applyFingerprintTools(body, true);

    expect(namesOf(body.tools)).toEqual(["read_client2", "read_client", "Edit", "read", "shell"]);
    expect(map.get("read_client2")).toBe("read");
  });

  it("keeps a caller tool that already carries OpenCode's exact definition", () => {
    const first = { tools: [] };
    applyFingerprintTools(first, true);
    const official = first.tools.map((tool) => ({ ...tool }));

    const body = { tools: official };
    const map = applyFingerprintTools(body, true);
    expect(namesOf(body.tools)).toEqual(OPENCODE_FINGERPRINT_TOOLS);
    expect(map.size).toBe(0);
    expect(body.instructions).toBeUndefined();
  });

  it("drops duplicate declarations of one fingerprint name", () => {
    const body = { tools: flat(["shell", "shell"]) };
    applyFingerprintTools(body, true);
    expect(namesOf(body.tools)).toEqual(["shell_client", "read", "shell"]);
  });

  it("defaults Responses tool_choice to auto and never to none for chat", () => {
    const responses = { tools: [] };
    applyFingerprintTools(responses, true);
    expect(responses.tool_choice).toBe("auto");

    const chatBody = { messages: [{ role: "user", content: "hi" }] };
    applyFingerprintTools(chatBody, false);
    expect(namesOf(chatBody.tools)).toEqual(OPENCODE_FINGERPRINT_TOOLS);
    expect(chatBody.tool_choice).toBeUndefined();
  });

  it("keeps instructions and system prompt clean without telltale placeholder notes", () => {
    const responses = { instructions: "Be brief.", tools: [] };
    applyFingerprintTools(responses, true);
    expect(responses.instructions).toBe("Be brief.");

    const chatBody = { messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }] };
    applyFingerprintTools(chatBody, false);
    expect(chatBody.messages).toHaveLength(2);
    expect(chatBody.messages[0].content).toBe("Be brief.");

    const noSystem = { messages: [{ role: "user", content: "hi" }] };
    applyFingerprintTools(noSystem, false);
    expect(noSystem.messages).toEqual([{ role: "user", content: "hi" }]);

    const claudeShape = { system: "Be brief.", messages: [{ role: "user", content: "hi" }] };
    applyFingerprintTools(claudeShape, false);
    expect(claudeShape.messages).toHaveLength(1);
  });

  it("retargets flat tool_choice that points at an aliased tool", () => {
    const body = { tools: flat(["shell"]), tool_choice: { type: "function", name: "shell" } };
    applyFingerprintTools(body, true);
    expect(body.tool_choice.name).toBe("shell_client");
  });

  it("retargets nested tool_choice that points at an aliased tool", () => {
    const body = {
      tools: chat(["read"]),
      tool_choice: { type: "function", function: { name: "read" } },
    };
    applyFingerprintTools(body, false);
    expect(body.tool_choice.function.name).toBe("read_client");
  });

  it("records the rename map against the body for the response side", () => {
    const body = { tools: flat(["read"]) };
    const map = applyFingerprintTools(body, true);
    expect(takeRenamedToolNames(body)).toBe(map);
  });

  it("never throws on malformed tools", () => {
    for (const tools of [null, undefined, "nope", [null, 42, []], [{}, { name: "" }]]) {
      expect(() => concealFingerprintToolNames(tools)).not.toThrow();
      expect(() => appendMissingFingerprintTools(tools, true)).not.toThrow();
    }
  });
});

describe("opencodeFingerprint — response side", () => {
  const map = new Map([["bash", "Bash"], ["grep", "Grep"], ["read", "Read"]]);

  it("restores names in Claude content_block_start chunks", () => {
    const chunk = {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "bash", id: "t1" },
    };
    const out = restoreToolNames(chunk, map);

    expect(out.content_block.name).toBe("Bash");
    expect(chunk.content_block.name).toBe("bash");
  });

  it("recursively restores streaming chunks inside arrays", () => {
    const chunks = [{
      choices: [{ delta: { tool_calls: [{ function: { name: "grep", arguments: "{}" } }] } }],
    }];
    const out = restoreToolNames(chunks, map);
    expect(out[0].choices[0].delta.tool_calls[0].function.name).toBe("Grep");
  });

  it("restores names in Claude non-streaming bodies", () => {
    const body = { type: "message", content: [{ type: "tool_use", name: "bash", input: {} }] };
    expect(restoreToolNames(body, map).content[0].name).toBe("Bash");
  });

  it("restores names in Chat Completions message and delta shapes", () => {
    const body = {
      choices: [
        { message: { tool_calls: [{ function: { name: "grep", arguments: "{}" } }] } },
        { delta: { tool_calls: [{ function: { name: "read", arguments: "{}" } }] } },
      ],
    };
    const out = restoreToolNames(body, map);

    expect(out.choices[0].message.tool_calls[0].function.name).toBe("Grep");
    expect(out.choices[1].delta.tool_calls[0].function.name).toBe("Read");
  });

  it("restores names in Responses final output items", () => {
    const body = { output: [{ type: "function_call", name: "bash", call_id: "c1" }] };
    expect(restoreToolNames(body, map).output[0].name).toBe("Bash");
  });

  it("restores names in Responses streaming output_item events", () => {
    const event = {
      type: "response.output_item.added",
      item: { type: "function_call", name: "read", call_id: "c1" },
    };
    expect(restoreToolNames(event, map).item.name).toBe("Read");
  });

  it("is a no-op without a map or with an empty map", () => {
    const body = { choices: [{ message: { tool_calls: [{ function: { name: "bash" } }] } }] };
    expect(restoreToolNames(body, null)).toBe(body);
    expect(restoreToolNames(body, new Map())).toBe(body);
  });

  it("leaves unknown tool names untouched", () => {
    const body = { output: [{ type: "function_call", name: "Edit" }] };
    expect(restoreToolNames(body, map).output[0].name).toBe("Edit");
  });
});

describe("fingerprintToolKey", () => {
  it("matches exact fingerprint names only", () => {
    expect(fingerprintToolKey("read")).toBe("read");
    expect(fingerprintToolKey(" shell ")).toBe("shell");
    expect(fingerprintToolKey("Read")).toBe("");
    expect(fingerprintToolKey("bash")).toBe("");
    expect(fingerprintToolKey("terminal")).toBe("");
    expect(fingerprintToolKey(null)).toBe("");
  });
});

describe("opencodeFingerprint — env block fingerprinting", () => {
  it("detects complete and incomplete env blocks", () => {
    expect(hasCompleteEnvBlock(OPENCODE_ENV_MARKER)).toBe(true);
    expect(hasCompleteEnvBlock("<env>\n  Working directory: /workspace\n</env>")).toBe(false);
    expect(hasCompleteEnvBlock("<env>\n  Workspace root folder: /workspace\n</env>")).toBe(false);
    expect(hasCompleteEnvBlock("no env block")).toBe(false);
  });

  it("idempotently upgrades partial env block with both directory lines", () => {
    const partial = "<env>\n  Working directory: /workspace\n</env>";
    const upgraded = upgradeEnvBlock(partial);
    expect(hasCompleteEnvBlock(upgraded)).toBe(true);
    expect(upgraded).toContain("Working directory: /workspace");
    expect(upgraded).toContain("Workspace root folder: /workspace");
    // Idempotent: upgrading again produces identical string
    expect(upgradeEnvBlock(upgraded)).toBe(upgraded);
  });

  it("upgrades Anthropic system string idempotently", () => {
    const body = { system: "You are a helpful assistant.\n<env>\n  Working directory: /workspace\n</env>" };
    applyFingerprintSystemPrompt(body);
    expect(hasCompleteEnvBlock(body.system)).toBe(true);
    expect(body.system).toContain("You are a helpful assistant.");
    const firstRun = body.system;
    applyFingerprintSystemPrompt(body);
    expect(body.system).toBe(firstRun);
  });

  it("upgrades Anthropic system block array idempotently", () => {
    const body = {
      system: [
        { type: "text", text: "You are an assistant." },
        { type: "text", text: "<env>\n  Working directory: /workspace\n</env>" },
      ],
    };
    applyFingerprintSystemPrompt(body);
    expect(hasCompleteEnvBlock(body.system[1].text)).toBe(true);
    const count = body.system.length;
    applyFingerprintSystemPrompt(body);
    expect(body.system.length).toBe(count);
  });

  it("upgrades OpenAI messages system prompt idempotently", () => {
    const body = {
      messages: [
        { role: "system", content: "System instructions.\n<env>\n  Working directory: /workspace\n</env>" },
        { role: "user", content: "Hello" },
      ],
    };
    applyFingerprintSystemPrompt(body);
    expect(hasCompleteEnvBlock(body.messages[0].content)).toBe(true);
    const firstContent = body.messages[0].content;
    applyFingerprintSystemPrompt(body);
    expect(body.messages[0].content).toBe(firstContent);
  });

  it("upgrades Responses API instructions idempotently", () => {
    const body = {
      instructions: "Instructions.\n<env>\n  Working directory: /workspace\n</env>",
    };
    applyFingerprintSystemPrompt(body);
    expect(hasCompleteEnvBlock(body.instructions)).toBe(true);
    const firstInst = body.instructions;
    applyFingerprintSystemPrompt(body);
    expect(body.instructions).toBe(firstInst);
  });
});
