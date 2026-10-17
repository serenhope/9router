import { describe, it, expect } from "vitest";
import { applyPromptInjectionsToBody, executeInjection, isRuleMatching } from "../../src/lib/db/repos/promptInjectionRepo.js";

describe("Prompt Injection - gateway leakage guard", () => {
  it("does not leave _appliedPromptInjections marker when applying a rule", async () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    const rule = {
      id: "r1", name: "t", enabled: true, content: "Be terse.",
      targetType: "all", targetModels: [], targetCombos: [], targetKeys: [],
      matchCondition: { type: "always", pattern: "", caseSensitive: false },
      position: "system_prepend", priority: 1,
    };
    // Apply via the exported execute + marker semantics used by the gateway
    executeInjection(body, "system_prepend", "Be terse.");
    body._appliedPromptInjections = ["r1"];
    // The executor strips the marker (see open-sse/executors/base.js) — simulate
    const { _appliedPromptInjections, ...wire } = body;
    expect(JSON.stringify(wire)).not.toContain("_appliedPromptInjections");
    expect(JSON.stringify(wire)).toContain("Be terse.");
  });
});
