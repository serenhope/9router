"use client";

import { useState } from "react";
import { Modal, Button } from "@/shared/components";
import { PRESET_TEMPLATES, POSITION_LABELS } from "../constants/promptConstants";

export function TemplateLibraryModal({ isOpen, onClose, onApplyTemplate }) {
  const [selectedCategory, setSelectedCategory] = useState("all");

  if (!isOpen) return null;

  const categories = ["all", ...new Set(PRESET_TEMPLATES.map((t) => t.category).filter(Boolean))];
  const filtered = selectedCategory === "all"
    ? PRESET_TEMPLATES
    : PRESET_TEMPLATES.filter((t) => t.category === selectedCategory);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Prompt Template Library"
      size="lg"
    >
      <div className="flex flex-col gap-4 text-xs">
        <p className="text-text-muted">
          Select a production-ready starter template to rapidly bootstrap prompt injection rules for coding, safety guardrails, output formatting, or language enforcement.
        </p>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap border-b border-border/40 pb-2.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface hover:bg-surface-hover text-text-muted hover:text-text border border-border/50"
              }`}
            >
              {cat === "all" ? "All Templates" : cat}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((tmpl) => {
            const posCfg = POSITION_LABELS[tmpl.position] || POSITION_LABELS.system_prepend;
            return (
              <div
                key={tmpl.name}
                className="p-3.5 rounded-xl border border-border/60 bg-surface/60 flex flex-col justify-between gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-text text-xs leading-snug">
                      {tmpl.name}
                    </h4>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${posCfg.badge}`}>
                      {posCfg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-tight">
                    {tmpl.description}
                  </p>
                  <div className="bg-surface-hover/80 rounded-lg p-2 font-mono text-[10px] text-text/80 line-clamp-3 mt-1 border border-border/30">
                    {tmpl.content}
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    onClick={() => {
                      onApplyTemplate(tmpl);
                      onClose();
                    }}
                    className="gap-1 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    Use Template
                  </Button>
                </div>
              </div>
            );
          })}
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
