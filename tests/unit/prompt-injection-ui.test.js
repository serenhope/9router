import { describe, it, expect } from "vitest";
import {
  PRESET_TEMPLATES,
  POSITION_LABELS,
  TARGET_TYPE_LABELS,
  CONDITION_TYPES,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  VARIABLE_CHIPS,
  POPULAR_MODELS,
} from "../../src/app/(dashboard)/dashboard/prompt-injection/constants/promptConstants.js";
import { BUILTIN_TEST_CASES } from "../../src/app/(dashboard)/dashboard/prompt-injection/hooks/usePlaygroundSimulator.js";

describe("Prompt Injection UI Constants & Templates Contract", () => {
  it("validates all preset templates have required properties", () => {
    expect(PRESET_TEMPLATES.length).toBeGreaterThanOrEqual(5);

    const validPositions = Object.keys(POSITION_LABELS);

    for (const tpl of PRESET_TEMPLATES) {
      expect(typeof tpl.name).toBe("string");
      expect(tpl.name.trim().length).toBeGreaterThan(0);

      expect(typeof tpl.description).toBe("string");
      expect(tpl.description.trim().length).toBeGreaterThan(0);

      expect(typeof tpl.content).toBe("string");
      expect(tpl.content.trim().length).toBeGreaterThan(0);

      expect(validPositions).toContain(tpl.position);
      expect(typeof tpl.category).toBe("string");
    }
  });

  it("validates all supported wire positions have icons and styling tokens", () => {
    const requiredPositions = [
      "system_prepend",
      "system_append",
      "system_override",
      "user_prepend",
      "user_append",
    ];

    for (const pos of requiredPositions) {
      const cfg = POSITION_LABELS[pos];
      expect(cfg).toBeDefined();
      expect(typeof cfg.label).toBe("string");
      expect(typeof cfg.badge).toBe("string");
      expect(typeof cfg.icon).toBe("string");
      expect(typeof cfg.desc).toBe("string");
    }
  });

  it("validates target scope labels covers all, combos, models, and custom", () => {
    expect(TARGET_TYPE_LABELS.all).toBeDefined();
    expect(TARGET_TYPE_LABELS.combos).toBeDefined();
    expect(TARGET_TYPE_LABELS.models).toBeDefined();
    expect(TARGET_TYPE_LABELS.custom).toBeDefined();
  });

  it("validates condition types include negative match and regex", () => {
    const values = CONDITION_TYPES.map((c) => c.value);
    expect(values).toContain("always");
    expect(values).toContain("contains");
    expect(values).toContain("not_contains");
    expect(values).toContain("regex");
  });

  it("validates multi-condition builder fields and operators", () => {
    expect(CONDITION_FIELDS.length).toBeGreaterThanOrEqual(4);
    const fieldValues = CONDITION_FIELDS.map((f) => f.value);
    expect(fieldValues).toContain("user_text");
    expect(fieldValues).toContain("model");
    expect(fieldValues).toContain("provider");
    expect(fieldValues).toContain("combo");

    expect(CONDITION_OPERATORS.length).toBeGreaterThanOrEqual(6);
    const opValues = CONDITION_OPERATORS.map((o) => o.value);
    expect(opValues).toContain("contains");
    expect(opValues).toContain("not_contains");
    expect(opValues).toContain("equals");
    expect(opValues).toContain("not_equals");
    expect(opValues).toContain("starts_with");
    expect(opValues).toContain("ends_with");
    expect(opValues).toContain("regex");
  });

  it("validates all dynamic variable chips have non-empty templates and descriptions", () => {
    expect(VARIABLE_CHIPS.length).toBeGreaterThanOrEqual(5);
    const chipNames = VARIABLE_CHIPS.map((c) => c.label);
    expect(chipNames).toContain("{{model}}");
    expect(chipNames).toContain("{{provider}}");
    expect(chipNames).toContain("{{comboName}}");
    expect(chipNames).toContain("{{date}}");
    expect(chipNames).toContain("{{time}}");
    expect(chipNames).toContain("{{weekday}}");

    for (const chip of VARIABLE_CHIPS) {
      expect(chip.label.startsWith("{{") && chip.label.endsWith("}}")).toBe(true);
      expect(typeof chip.desc).toBe("string");
    }
  });

  it("validates popular models list contains top foundation providers", () => {
    expect(POPULAR_MODELS.length).toBeGreaterThanOrEqual(4);
    expect(POPULAR_MODELS.some((m) => m.includes("gpt"))).toBe(true);
    expect(POPULAR_MODELS.some((m) => m.includes("claude"))).toBe(true);
    expect(POPULAR_MODELS.some((m) => m.includes("deepseek"))).toBe(true);
    expect(POPULAR_MODELS.some((m) => m.includes("gemini"))).toBe(true);
  });

  it("validates playground built-in test cases have models and prompts", () => {
    expect(BUILTIN_TEST_CASES.length).toBeGreaterThanOrEqual(4);
    for (const tc of BUILTIN_TEST_CASES) {
      expect(typeof tc.id).toBe("string");
      expect(typeof tc.name).toBe("string");
      expect(typeof tc.model).toBe("string");
      expect(typeof tc.userPrompt).toBe("string");
      expect(tc.userPrompt.length).toBeGreaterThan(0);
    }
  });
});
