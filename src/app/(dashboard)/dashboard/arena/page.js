"use client";

import { Suspense, useState, useCallback, useEffect, useMemo } from "react";
import { Card, Button, Input, ModelSelectModal, CardSkeleton } from "@/shared/components";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getPricingForModel, calculateCostFromTokens, formatCost } from "open-sse/providers/pricing.js";

const MAX_MODELS = 4;
const MIN_MODELS = 1;

const ALIAS_TO_PROVIDER_ID = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS).map(([id, alias]) => [alias, id])
);

function splitModel(value) {
  const str = String(value || "").trim();
  if (!str.includes("/")) return { provider: null, model: str };
  const firstSlash = str.indexOf("/");
  const prefix = str.slice(0, firstSlash);
  return { provider: ALIAS_TO_PROVIDER_ID[prefix] || prefix, model: str.slice(firstSlash + 1) };
}

function estimateCost(modelName, usage, studioTargets) {
  const { provider, model } = splitModel(studioTargets?.[modelName] || modelName);
  const pricing = getPricingForModel(provider, model);
  if (!pricing) return null;
  return calculateCostFromTokens(usage || {}, pricing);
}

// Battle costs are usually sub-cent, so two decimals would render every row as $0.00.
function showCost(cost) {
  if (cost === null || cost === undefined || Number.isNaN(cost)) return "—";
  if (cost >= 0.01) return formatCost(cost);
  if (cost < 0.0001) return `$${cost.toExponential(1)}`;
  return `$${cost.toFixed(4)}`;
}

function emptyResult() {
  return { loading: false, data: null };
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ArenaContent />
    </Suspense>
  );
}

function ArenaContent() {
  const [slots, setSlots] = useState(["", ""]);
  const [results, setResults] = useState([emptyResult(), emptyResult()]);
  const [prompt, setPrompt] = useState("");
  const [runId, setRunId] = useState(0);
  const [pick, setPick] = useState(null);
  const [showPicker, setShowPicker] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [studioTargets, setStudioTargets] = useState({});
  const [activeApiKey, setActiveApiKey] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [providersRes, aliasesRes, studioRes, keysRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/models/alias"),
          fetch("/api/model-editor"),
          fetch("/api/keys"),
        ]);
        if (providersRes.ok) {
          const pData = await providersRes.json();
          setActiveProviders(pData.connections || []);
        }
        if (aliasesRes.ok) {
          const aData = await aliasesRes.json();
          setModelAliases(aData.aliases || {});
        }
        if (studioRes.ok) {
          const sData = await studioRes.json();
          const map = {};
          for (const studio of sData.models || []) map[studio.callName] = studio.targetModel;
          setStudioTargets(map);
        }
        if (keysRes.ok) {
          const kData = await keysRes.json();
          const firstActive = (kData.keys || []).find((k) => k.isActive !== false);
          if (firstActive?.key) setActiveApiKey(firstActive.key);
        }
      } catch (e) {
        console.error("Error loading battle inputs:", e);
      }
    };
    load();
  }, []);

  const setSlot = (index, value) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addSlot = () => {
    if (slots.length >= MAX_MODELS) return;
    setSlots((prev) => [...prev, ""]);
    setResults((prev) => [...prev, emptyResult()]);
  };

  const removeSlot = (index) => {
    if (slots.length <= MIN_MODELS) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setResults((prev) => prev.filter((_, i) => i !== index));
    setPick(null);
  };

  const runBattle = useCallback(async () => {
    if (!prompt.trim()) return;
    const id = runId + 1;
    setRunId(id);
    setPick(null);
    setResults(slots.map(() => ({ loading: true, data: null })));

    await Promise.all(
      slots.map(async (model, index) => {
        if (!model.trim()) {
          setResults((prev) => {
            const next = [...prev];
            next[index] = { loading: false, data: null };
            return next;
          });
          return;
        }
        const started = Date.now();
        const headers = { "Content-Type": "application/json" };
        if (activeApiKey) headers["Authorization"] = `Bearer ${activeApiKey}`;
        try {
          const res = await fetch("/v1/chat/completions", {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: model.trim(),
              messages: [{ role: "user", content: prompt }],
              stream: false,
            }),
          });
          const ms = Date.now() - started;
          const payload = await res.json().catch(() => ({}));
          const ok = res.ok;
          const content = ok
            ? payload.choices?.[0]?.message?.content || JSON.stringify(payload)
            : payload?.error?.message || payload?.error || "Unknown error";
          const usage = ok ? payload.usage || {} : null;
          setResults((prev) => {
            const next = [...prev];
            next[index] = {
              loading: false,
              data: {
                ok,
                content,
                ms,
                usage,
                cost: ok ? estimateCost(model.trim(), usage, studioTargets) : null,
                chars: (content || "").length,
              },
            };
            return next;
          });
        } catch (err) {
          setResults((prev) => {
            const next = [...prev];
            next[index] = {
              loading: false,
              data: { ok: false, content: err?.message || "Request failed", ms: Date.now() - started, usage: null, cost: null, chars: 0 },
            };
            return next;
          });
        }
      })
    );
  }, [prompt, slots, runId, activeApiKey, studioTargets]);

  const busy = results.some((r) => r.loading);
  const done = results.filter((r) => r.data);
  const ranked = useMemo(() => buildRanking(slots, results), [slots, results]);

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">swords</span>
          Model Battle
        </h1>
        <p className="text-sm text-text-muted">
          Send the same prompt to up to {MAX_MODELS} models and compare speed, cost and output.
        </p>
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {slots.map((model, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Contender {index + 1}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={model}
                    onChange={(e) => setSlot(index, e.target.value)}
                    placeholder="e.g. cc/claude-sonnet-4.5 — or pick one"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button variant="secondary" icon="search" onClick={() => setShowPicker(index)} />
                </div>
              </div>
              {slots.length > MIN_MODELS && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="close"
                  onClick={() => removeSlot(index)}
                  className="mb-1 shrink-0"
                  title={`Remove contender ${index + 1}`}
                />
              )}
            </div>
          ))}
        </div>

        {slots.length < MAX_MODELS && (
          <button
            onClick={addSlot}
            className="self-start flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add contender
          </button>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Prompt</label>
          <textarea
            className="w-full min-h-[120px] p-3 rounded-lg border border-border bg-surface-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            placeholder="Write a python script to parse CSV..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button
            icon="play_arrow"
            onClick={runBattle}
            disabled={!prompt.trim() || busy || !slots.some((s) => s.trim())}
          >
            {busy ? "Fighting..." : "Run Battle"}
          </Button>
        </div>
      </Card>

      {ranked.length > 1 && (
        <FinalResult ranked={ranked} pick={pick} setPick={setPick} runId={runId} />
      )}

      {(done.length > 0 || busy) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slots.map((model, index) => {
            const result = results[index]?.data;
            const loading = results[index]?.loading;
            if (!model && !loading && !result) return null;
            return (
              <Card key={index} padding="sm" className="h-full flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-border mb-3">
                  <span className="font-mono text-sm font-semibold truncate">{model || "—"}</span>
                  {result && (
                    <span
                      className={`text-xs px-2 py-1 rounded font-mono shrink-0 ${
                        result.ok ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {result.ok ? `${result.ms}ms` : "failed"}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto bg-black/5 dark:bg-white/5 rounded-lg p-3 min-w-0">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-text-muted">
                      <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                      <span className="text-sm">Waiting for response...</span>
                    </div>
                  ) : result ? (
                    <div className="flex flex-col h-full min-w-0">
                      <pre className="text-sm font-mono whitespace-pre-wrap flex-1 break-words min-w-0">
                        {result.content}
                      </pre>
                      {result.ok && (
                        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                          <span>in {result.usage?.prompt_tokens ?? 0}</span>
                          <span>out {result.usage?.completion_tokens ?? 0}</span>
                          <span>total {result.usage?.total_tokens ?? 0}</span>
                          {result.cost != null && <span>~{showCost(result.cost)}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40 text-text-muted text-sm">
                      No result
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showPicker !== null && (
        <ModelSelectModal
          isOpen
          onClose={() => setShowPicker(null)}
          onSelect={(modelObj) => {
            setSlot(showPicker, modelObj?.value || "");
            setShowPicker(null);
          }}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Pick contender ${showPicker + 1}`}
        />
      )}
    </div>
  );
}

/**
 * Rank finished runs. Quality can only be judged by reading, so the automatic
 * ranking is explicitly about speed + spend; a manual pick always wins.
 */
function buildRanking(slots, results) {
  return slots
    .map((model, index) => ({ model, index, data: results[index]?.data }))
    .filter((entry) => entry.model && entry.data)
    .map((entry) => ({
      ...entry,
      ok: entry.data.ok,
      ms: entry.data.ms,
      totalTokens: entry.data.usage?.total_tokens ?? 0,
      cost: entry.data.cost,
      chars: entry.data.chars,
    }))
    .sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      if (a.ms !== b.ms) return a.ms - b.ms;
      return (a.cost ?? Number.MAX_SAFE_INTEGER) - (b.cost ?? Number.MAX_SAFE_INTEGER);
    });
}

function FinalResult({ ranked, pick, setPick, runId }) {
  const winners = {
    fastest: ranked.filter((r) => r.ok).slice().sort((a, b) => a.ms - b.ms)[0],
    cheapest: ranked
      .filter((r) => r.ok && r.cost != null)
      .slice()
      .sort((a, b) => a.cost - b.cost)[0],
    leanest: ranked
      .filter((r) => r.ok && r.totalTokens > 0)
      .slice()
      .sort((a, b) => a.totalTokens - b.totalTokens)[0],
    richest: ranked.filter((r) => r.ok).slice().sort((a, b) => b.chars - a.chars)[0],
  };

  const leader = ranked[0];
  const manual = pick != null ? ranked.find((r) => r.index === pick) : null;

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-amber-500 text-[20px]">trophy</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-main">Final Result</h3>
            <p className="text-[11px] text-text-muted">
              {manual ? (
                <>Your pick: <code className="font-mono">{manual.model}</code></>
              ) : leader?.ok ? (
                <><code className="font-mono">{leader.model}</code> answered fastest — tap “My pick” below for quality.</>
              ) : (
                "No contender answered successfully."
              )}
            </p>
          </div>
        </div>
        <span className="text-[10px] text-text-muted">run #{runId}</span>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-text-muted border-b border-border">
              <th className="text-left py-2 pr-3 font-medium">Model</th>
              <th className="text-right py-2 px-3 font-medium">Time</th>
              <th className="text-right py-2 px-3 font-medium">Tokens</th>
              <th className="text-right py-2 px-3 font-medium">Cost</th>
              <th className="text-right py-2 pl-3 font-medium">My pick</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, position) => {
              const isWinner = position === 0 && entry.ok && pick == null;
              const isPicked = pick === entry.index;
              return (
                <tr
                  key={entry.index}
                  className={`border-b border-border/50 last:border-0 ${isPicked ? "bg-primary/5" : ""}`}
                >
                  <td className="py-2 pr-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text-muted tabular-nums w-4 shrink-0">{position + 1}</span>
                      <code className="font-mono text-text-main truncate max-w-[220px]">{entry.model}</code>
                      {isWinner && <Badge icon="trophy" text="fastest" />}
                      {winners.cheapest?.index === entry.index && <Badge icon="payments" text="cheapest" />}
                      {winners.richest?.index === entry.index && winners.richest?.index !== winners.leanest?.index && (
                        <Badge icon="article" text="longest" />
                      )}
                      {isPicked && <Badge icon="check" text="your pick" accent />}
                    </div>
                    {!entry.ok && <span className="text-[11px] text-red-500">failed</span>}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {entry.ok ? `${entry.ms}ms` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {entry.ok ? entry.totalTokens || "—" : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {entry.ok ? showCost(entry.cost) : "—"}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <button
                      onClick={() => setPick(isPicked ? null : entry.index)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                        isPicked
                          ? "bg-primary text-white border-primary"
                          : "border-border text-text-muted hover:text-primary hover:border-primary/50"
                      }`}
                    >
                      {isPicked ? "picked" : "pick"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Badge({ icon, text, accent }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
        accent ? "bg-primary/15 text-primary" : "bg-black/5 dark:bg-white/10 text-text-muted"
      }`}
    >
      <span className="material-symbols-outlined text-[11px]">{icon}</span>
      {text}
    </span>
  );
}
