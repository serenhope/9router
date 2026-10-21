import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// process.cwd() in a test run is tests/, so anchor on the file instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildUnifiedModelRows } = await import(path.join(ROOT, "src/shared/utils/freeModelRows.js"));

describe("buildUnifiedModelRows", () => {
  it("merges builtin, custom and catalogue rows by id with custom winning", () => {
    const result = buildUnifiedModelRows({
      builtinModels: [{ id: "beam-free", name: "Beam Free" }, { id: "union-alpha", name: "Union Alpha Free" }],
      customRows: [{ id: "union-alpha", name: "Union Alpha (renamed)" }],
      catalogue: [{ id: "beam-free", name: "beam-free" }, { id: "mimo-v2-free", name: "Mimo Free" }],
    });
    const union = result.rows.find((row) => row.id === "union-alpha");
    expect(union.source).toBe("custom");
    expect(union.name).toBe("Union Alpha (renamed)");
    expect(result.total).toBe(3); // beam, union, mimo - no duplicates
    expect(result.active.map((row) => row.id).sort()).toEqual(["beam-free", "mimo-v2-free", "union-alpha"]);
  });

  it("keeps every id visible: disabled ids land in the disabled list, nothing vanishes", () => {
    const result = buildUnifiedModelRows({
      builtinModels: [{ id: "muse-spark-1.2-free" }, { id: "union-alpha" }],
      catalogue: [{ id: "beam-free" }, { id: "muse-spark-1.3-free" }],
      disabledIds: ["muse-spark-1.2-free", "muse-spark-1.3-free"],
    });
    expect(result.active.map((row) => row.id)).toEqual(["union-alpha", "beam-free"]);
    expect(result.disabled.map((row) => row.id).sort()).toEqual(["muse-spark-1.2-free", "muse-spark-1.3-free"]);
    expect(result.disabledCount).toBe(2);
    expect(result.activeCount).toBe(2);
    expect(result.total).toBe(4);
  });

  it("sorts the disabled list alphabetically as a restore list", () => {
    const result = buildUnifiedModelRows({
      catalogue: [{ id: "zeta-free" }, { id: "alpha-free" }, { id: "mike-free" }],
      disabledIds: ["zeta-free", "alpha-free", "mike-free"],
    });
    expect(result.disabled.map((row) => row.id)).toEqual(["alpha-free", "mike-free", "zeta-free"]);
  });

  it("tolerates empty inputs and junk rows", () => {
    const result = buildUnifiedModelRows({ builtinModels: [null, { name: "no id" }], catalogue: [], disabledIds: ["x"] });
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("keeps the whole catalogue but marks only the free tier", () => {
    // He wants the paid ids visible too - the FREE badge is what separates the
    // tiers - so the merge must carry the flag instead of dropping rows.
    const result = buildUnifiedModelRows({
      catalogue: [
        { id: "beam-free", name: "beam-free", isFree: true },
        { id: "gpt-6-sol", name: "gpt-6-sol", isFree: false },
      ],
    });
    expect(result.total).toBe(2);
    expect(result.active.map((row) => row.id)).toEqual(["beam-free", "gpt-6-sol"]);
    const beam = result.rows.find((row) => row.id === "beam-free");
    const gpt = result.rows.find((row) => row.id === "gpt-6-sol");
    expect(beam.isFree).toBe(true);
    expect(gpt.isFree).toBe(false);
  });
});

describe("free-catalogue UI contract", () => {
  const page = readFileSync(
    path.join(ROOT, "src/app/(dashboard)/dashboard/providers/[id]/page.js"),
    "utf8",
  );
  const modelRow = readFileSync(
    path.join(ROOT, "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js"),
    "utf8",
  );
  const picker = readFileSync(path.join(ROOT, "src/shared/components/ModelSelectModal.js"), "utf8");

  it("a free no-auth provider renders its catalogue as rows in one list", () => {
    // The old UI split the same ids across a suggested-chip row and a disabled-chip
    // row, since the live catalogue never reached the row list at all.
    expect(page).toContain("buildUnifiedModelRows");
    expect(page).toMatch(/unifiedFreeRows\?\.active/);
    expect(page).toMatch(/unifiedFreeRows\?\.disabled/);
    expect(page).toContain("onRestore={() => handleEnableModel(row.id)}");
  });

  it("the provider grid shows the paid ids too, with the badge marking the tiers", () => {
    // He reads a short list as missing models: the panel must render the whole
    // catalogue and let the FREE badge (or the Free in the name) do the sorting.
    expect(page).toContain("catalogue: suggestedModels.filter((m) => m?.id),");
    expect(page).not.toMatch(/catalogue: suggestedModels\.filter\(\(m\) => m\?\.id && m\.isFree/);
    expect(page).toMatch(/isFree=\{row\.isFree === true\}/);
    const registry = readFileSync(path.join(ROOT, "open-sse/providers/registry/opencode.js"), "utf8");
    for (const id of ["muse-spark-1.2-contributor-free", "muse-spark-1.3-contributor-free", "union-alpha", "deepseek-v4.1-flash-free", "jev-1.13-free"]) {
      expect(registry).toMatch(new RegExp(`id: "${id}".*isFree: true`));
    }
  });

  it("the add-me and restore chip rows only exist for providers that gate their catalogue", () => {
    // A gated provider (paid catalogues) still needs the "add me" affordance; a free
    // no-auth provider must not re-show the ids it just rendered as rows.
    expect(page).toContain("!isFreeNoAuth && (suggestedModels.length > 0 || suggestedModelsError)");
    expect(page).toContain("!isFreeNoAuth && disabledDisplayModels.length > 0");
  });

  it("ModelRow carries the disabled and free states the unified list needs", () => {
    expect(modelRow).toMatch(/isDisabled\s*\?\s*"opacity-60"/);
    expect(modelRow).toMatch(/isDisabled\s*\?\s*"visibility_off"/);
    expect(modelRow).toContain("onRestore");
    expect(modelRow).toMatch(/isFree && \(/); // FREE badge
  });

  it("the picker says how many models it is hiding", () => {
    expect(picker).toMatch(/disabledCountFor/);
    expect(picker).toMatch(/·\s*\{disabledCountFor/);
    // Declared at component scope: the first cut defined it inside the groupedModels
    // memo and printed it in JSX, so opening the picker threw a ReferenceError and
    // Next's error boundary blanked the page.
    const helperAt = picker.indexOf("const disabledCountFor");
    const memoAt = picker.indexOf("const groupedModels = useMemo");
    expect(helperAt).toBeGreaterThan(-1);
    expect(memoAt).toBeGreaterThan(-1);
    expect(helperAt).toBeLessThan(memoAt);
  });
});
