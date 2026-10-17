"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Input } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { usePlaygroundSimulator, BUILTIN_TEST_CASES } from "../hooks/usePlaygroundSimulator";
import { POPULAR_MODELS } from "../constants/promptConstants";

export function PlaygroundModal({ isOpen, onClose, combos = [], targetRule = null }) {
  const sim = usePlaygroundSimulator();
  const { copied, copy } = useCopyToClipboard();
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    if (targetRule?.id) {
      sim.setActiveRuleId(targetRule.id);
    } else {
      sim.setActiveRuleId("");
    }
  }, [targetRule, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!saveName.trim()) return;
    sim.saveCurrentTestCase(saveName);
    setSaveName("");
    setShowSaveInput(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        targetRule
          ? `Prompt Simulator — Testing: ${targetRule.name}`
          : "Prompt Injection Interactive Simulator & Diff"
      }
      size="full"
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Presets and Test Cases Bar */}
        <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-border/50 bg-surface/30">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text flex items-center gap-1.5 text-[11px]">
              <span className="material-symbols-outlined text-[16px] text-primary">bookmark</span>
              Quick Test Cases & Presets
            </span>
            <button
              type="button"
              onClick={() => setShowSaveInput(!showSaveInput)}
              className="text-[11px] text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">save</span>
              Save Current Prompt
            </button>
          </div>

          {showSaveInput && (
            <div className="flex items-center gap-2 mt-1">
              <Input
                placeholder="Name this test case..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="text-xs h-7"
              />
              <Button size="sm" variant="primary" onClick={handleSave} className="h-7 px-3 text-xs shrink-0">
                Save
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {BUILTIN_TEST_CASES.map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => sim.loadTestCase(tc)}
                className="px-2 py-1 rounded-lg bg-surface hover:bg-surface-hover border border-border/60 text-[11px] font-medium text-text-muted hover:text-text transition-colors"
              >
                {tc.name}
              </button>
            ))}

            {sim.customTestCases?.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-primary"
              >
                <button
                  type="button"
                  onClick={() => sim.loadTestCase(tc)}
                  className="font-medium hover:underline truncate max-w-[120px]"
                >
                  {tc.name}
                </button>
                <button
                  type="button"
                  onClick={() => sim.deleteTestCase(tc.id)}
                  className="text-primary hover:text-red-500 ml-0.5"
                  title="Delete test case"
                >
                  <span className="material-symbols-outlined text-[12px]">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {sim.error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{sim.error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Test Inputs */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/50 bg-surface/50">
            <div className="font-semibold text-text flex items-center justify-between border-b border-border/40 pb-2">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">tune</span>
                Simulation Parameters
              </span>
              <button
                type="button"
                onClick={sim.resetPlayground}
                className="text-text-muted hover:text-text text-[11px] flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                Reset
              </button>
            </div>

            {/* Model input */}
            <div className="flex flex-col gap-1">
              <label className="font-medium text-text">Target Model</label>
              <Input
                placeholder="e.g. openai/gpt-4o or claude-3-7-sonnet"
                value={sim.model}
                onChange={(e) => sim.setModel(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {POPULAR_MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => sim.setModel(m)}
                    className="px-1.5 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border/50 text-[10px] font-mono text-text-muted hover:text-text"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Combo input */}
            {combos.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="font-medium text-text">Target Combo (Optional)</label>
                <select
                  value={sim.comboName}
                  onChange={(e) => sim.setComboName(e.target.value)}
                  className="bg-surface border border-border/60 text-xs rounded-lg px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                >
                  <option value="">(None - Direct Model Request)</option>
                  {combos.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Original System Prompt */}
            <div className="flex flex-col gap-1">
              <label className="font-medium text-text">Original System Prompt (Optional)</label>
              <textarea
                rows={2}
                placeholder="e.g. You are a helpful assistant."
                value={sim.systemPrompt}
                onChange={(e) => sim.setSystemPrompt(e.target.value)}
                className="w-full bg-surface border border-border/60 rounded-lg p-2 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>

            {/* User Prompt */}
            <div className="flex flex-col gap-1">
              <label className="font-medium text-text">Sample User Prompt *</label>
              <textarea
                rows={3}
                placeholder="Enter sample prompt that triggers or tests rules..."
                value={sim.userPrompt}
                onChange={(e) => sim.setUserPrompt(e.target.value)}
                className="w-full bg-surface border border-border/60 rounded-lg p-2 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={sim.runSimulation}
              disabled={sim.simulating}
              className="gap-1.5 mt-2 shadow-sm"
            >
              <span className={`material-symbols-outlined text-[16px] ${sim.simulating ? "animate-spin" : ""}`}>
                {sim.simulating ? "progress_activity" : "play_arrow"}
              </span>
              {sim.simulating ? "Simulating..." : "Execute Simulation"}
            </Button>
          </div>

          {/* Right Column: Results & Diff */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/50 bg-surface/50">
            {/* View switcher tabs */}
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => sim.setActiveTab("diff")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    sim.activeTab === "diff"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text hover:bg-surface"
                  }`}
                >
                  Request Diff
                </button>
                <button
                  type="button"
                  onClick={() => sim.setActiveTab("trace")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    sim.activeTab === "trace"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text hover:bg-surface"
                  }`}
                >
                  Condition Trace
                  {sim.result?.trace?.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-surface text-[10px] font-mono">
                      {sim.result.trace.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => sim.setActiveTab("json")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    sim.activeTab === "json"
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text hover:bg-surface"
                  }`}
                >
                  Raw JSON
                </button>
              </div>

              {sim.result && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    sim.result.modified
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                  }`}
                >
                  {sim.result.modified ? "Injected (Mutated)" : "Unmodified"}
                </span>
              )}
            </div>

            {!sim.result ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-text-muted gap-2">
                <span className="material-symbols-outlined text-[28px] opacity-40">science</span>
                <p>Click &quot;Execute Simulation&quot; to test prompt injection matching and see transformed payloads.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                {/* TAB 1: Diff View */}
                {sim.activeTab === "diff" && (
                  <div className="flex flex-col gap-3">
                    {/* Applied Rules Badges */}
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] font-semibold text-text">Rules Injected:</div>
                      {sim.result.injectedRules?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sim.result.injectedRules.map((rName) => (
                            <span
                              key={rName}
                              className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium text-[11px] flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[12px]">check</span>
                              {rName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-muted text-[11px]">No rules matched this request context.</span>
                      )}
                    </div>

                    {/* Transformed Messages Diff Preview */}
                    <div className="flex flex-col gap-2">
                      <div className="text-[11px] font-semibold text-text">Transformed Payload Sent Upstream:</div>
                      {Array.isArray(sim.result.body?.messages) ? (
                        <div className="flex flex-col gap-2">
                          {sim.result.body.messages.map((m, idx) => (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-lg border text-xs font-mono leading-relaxed ${
                                m.role === "system"
                                  ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                  : "bg-surface border-border/50 text-text"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1 font-semibold uppercase text-[10px] tracking-wider text-text-muted">
                                <span>Message #{idx + 1} ({m.role})</span>
                                {m.role === "system" && sim.result.modified && (
                                  <span className="text-emerald-500 flex items-center gap-0.5">
                                    <span className="material-symbols-outlined text-[12px]">add_circle</span>
                                    Injected System Prompt
                                  </span>
                                )}
                              </div>
                              <div className="whitespace-pre-wrap select-text">{m.content}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <pre className="bg-surface rounded-lg p-2.5 border border-border/50 font-mono text-[11px] text-text whitespace-pre-wrap select-text">
                          {JSON.stringify(sim.result.body, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: Condition & Execution Trace */}
                {sim.activeTab === "trace" && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] font-semibold text-text">Rule Evaluation Timeline:</div>
                    {sim.result.trace?.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {sim.result.trace.map((t, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 ${
                              t.matched
                                ? "bg-emerald-500/5 border-emerald-500/20"
                                : "bg-surface/50 border-border/40 text-text-muted"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-text flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    t.matched ? "bg-emerald-500" : "bg-text-muted/40"
                                  }`}
                                />
                                #{t.priority ?? idx + 1} {t.name}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                                  t.matched
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : "bg-surface text-text-muted"
                                }`}
                              >
                                {t.matched ? "MATCHED" : "SKIPPED"}
                              </span>
                            </div>
                            <p className="text-[11px] leading-tight text-text-muted">
                              {t.reason || (t.matched ? "Conditions met" : "Conditions not met")}
                            </p>
                            {t.injectedPrompt && (
                              <div className="mt-1 p-1.5 rounded bg-surface border border-border/40 font-mono text-[10px] text-text whitespace-pre-wrap line-clamp-3">
                                {t.injectedPrompt}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-text-muted text-[11px]">No trace events recorded.</p>
                    )}
                  </div>
                )}

                {/* TAB 3: Raw JSON */}
                {sim.activeTab === "json" && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-text">Raw JSON Response:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy(JSON.stringify(sim.result.body, null, 2))}
                        className="text-[11px] h-6 px-2 gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copied ? "check" : "content_copy"}
                        </span>
                        {copied ? "Copied" : "Copy Payload"}
                      </Button>
                    </div>
                    <pre className="bg-surface rounded-lg p-2.5 border border-border/50 font-mono text-[11px] text-text whitespace-pre-wrap select-text">
                      {JSON.stringify(sim.result.body, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
