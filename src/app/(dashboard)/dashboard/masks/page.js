"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Modal, Input } from "@/shared/components";

export default function MasksPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-text-main">Model Masking</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Create model aliases that forward requests to target models and/or inject custom system prompts.
        </p>
      </div>
      <MasksContent />
    </div>
  );
}

function MasksContent() {
  const [masks, setMasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlias, setEditingAlias] = useState(null);
  const [alias, setAlias] = useState("");
  const [targetModel, setTargetModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const fetchMasks = useCallback(async () => {
    try {
      const res = await fetch("/api/models/masks");
      if (res.ok) {
        const data = await res.json();
        setMasks(data.masks || {});
      }
    } catch (e) {
      console.error("Failed to fetch masks", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMasks();
  }, [fetchMasks]);

  const handleOpenAdd = () => {
    setEditingAlias(null);
    setAlias("");
    setTargetModel("");
    setSystemPrompt("");
    setShowModal(true);
  };

  const handleOpenEdit = (key, data) => {
    setEditingAlias(key);
    setAlias(key);
    setTargetModel(data?.targetModel || "");
    setSystemPrompt(data?.systemPrompt || "");
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!alias.trim()) return;
    try {
      const res = await fetch("/api/models/masks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: alias.trim(), targetModel, systemPrompt }),
      });
      if (res.ok) {
        setShowModal(false);
        fetchMasks();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save model mask");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (key) => {
    if (!confirm(`Delete model mask "${key}"?`)) return;
    try {
      const res = await fetch(`/api/models/masks?alias=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (res.ok) {
        fetchMasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const maskList = Object.entries(masks || {});

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">swap_horiz</span>
            Model Masking &amp; Custom Prompts
          </h3>
        </div>
        <Button icon="add" size="sm" onClick={handleOpenAdd}>
          Add Mask
        </Button>
      </div>

      {loading ? (
        <div className="text-xs text-text-muted py-4">Loading model masks...</div>
      ) : maskList.length === 0 ? (
        <div className="text-xs text-text-muted italic py-2">No model masks defined.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {maskList.map(([key, data]) => (
            <div
              key={key}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm font-semibold text-primary truncate max-w-[200px]">{key}</code>
                  {data?.targetModel && (
                    <span className="text-xs text-text-muted flex items-center gap-1 min-w-0">
                      <span className="material-symbols-outlined text-[14px] shrink-0">arrow_forward</span>
                      <code className="font-mono truncate max-w-[240px]">{data.targetModel}</code>
                    </span>
                  )}
                </div>
                {data?.systemPrompt && (
                  <p className="text-xs text-text-muted mt-1 truncate max-w-xl italic">
                    Prompt: &quot;{data.systemPrompt}&quot;
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleOpenEdit(key, data)}
                  className="p-1 rounded text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  title="Edit"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(key)}
                  className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingAlias ? `Edit Mask: ${editingAlias}` : "Add Model Mask"}
        >
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Mask Alias Name *</label>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. gpt-4o-custom"
                disabled={!!editingAlias}
                required
              />
              <p className="text-[11px] text-text-muted mt-1">The model name clients will request.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Target Model (Optional)</label>
              <Input
                value={targetModel}
                onChange={(e) => setTargetModel(e.target.value)}
                placeholder="e.g. claude-3-5-sonnet-20241022"
              />
              <p className="text-[11px] text-text-muted mt-1">If set, overrides the model called under the hood.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Custom System Prompt (Optional)</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System instructions to prepend to all chats using this mask..."
                rows={4}
                className="w-full rounded-[10px] border border-border/50 bg-surface-2 p-2.5 text-sm text-text-main placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-surface transition-all duration-150 ease-out"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Injected into system messages before processing.
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Mask</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
