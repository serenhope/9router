"use client";

import { useState, useEffect, useRef } from "react";
import { Modal, Button, Input, Toggle, ModelSelectModal } from "@/shared/components";
import {
  POSITION_LABELS,
  TARGET_TYPE_LABELS,
  CONDITION_TYPES,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  VARIABLE_CHIPS,
} from "../constants/promptConstants";

export function RuleEditorModal({
  isOpen,
  onClose,
  onSave,
  rule,
  combos = [],
  apiKeys = [],
  activeProviders = [],
  loading = false,
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    enabled: true,
    targetType: "all",
    targetCombos: [],
    targetModels: [],
    targetKeys: [],
    matchCondition: {
      type: "always",
      pattern: "",
      caseSensitive: false,
      logic: "AND",
      conditions: [],
    },
    position: "system_prepend",
    content: "",
    priority: 10,
  });

  const [activeTab, setActiveTab] = useState("scope"); // "scope" | "trigger" | "prompt"
  const [conditionMode, setConditionMode] = useState("simple"); // "simple" | "group"
  const [formError, setFormError] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showComboDropdown, setShowComboDropdown] = useState(false);
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  const [comboSearch, setComboSearch] = useState("");
  const [keySearch, setKeySearch] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");

  const textareaRef = useRef(null);

  const handleAddCustomModel = () => {
    const val = customModelInput.trim();
    if (!val) return;
    if (!formData.targetModels.includes(val)) {
      setFormData((p) => ({ ...p, targetModels: [...p.targetModels, val] }));
    }
    setCustomModelInput("");
  };

  useEffect(() => {
    if (rule) {
      const hasGroup =
        Array.isArray(rule.matchCondition?.conditions) &&
        rule.matchCondition.conditions.length > 0;
      setConditionMode(hasGroup ? "group" : "simple");

      setFormData({
        name: rule.name || "",
        description: rule.description || "",
        enabled: rule.enabled !== false,
        targetType: rule.targetType || "all",
        targetCombos: Array.isArray(rule.targetCombos) ? [...rule.targetCombos] : [],
        targetModels: Array.isArray(rule.targetModels) ? [...rule.targetModels] : [],
        targetKeys: Array.isArray(rule.targetKeys) ? [...rule.targetKeys] : [],
        matchCondition: {
          type: rule.matchCondition?.type || "always",
          pattern: rule.matchCondition?.pattern || "",
          caseSensitive: !!rule.matchCondition?.caseSensitive,
          logic: rule.matchCondition?.logic || "AND",
          conditions: hasGroup
            ? [...rule.matchCondition.conditions]
            : [
                {
                  field: "user_text",
                  operator: "contains",
                  value: "",
                  caseSensitive: false,
                },
              ],
        },
        position: rule.position || "system_prepend",
        content: rule.content || "",
        priority: rule.priority ?? 10,
      });
    } else {
      setConditionMode("simple");
      setFormData({
        name: "",
        description: "",
        enabled: true,
        targetType: "all",
        targetCombos: [],
        targetModels: [],
        targetKeys: [],
        matchCondition: {
          type: "always",
          pattern: "",
          caseSensitive: false,
          logic: "AND",
          conditions: [
            {
              field: "user_text",
              operator: "contains",
              value: "",
              caseSensitive: false,
            },
          ],
        },
        position: "system_prepend",
        content: "",
        priority: 10,
      });
    }
    setFormError("");
    setActiveTab("scope");
  }, [rule, isOpen]);

  const addConditionRow = () => {
    setFormData((p) => ({
      ...p,
      matchCondition: {
        ...p.matchCondition,
        conditions: [
          ...(p.matchCondition.conditions || []),
          { field: "user_text", operator: "contains", value: "", caseSensitive: false },
        ],
      },
    }));
  };

  const removeConditionRow = (index) => {
    setFormData((p) => ({
      ...p,
      matchCondition: {
        ...p.matchCondition,
        conditions: (p.matchCondition.conditions || []).filter((_, idx) => idx !== index),
      },
    }));
  };

  const updateConditionRow = (index, updates) => {
    setFormData((p) => ({
      ...p,
      matchCondition: {
        ...p.matchCondition,
        conditions: (p.matchCondition.conditions || []).map((c, idx) =>
          idx === index ? { ...c, ...updates } : c
        ),
      },
    }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      setFormError("Rule name is required");
      setActiveTab("scope");
      return;
    }
    if (!formData.content.trim()) {
      setFormError("Prompt content is required");
      setActiveTab("prompt");
      return;
    }

    setFormError("");
    const payload = {
      ...formData,
      matchCondition:
        conditionMode === "group"
          ? {
              logic: formData.matchCondition.logic || "AND",
              conditions: (formData.matchCondition.conditions || []).filter(
                (c) => c && (c.value || c.pattern)
              ),
            }
          : {
              type: formData.matchCondition.type || "always",
              pattern: formData.matchCondition.pattern || "",
              caseSensitive: !!formData.matchCondition.caseSensitive,
            },
    };
    const res = await onSave(payload);
    if (res?.success) {
      onClose();
    } else if (res?.error) {
      setFormError(res.error);
    }
  };

  const handleInsertVariable = (varName) => {
    if (!textareaRef.current) {
      setFormData((prev) => ({ ...prev, content: prev.content + varName }));
      return;
    }
    const area = textareaRef.current;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const prevText = formData.content || "";
    const nextText = prevText.substring(0, start) + varName + prevText.substring(end);
    setFormData((prev) => ({ ...prev, content: nextText }));
    setTimeout(() => {
      area.focus();
      area.setSelectionRange(start + varName.length, start + varName.length);
    }, 0);
  };

  const removeModelTag = (mod) => {
    setFormData((prev) => ({
      ...prev,
      targetModels: prev.targetModels.filter((m) => m !== mod),
    }));
  };

  const removeComboTag = (cmb) => {
    setFormData((prev) => ({
      ...prev,
      targetCombos: prev.targetCombos.filter((c) => c !== cmb),
    }));
  };

  const removeKeyTag = (kId) => {
    setFormData((prev) => ({
      ...prev,
      targetKeys: prev.targetKeys.filter((k) => k !== kId),
    }));
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        closeOnOverlay={false}
        title={rule ? (rule.id ? `Edit Rule: ${rule.name}` : `Create Rule from Template: ${rule.name}`) : "Create Prompt Injection Rule"}
        size="full"
        className="max-w-3xl"
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-xs">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              <span>{formError}</span>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-border/50 pb-2.5 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setActiveTab("scope")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
                activeTab === "scope"
                  ? "bg-primary text-white font-semibold shadow-xs"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
              1. Basics & Scope
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("trigger")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
                activeTab === "trigger"
                  ? "bg-primary text-white font-semibold shadow-xs"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt</span>
              2. Triggers & Conditions
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("prompt")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
                activeTab === "prompt"
                  ? "bg-primary text-white font-semibold shadow-xs"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              3. Prompt Content
            </button>
          </div>

          {/* TAB 1: Basics & Scope */}
          <div className={activeTab === "scope" ? "flex flex-col gap-3.5" : "hidden"}>
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-text">Rule Name *</label>
              <Input
                placeholder="e.g. Bahasa Indonesia Global Enforcer"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-text">Description</label>
                <Input
                  placeholder="Optional brief description of what this rule does..."
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-surface/50">
                <div>
                  <div className="font-semibold text-text">Rule Enabled</div>
                  <div className="text-[11px] text-text-muted">
                    When disabled, this rule is completely bypassed at 0ms cost.
                  </div>
                </div>
                <Toggle
                  checked={formData.enabled}
                  onChange={(checked) => setFormData((p) => ({ ...p, enabled: checked }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-text">Target Scope</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(TARGET_TYPE_LABELS).map(([typeKey, cfg]) => (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, targetType: typeKey }))}
                      className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        formData.targetType === typeKey
                          ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                          : "bg-surface border-border/60 text-text-muted hover:text-text hover:bg-surface-hover"
                      }`}
                    >
                      <div className="font-semibold text-xs">{cfg.label}</div>
                      <div className="text-[10px] opacity-75 mt-1 leading-tight line-clamp-2">
                        {cfg.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Models selection if not all */}
              {(formData.targetType === "models" || formData.targetType === "custom") && (
                <div className="flex flex-col gap-2 p-3 rounded-xl border border-purple-500/20 bg-purple-500/5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-purple-500">smart_toy</span>
                      Target Models / Wildcards
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => setShowModelPicker(true)}
                      className="gap-1 text-purple-500"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Pick Model
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-surface rounded-lg border border-border/50">
                    {formData.targetModels.length === 0 ? (
                      <span className="text-[11px] text-text-muted">
                        No specific models added. Click &quot;Pick Model&quot; or enter wildcard (e.g. claude-*-sonnet).
                      </span>
                    ) : (
                      formData.targetModels.map((m) => (
                        <span
                          key={m}
                          className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-mono text-[11px] flex items-center gap-1"
                        >
                          {m}
                          <button type="button" onClick={() => removeModelTag(m)}>
                            <span className="material-symbols-outlined text-[12px] hover:text-red-500">close</span>
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      placeholder="Type custom model or wildcard (e.g. claude-*-sonnet)..."
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomModel();
                        }
                      }}
                      className="text-xs h-7"
                    />
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={handleAddCustomModel}
                      className="h-7 px-3 text-xs shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Combos selection if not all */}
              {(formData.targetType === "combos" || formData.targetType === "custom") && (
                <div className="flex flex-col gap-2 p-3 rounded-xl border border-sky-500/20 bg-sky-500/5">
                  <span className="font-semibold text-text flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-sky-500">alt_route</span>
                    Target Combos
                  </span>

                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-surface rounded-lg border border-border/50">
                    {formData.targetCombos.length === 0 ? (
                      <span className="text-[11px] text-text-muted">
                        Select combos from the list below.
                      </span>
                    ) : (
                      formData.targetCombos.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-mono text-[11px] flex items-center gap-1"
                        >
                          {c}
                          <button type="button" onClick={() => removeComboTag(c)}>
                            <span className="material-symbols-outlined text-[12px] hover:text-red-500">close</span>
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {combos.map((cmb) => {
                      const isSelected = formData.targetCombos.includes(cmb.name);
                      return (
                        <button
                          key={cmb.name}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              removeComboTag(cmb.name);
                            } else {
                              setFormData((p) => ({
                                ...p,
                                targetCombos: [...p.targetCombos, cmb.name],
                              }));
                            }
                          }}
                          className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                            isSelected
                              ? "bg-sky-500 text-white border-sky-500"
                              : "bg-surface hover:bg-surface-hover border-border/60 text-text"
                          }`}
                        >
                          {cmb.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* API Keys restriction (optional) */}
              {Array.isArray(apiKeys) && apiKeys.length > 0 && (
                <div className="flex flex-col gap-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-emerald-500">key</span>
                      Target API Keys (Optional Restriction)
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {formData.targetKeys.length === 0 ? "Applies to all keys" : `${formData.targetKeys.length} key(s) restricted`}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-surface rounded-lg border border-border/50">
                    {formData.targetKeys.length === 0 ? (
                      <span className="text-[11px] text-text-muted">
                        Applies to all API keys unless restricted to specific keys below.
                      </span>
                    ) : (
                      formData.targetKeys.map((kId) => {
                        const keyObj = apiKeys.find((k) => k.id === kId || k.key === kId || k.name === kId);
                        return (
                          <span
                            key={kId}
                            className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono text-[11px] flex items-center gap-1"
                          >
                            {keyObj?.name || kId}
                            <button type="button" onClick={() => removeKeyTag(kId)}>
                              <span className="material-symbols-outlined text-[12px] hover:text-red-500">close</span>
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {apiKeys.map((k) => {
                      const isSelected = formData.targetKeys.includes(k.id) || formData.targetKeys.includes(k.key);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              removeKeyTag(k.id);
                            } else {
                              setFormData((p) => ({
                                ...p,
                                targetKeys: [...p.targetKeys, k.id],
                              }));
                            }
                          }}
                          className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                            isSelected
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-surface hover:bg-surface-hover border-border/60 text-text"
                          }`}
                        >
                          {k.name || k.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          {/* TAB 2: Triggers & Conditions */}
          <div className={activeTab === "trigger" ? "flex flex-col gap-3.5" : "hidden"}>
            {/* Condition Mode Selector */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface/50 border border-border/40 gap-3">
              <span className="font-semibold text-text text-xs flex items-center gap-1.5 shrink-0">
                <span className="material-symbols-outlined text-[16px] text-primary">rule</span>
                Condition Builder Mode
              </span>
              <div className="flex items-center p-0.5 rounded-lg bg-surface border border-border/60">
                <button
                  type="button"
                  onClick={() => setConditionMode("simple")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap ${
                    conditionMode === "simple"
                      ? "bg-primary text-white shadow-xs font-semibold"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Simple Condition
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConditionMode("group");
                    if (!formData.matchCondition.conditions || formData.matchCondition.conditions.length === 0) {
                      addConditionRow();
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    conditionMode === "group"
                      ? "bg-primary text-white shadow-xs font-semibold"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  <span>Multi-Condition (AND/OR)</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      conditionMode === "group"
                        ? "bg-white/25 text-white"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    PRO
                  </span>
                </button>
              </div>
            </div>

            {conditionMode === "simple" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-text">Trigger Condition</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {CONDITION_TYPES.map((cond) => (
                      <button
                        key={cond.value}
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            matchCondition: { ...p.matchCondition, type: cond.value },
                          }))
                        }
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          formData.matchCondition.type === cond.value
                            ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                            : "bg-surface border-border/60 text-text-muted hover:text-text hover:bg-surface-hover"
                        }`}
                      >
                        <div className="font-semibold text-xs">{cond.label}</div>
                        <div className="text-[11px] opacity-75 mt-1 leading-tight">{cond.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {formData.matchCondition.type !== "always" && (
                  <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-semibold text-text">
                        {formData.matchCondition.type === "regex"
                          ? "Regular Expression Pattern (ReDoS Protected)"
                          : "Match Keywords (comma separated)"}
                      </label>
                      <Input
                        placeholder={
                          formData.matchCondition.type === "regex"
                            ? "e.g. ^(write|create)\\s+code"
                            : "e.g. coding, python, bug, refactor"
                        }
                        value={formData.matchCondition.pattern}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            matchCondition: { ...p.matchCondition, pattern: e.target.value },
                          }))
                        }
                        className="font-mono text-xs"
                      />
                      <span className="text-[11px] text-text-muted">
                        {formData.matchCondition.type === "not_contains"
                          ? "If user prompt contains any of these words, the rule will be skipped."
                          : formData.matchCondition.type === "regex"
                          ? "Max 250 characters. Catastrophic nested quantifiers are safely barred."
                          : "If user prompt contains any of these comma-separated keywords, the rule triggers."}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="caseSensitive"
                        checked={formData.matchCondition.caseSensitive}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            matchCondition: {
                              ...p.matchCondition,
                              caseSensitive: e.target.checked,
                            },
                          }))
                        }
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <label htmlFor="caseSensitive" className="text-xs text-text select-none cursor-pointer">
                        Case-sensitive matching
                      </label>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Compound Multi-Condition Builder */
              <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-primary/20 bg-surface/40">
                {/* Logic Group Header: AND / OR */}
                <div className="flex items-center justify-between pb-2.5 border-b border-border/40 gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text text-xs shrink-0">Match Logic:</span>
                    <div className="flex items-center p-0.5 rounded-lg bg-surface border border-border/60">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            matchCondition: { ...p.matchCondition, logic: "AND" },
                          }))
                        }
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          (formData.matchCondition.logic || "AND") === "AND"
                            ? "bg-primary text-white shadow-xs font-semibold"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        AND (All Must Match)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            matchCondition: { ...p.matchCondition, logic: "OR" },
                          }))
                        }
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          formData.matchCondition.logic === "OR"
                            ? "bg-primary text-white shadow-xs font-semibold"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        OR (Any Match)
                      </button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addConditionRow}
                    className="h-7 text-[11px] gap-1 px-3 shadow-xs shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Add Condition
                  </Button>
                </div>

                {/* Condition Rows List */}
                <div className="flex flex-col gap-2.5">
                  {(formData.matchCondition.conditions || []).map((cond, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-surface/70"
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-surface-hover text-text-muted shrink-0 border border-border/40 font-semibold">
                          IF #{idx + 1}
                        </span>

                        {/* Field Target Select */}
                        <select
                          value={cond.field || "user_text"}
                          onChange={(e) => updateConditionRow(idx, { field: e.target.value })}
                          className="bg-surface border border-border/60 text-xs rounded-lg px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary shrink-0 w-36 cursor-pointer"
                        >
                          {CONDITION_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>

                        {/* Operator Select */}
                        <select
                          value={cond.operator || "contains"}
                          onChange={(e) => updateConditionRow(idx, { operator: e.target.value })}
                          className="bg-surface border border-border/60 text-xs rounded-lg px-2.5 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary shrink-0 w-36 cursor-pointer"
                        >
                          {CONDITION_OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Value Input */}
                      <div className="flex-1 min-w-0">
                        <Input
                          placeholder="Keyword, regex, or value..."
                          value={cond.value || cond.pattern || ""}
                          onChange={(e) => updateConditionRow(idx, { value: e.target.value })}
                          className="text-xs h-8 w-full font-mono"
                        />
                      </div>

                      {/* Case sensitive toggle & Delete button */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <label className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!cond.caseSensitive}
                            onChange={(e) => updateConditionRow(idx, { caseSensitive: e.target.checked })}
                            className="rounded border-border text-primary focus:ring-primary text-xs"
                          />
                          <span className="whitespace-nowrap">Match case</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => removeConditionRow(idx)}
                          disabled={(formData.matchCondition.conditions || []).length <= 1}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:text-text-muted disabled:hover:bg-transparent transition-colors"
                          title="Remove condition"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* TAB 3: Prompt Content & Variables */}
          <div className={activeTab === "prompt" ? "flex flex-col gap-3.5" : "hidden"}>
            <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-text">Injection Placement *</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(POSITION_LABELS).map(([posKey, cfg]) => (
                    <button
                      key={posKey}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, position: posKey }))}
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all ${
                        formData.position === posKey
                          ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                          : "bg-surface border-border/60 text-text-muted hover:text-text hover:bg-surface-hover"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px] mt-0.5">{cfg.icon}</span>
                      <div>
                        <div className="font-semibold text-xs">{cfg.label}</div>
                        <div className="text-[10px] opacity-75 mt-0.5 leading-tight line-clamp-1">
                          {cfg.desc}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-text">Prompt Content *</label>
                  <span className="text-[11px] text-text-muted">
                    Supports dynamic variables
                  </span>
                </div>

                {/* Variable chips */}
                <div className="flex items-center gap-1.5 flex-wrap pb-1">
                  <span className="text-[11px] text-text-muted">Insert variable:</span>
                  {VARIABLE_CHIPS.map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => handleInsertVariable(v.label)}
                      className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border/60 text-primary font-mono text-[11px] transition-colors"
                      title={v.desc}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  rows={8}
                  placeholder="Enter prompt instructions to inject into requests..."
                  value={formData.content}
                  onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                  className="w-full bg-surface border border-border/60 rounded-xl p-3 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-y"
                  required
                />
              </div>
            </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3.5 border-t border-border/50 mt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {activeTab !== "scope" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setActiveTab(activeTab === "prompt" ? "trigger" : "scope")
                  }
                  className="gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  Back
                </Button>
              )}

              {/* In edit mode, allow quick Save Changes from any tab */}
              {rule?.id && activeTab !== "prompt" && (
                <Button type="submit" variant="secondary" disabled={loading} className="gap-1.5 shadow-xs">
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save Changes
                </Button>
              )}

              {activeTab !== "prompt" ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    setActiveTab(activeTab === "scope" ? "trigger" : "prompt")
                  }
                  className="gap-1.5 shadow-xs"
                >
                  <span>Next Step</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={loading} className="gap-1.5 shadow-xs">
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  {rule?.id ? "Save Changes" : "Create Rule"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Model Picker Modal Sub-dialog */}
      {showModelPicker && (
        <ModelSelectModal
          isOpen={showModelPicker}
          onClose={() => setShowModelPicker(false)}
          activeProviders={activeProviders}
          onSelect={(model) => {
            const val =
              typeof model === "string"
                ? model
                : model?.value || model?.name || model?.id || "";
            if (val && !formData.targetModels.includes(val)) {
              setFormData((prev) => ({
                ...prev,
                targetModels: [...prev.targetModels, val],
              }));
            }
            setShowModelPicker(false);
          }}
          selectedModel=""
          title="Select Target Model"
        />
      )}
    </>
  );
}
