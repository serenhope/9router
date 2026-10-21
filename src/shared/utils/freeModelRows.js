// A free no-auth provider publishes its whole catalogue publicly and routes by
// model id, so "adding" one of its models is bookkeeping, not a gate. The
// provider page used to show that catalogue in two transient chip rows - one
// asking you to add models that already worked, one holding the ids you had
// disabled - so the catalogue was never visible as one list and the same id
// could sit in neither row.
//
// This helper folds registry models, user-added rows and the live catalogue into
// a single deterministic list. Dedupe is by model id with a fixed priority: a
// custom row wins over the registry, and the registry wins over the live
// catalogue, because the earlier source is the one a human maintained (name,
// alias) or the one the build pins.
export function buildUnifiedModelRows({
  builtinModels = [],
  customRows = [],
  catalogue = [],
  disabledIds = [],
} = {}) {
  const disabled = new Set(disabledIds);
  const byId = new Map();

  const put = (row, priority, source) => {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (!id) return;
    const existing = byId.get(id);
    if (existing && existing.priority <= priority) return;
    byId.set(id, {
      id,
      name: row.name || id,
      source,
      priority,
      // The catalogue carries the tier flag; rows from the registry do not, so
      // the badge is only ever printed where a source actually said "free".
      isFree: row.isFree === true,
      disabled: disabled.has(id),
    });
  };

  customRows.forEach((row) => put(row, 0, "custom"));
  builtinModels.forEach((row) => put(row, 1, "builtin"));
  catalogue.forEach((row) => put(row, 2, "catalogue"));

  const rows = [...byId.values()].map(({ priority, ...row }) => row);
  const active = rows.filter((row) => !row.disabled);
  // Disabled ids go last and read alphabetically: they are a restore list, not
  // part of the catalogue you scan for something to call.
  const inactive = rows
    .filter((row) => row.disabled)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    rows,
    active,
    disabled: inactive,
    total: rows.length,
    activeCount: active.length,
    disabledCount: inactive.length,
  };
}
