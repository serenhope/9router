"use client";

import { useState } from "react";
import { Modal, Button } from "@/shared/components";

export function PromptImportModal({ isOpen, onClose, onImport, loading = false }) {
  const [jsonText, setJsonText] = useState("");
  const [importMode, setImportMode] = useState("merge"); // "merge" | "replace"
  const [parsedRules, setParsedRules] = useState([]);
  const [parseError, setParseError] = useState("");

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setJsonText(content);
        validateAndParse(content);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const validateAndParse = (raw) => {
    try {
      setParseError("");
      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : Array.isArray(data.rules) ? data.rules : null;

      if (!candidates || candidates.length === 0) {
        setParsedRules([]);
        setParseError("No valid rules array found in JSON");
        return;
      }

      // Basic validation
      const valid = candidates.filter((r) => r && typeof r === "object" && (r.name || r.content));
      if (valid.length === 0) {
        setParsedRules([]);
        setParseError("JSON does not contain any valid prompt injection rules");
        return;
      }

      setParsedRules(valid);
    } catch (err) {
      setParsedRules([]);
      setParseError(err.message || "Invalid JSON syntax");
    }
  };

  const handleTextChange = (text) => {
    setJsonText(text);
    if (text.trim()) {
      validateAndParse(text);
    } else {
      setParsedRules([]);
      setParseError("");
    }
  };

  const handleConfirm = async () => {
    if (parsedRules.length === 0) return;
    const res = await onImport(parsedRules, importMode);
    if (res?.success) {
      onClose();
    } else if (res?.error) {
      setParseError(res.error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Prompt Injection Rules"
      size="lg"
    >
      <div className="flex flex-col gap-4 text-xs">
        <p className="text-text-muted">
          Import prompt injection configurations from a exported JSON backup file or paste JSON directly.
        </p>

        {parseError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{parseError}</span>
          </div>
        )}

        {/* Upload file or paste area */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-text">Upload JSON File</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="text-xs text-text-muted file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-border file:text-xs file:bg-surface file:hover:bg-surface-hover file:text-text cursor-pointer"
            />
          </div>

          <textarea
            rows={6}
            placeholder="Or paste JSON array or backup export object here..."
            value={jsonText}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full bg-surface border border-border/60 rounded-xl p-3 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-y"
          />
        </div>

        {/* Import Mode Radio */}
        <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-border/50 bg-surface/50">
          <label className="font-semibold text-text">Import Strategy</label>
          <div className="flex items-center gap-4 mt-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="merge"
                checked={importMode === "merge"}
                onChange={() => setImportMode("merge")}
                className="text-primary focus:ring-primary"
              />
              <span className="text-text">Merge with Existing Rules</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="replace"
                checked={importMode === "replace"}
                onChange={() => setImportMode("replace")}
                className="text-red-500 focus:ring-red-500"
              />
              <span className="text-red-500 font-medium">Replace All Existing Rules</span>
            </label>
          </div>
        </div>

        {/* Preview of rules detected */}
        {parsedRules.length > 0 && (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-500 flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                {parsedRules.length} Rule(s) Detected
              </span>
              <span className="text-[11px] text-text-muted">Ready to import</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1 max-h-24 overflow-y-auto">
              {parsedRules.map((r, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-surface border border-border/50 text-[11px] font-medium text-text truncate max-w-[200px]"
                >
                  {r.name || `Rule #${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={parsedRules.length === 0 || loading}
            className="gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            {loading ? "Importing..." : `Import ${parsedRules.length} Rule(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
