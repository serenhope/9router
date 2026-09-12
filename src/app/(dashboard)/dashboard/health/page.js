"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, Button, Toggle, SegmentedControl, CardSkeleton } from "@/shared/components";

const RANGE_OPTIONS = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
];
const AUTO_REFRESH_MS = 15000;

const TONE_BY_STATUS = {
  ok: "bg-green-500",
  degraded: "bg-yellow-500",
  locked: "bg-orange-500",
  error: "bg-red-500",
  disabled: "bg-gray-400",
};

function secondsLeftFrom(untilIso, nowMs) {
  if (!untilIso) return 0;
  return Math.max(0, Math.round((new Date(untilIso).getTime() - nowMs) / 1000));
}

function fmtCooldown(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtMs(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 10000) return `${(value / 1000).toFixed(1)}s`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value}ms`;
}

function fmtNum(value) {
  if (!value) return "0";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

// Sub-cent board totals would all read as $0.00 with two decimals.
function fmtCost(cost) {
  if (!cost) return null;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  if (cost < 0.0001) return `$${cost.toExponential(1)}`;
  return `$${cost.toFixed(4)}`;
}

function fmtClock(date) {
  if (!date) return "";
  return date.toLocaleTimeString("en-US", { hour12: false });
}

function Dot({ status }) {
  return (
    <span
      className={`size-2.5 shrink-0 rounded-full ${TONE_BY_STATUS[status] || TONE_BY_STATUS.disabled}`}
      title={`Reports as ${status}.`}
    />
  );
}

function Chip({ children, tone = "neutral", title }) {
  const tones = {
    neutral: "bg-black/5 dark:bg-white/10 text-text-muted",
    warn: "bg-amber-500/10 text-amber-500",
  };
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium max-w-full ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Stat({ label, value, title }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-[11px] text-text-muted" title={title}>
      <span className="shrink-0">{label}</span>
      <span className="font-mono tabular-nums text-text-main truncate">{value}</span>
    </span>
  );
}

function RateBar({ rate, status }) {
  const pct = rate === null || rate === undefined ? 0 : Math.max(0, Math.min(100, rate));
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="h-1.5 min-w-0 max-w-full flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${TONE_BY_STATUS[status] || TONE_BY_STATUS.disabled}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-main">
        {rate === null || rate === undefined ? "no traffic" : `${rate}%`}
      </span>
    </div>
  );
}

export default function HealthPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <HealthContent />
    </Suspense>
  );
}

function HealthContent() {
  const [range, setRange] = useState("24h");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tests, setTests] = useState({});
  const [modelBusy, setModelBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/health?window=${range}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (mine !== seq.current) return;
      if (!res.ok) {
        setData(null);
        setError({
          headline:
            res.status === 401
              ? "The health board needs a signed-in dashboard session."
              : `The health API answered with HTTP ${res.status}.`,
          detail: typeof payload.error === "string" ? payload.error : "",
        });
        return;
      }
      setData(payload);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      if (mine !== seq.current) return;
      setData(null);
      setError({ headline: "The health request never reached the gateway.", detail: e?.message || "" });
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const timer = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, load]);

  // Per-card test results and pause notes describe the window they were read from.
  useEffect(() => {
    setTests({});
    setNote(null);
  }, [range]);

  const connections = data?.connections || [];
  const coolingCount = useMemo(
    () => connections.reduce((sum, c) => sum + (secondsLeftFrom(c.cooldown?.until, now) > 0 ? 1 : 0), 0),
    [connections, now]
  );

  useEffect(() => {
    if (!coolingCount) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [coolingCount]);

  const groups = useMemo(() => {
    const byProvider = new Map();
    for (const conn of connections) {
      if (!byProvider.has(conn.provider)) byProvider.set(conn.provider, []);
      byProvider.get(conn.provider).push(conn);
    }
    return (data?.providers || []).map((provider) => ({
      ...provider,
      accounts: byProvider.get(provider.provider) || [],
    }));
  }, [data, connections]);

  const runTest = useCallback(async (conn) => {
    setTests((prev) => ({ ...prev, [conn.id]: { loading: true, sentence: "", detail: "" } }));
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(conn.id)}/test`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      const detail = typeof payload.error === "string" ? payload.error.slice(0, 200) : "";
      const passed = res.ok && !!payload.valid;
      const sentence = passed
        ? "The test call went through."
        : res.ok
          ? "The test call failed for this account."
          : `The test route answered with HTTP ${res.status}.`;
      setTests((prev) => ({ ...prev, [conn.id]: { loading: false, ok: passed, sentence, detail } }));
      load(true);
    } catch (e) {
      setTests((prev) => ({
        ...prev,
        [conn.id]: { loading: false, ok: false, sentence: "The test request never reached the gateway.", detail: e?.message || "" },
      }));
    }
  }, [load]);

  const setPaused = useCallback(async (conn, model, paused) => {
    const key = `${conn.id}:${model.model}`;
    setModelBusy(key);
    setNote(null);
    try {
      const res = paused
        ? await fetch(
            `/api/models/disabled?providerAlias=${encodeURIComponent(conn.providerAlias)}&id=${encodeURIComponent(model.model)}`,
            { method: "DELETE" }
          )
        : await fetch("/api/models/disabled", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias: conn.providerAlias, ids: [model.model] }),
          });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        setNote({
          sentence: "The gateway rejected the pause request.",
          detail: typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`,
        });
      } else {
        setNote({
          sentence: paused
            ? `${model.model} is open for traffic again.`
            : `${model.model} is paused and the router will skip it.`,
          detail: "",
        });
        await load(true);
      }
    } catch (e) {
      setNote({ sentence: "The pause request never reached the gateway.", detail: e?.message || "" });
    } finally {
      setModelBusy(null);
    }
  }, [load]);

  const totals = data?.totals;
  const showEmpty = !!data && !error && (totals?.requests || 0) === 0;

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <span className="material-symbols-outlined text-primary">monitoring</span>
          Provider Health
        </h1>
        <p className="min-w-0 text-sm break-words text-text-muted">
          Every account the gateway routed through in the selected window, with its failures, cooldowns and paused models.
        </p>
      </div>

      <Card padding="sm" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
          <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} size="sm" />
          <Toggle checked={auto} onChange={setAuto} size="sm" label="Auto refresh" description="Reloads the board every 15 seconds." />
          <Button variant="secondary" size="sm" icon="refresh" loading={loading} onClick={() => load()}>
            Refresh
          </Button>
          <span className="min-w-0 text-[11px] break-words text-text-muted">
            {updatedAt ? `Updated at ${fmtClock(updatedAt)}.` : "Nothing loaded yet."}
          </span>
        </div>

        {error && (
          <div className="flex min-w-0 items-start gap-2 rounded-[10px] border border-red-500/30 bg-red-500/5 p-3">
            <span className="material-symbols-outlined shrink-0 text-[18px] text-red-500">error</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="min-w-0 text-sm font-medium break-words text-red-500">{error.headline}</p>
              {error.detail && (
                <code className="max-w-full min-w-0 break-words font-mono text-[11px] text-text-muted">{error.detail}</code>
              )}
              <p className="min-w-0 text-[11px] break-words text-text-muted">Retry once the gateway is reachable again.</p>
            </div>
          </div>
        )}

        {note && (
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11px] break-words text-text-muted">
            <span className="min-w-0">{note.sentence}</span>
            {note.detail && <code className="max-w-full min-w-0 break-words font-mono text-[10px] text-text-muted">{note.detail}</code>}
          </p>
        )}

        {showEmpty && !loading && (
          <p className="min-w-0 text-sm break-words text-text-muted">
            {connections.length
              ? data?.observability?.enabled === false
                ? "Request logging is switched off in Settings, so this board has nothing to measure yet."
                : "No requests were logged in this window, so every rate below is still empty."
              : "No provider accounts are configured yet, so there is nothing to measure."}
          </p>
        )}

        {totals && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3">
            <Stat label="requests" value={fmtNum(totals.requests)} title="Requests logged inside the window." />
            <Stat label="errors" value={fmtNum(totals.error)} title="Requests the gateway logged as failed." />
            <Stat label="success" value={totals.successRate === null ? "—" : `${totals.successRate}%`} title="Share of logged requests that answered." />
            <Stat label="p50" value={fmtMs(totals.p50Ms)} title="Median latency of successful requests." />
            <Stat label="p95" value={fmtMs(totals.p95Ms)} title="95th percentile latency of successful requests." />
            <Stat
              label="tokens"
              value={`${fmtNum(totals.tokens?.prompt)} in / ${fmtNum(totals.tokens?.completion)} out`}
              title="Tokens summed over the requests analysed here."
            />
            {fmtCost(totals.costUsd) && <Stat label="cost" value={`~${fmtCost(totals.costUsd)}`} title="Estimated from the pricing table and logged token counts." />}
            <Stat label="accounts" value={`${totals.connections}`} title="Provider accounts on this board." />
            {totals.coolingDown > 0 && <Chip tone="warn" title="Accounts with an active upstream cooldown.">{`${totals.coolingDown} cooling down.`}</Chip>}
            {data?.sample?.capped && (
              <span className="min-w-0 text-[10px] break-words text-text-muted">
                {`Only the newest ${data.sample.rowsAnalysed} of ${data.sample.rowsInWindow} logged requests are covered here.`}
              </span>
            )}
          </div>
        )}
      </Card>

      {loading && !data && !error && <CardSkeleton />}

      {data &&
        groups.map((provider) => (
          <Card key={provider.provider} padding="sm" className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Dot status={provider.status} />
              <h2 className="min-w-0 truncate text-sm font-semibold text-text-main">{provider.providerName}</h2>
              <code
                title={provider.provider}
                className="max-w-full min-w-0 truncate rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/10"
              >
                {provider.provider}
              </code>
              {provider.providerAlias !== provider.provider && (
                <code
                  title={`The router reaches this provider under the alias ${provider.providerAlias}.`}
                  className="max-w-full min-w-0 truncate rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/10"
                >
                  {provider.providerAlias}
                </code>
              )}
              <span className="shrink-0 text-[11px] text-text-muted">
                {provider.accountCount === 1 ? "1 account here." : `${provider.accountCount} accounts here.`}
              </span>
              <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
                {provider.coolingDown > 0 && (
                  <Chip tone="warn" title="Accounts with an active upstream cooldown.">{`${provider.coolingDown} cooling down.`}</Chip>
                )}
                <span className="font-mono text-[11px] tabular-nums text-text-main">
                  {provider.successRate === null ? "no traffic" : `${provider.successRate}%`}
                </span>
                <span className="shrink-0 text-[11px] text-text-muted">{`${provider.success} of ${provider.requests} answered.`}</span>
              </div>
            </div>

            {provider.disabledModels?.length > 0 && (
              <p className="min-w-0 text-[11px] break-words text-text-muted">
                {`${provider.disabledModels.length} ${provider.disabledModels.length === 1 ? "model is" : "models are"} paused on this provider.`}
              </p>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
              {provider.accounts.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  conn={conn}
                  now={now}
                  test={tests[conn.id]}
                  testing={!!tests[conn.id]?.loading}
                  modelBusy={modelBusy}
                  onTest={() => runTest(conn)}
                  onPauseModel={(model, paused) => setPaused(conn, model, paused)}
                />
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}

function ConnectionCard({ conn, now, test, testing, modelBusy, onTest, onPauseModel }) {
  const cooldownLeft = secondsLeftFrom(conn.cooldown?.until, now);
  const cost = fmtCost(conn.costUsd);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-border-subtle bg-surface-2/40 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Dot status={conn.status} />
        <span
          title={conn.name}
          className="min-w-0 max-w-full flex-1 basis-32 truncate text-sm font-semibold text-text-main"
        >
          {conn.name}
        </span>
        {conn.removed && <Chip tone="neutral" title="This account was deleted after the requests were logged.">removed</Chip>}
        {!conn.isActive && !conn.removed && <Chip tone="neutral" title="This account is switched off in the provider settings.">disabled</Chip>}
        {conn.backoffLevel > 0 && (
          <Chip tone="warn" title={`The router is backing off at level ${conn.backoffLevel}.`}>{`backoff ${conn.backoffLevel}`}</Chip>
        )}
        {cooldownLeft > 0 && (
          <Chip tone="warn" title={conn.cooldown.model ? `Model ${conn.cooldown.model} is cooling down.` : "The whole account is cooling down."}>
            {`cooling down for ${fmtCooldown(cooldownLeft)}`}
          </Chip>
        )}
      </div>

      <RateBar rate={conn.successRate} status={conn.status} />

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <Stat label="req" value={fmtNum(conn.requests)} title="Requests logged for this account inside the window." />
        <Stat label="fail" value={fmtNum(conn.error)} title="Requests the gateway logged as failed." />
        <Stat label="p50" value={fmtMs(conn.p50Ms)} title="Median latency of successful requests." />
        <Stat label="p95" value={fmtMs(conn.p95Ms)} title="95th percentile latency of successful requests." />
        <Stat
          label="tokens"
          value={conn.tokens?.total ? `${fmtNum(conn.tokens.prompt)} in / ${fmtNum(conn.tokens.completion)} out` : "—"}
          title="Tokens summed over the requests analysed here."
        />
        {cost && <Stat label="cost" value={`~${cost}`} title="Estimated from the pricing table and logged token counts." />}
      </div>

      {conn.lastError?.text && (
        <p className="min-w-0 max-w-full text-[11px] break-words text-red-500">
          <span className="text-text-muted">{conn.lastError.code ? `${conn.lastError.code} · ` : ""}</span>
          {conn.lastError.text}
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <span className="min-w-0 text-[11px] break-words text-text-muted">
          {conn.testStatus ? `Last test status: ${conn.testStatus}.` : "This account has never been tested."}
        </span>
        <Button variant="ghost" size="sm" icon="network_check" loading={testing} disabled={conn.removed} onClick={onTest}>
          Test now
        </Button>
      </div>

      {test && !test.loading && (
        <p className={`flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11px] break-words ${test.ok ? "text-green-500" : "text-red-500"}`}>
          <span className="min-w-0">{test.sentence}</span>
          {test.detail && <code className="max-w-full min-w-0 break-words font-mono text-[10px] text-text-muted">{test.detail}</code>}
        </p>
      )}

      {conn.models?.length > 0 && (
        <details className="min-w-0">
          <summary className="cursor-pointer text-[11px] text-text-muted hover:text-primary">
            {`${conn.models.length} ${conn.models.length === 1 ? "model" : "models"} listed for this account.`}
          </summary>
          <ul className="mt-2 flex min-w-0 flex-col gap-1.5">
            {conn.models.map((model) => {
              const modelLeft = secondsLeftFrom(model.cooldownUntil, now);
              const busyKey = `${conn.id}:${model.model}`;
              return (
                <li key={model.model} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <code
                    title={model.model}
                    className="max-w-full min-w-0 basis-auto truncate font-mono text-[11px] text-text-main"
                  >
                    {model.model}
                  </code>
                  {model.paused && <Chip tone="neutral" title="The router skips this model until you resume it.">paused</Chip>}
                  {modelLeft > 0 && (
                    <Chip tone="warn" title="The upstream rejected this model and it is on cooldown.">
                      {`cooling down for ${fmtCooldown(modelLeft)}`}
                    </Chip>
                  )}
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted">
                    {`${model.requests} req · ${model.error} fail`}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted">
                    {`${fmtMs(model.p50Ms)} / ${fmtMs(model.p95Ms)}`}
                  </span>
                  <div className="ml-auto shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={model.paused ? "play_circle" : "pause_circle"}
                      loading={modelBusy === busyKey}
                      disabled={conn.removed}
                      onClick={() => onPauseModel(model, model.paused)}
                    >
                      {model.paused ? "Resume" : "Pause"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
