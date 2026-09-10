"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Modal, Input } from "@/shared/components";

export default function ModelEditorPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-text-main">Model Editor</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Rename models, override upstream model IDs, set custom system prompts, and manage provider prefixes for your custom providers.
        </p>
      </div>
      <ModelEditorContent />
    </div>
  );
}

function ModelEditorContent() {
  const [providers, setProviders] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [editModel, setEditModel] = useState(null);
  const [editProvider, setEditProvider] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrefixModal, setShowPrefixModal] = useState(false);

  // Edit form state
  const [formTargetModel, setFormTargetModel] = useState("");
  const [formContextWindow, setFormContextWindow] = useState("");
  const [formSystemPrompt, setFormSystemPrompt] = useState("");
  const [formName, setFormName] = useState("");
  const [formPrefix, setFormPrefix] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [nodesRes, modelsRes, overridesRes] = await Promise.all([
        fetch("/api/provider-nodes").then(r => r.ok ? r.json() : { nodes: [] }).catch(() => ({ nodes: [] })),
        fetch("/api/models/custom").then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })),
        fetch("/api/model-editor").then(r => r.ok ? r.json() : { overrides: {} }).catch(() => ({ overrides: {} })),
      ]);
      const customNodes = (nodesRes.nodes || []).filter(n =>
        ["openai-compatible", "anthropic-compatible"].includes(n.type)
      );
      setProviders(customNodes);
      setCustomModels(modelsRes.models || []);
      setOverrides(overridesRes.overrides || {});
    } catch (e) {
      console.error("Failed to load model editor data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getProviderModels = (providerId) => {
    return customModels.filter(m => m.providerAlias === providerId);
  };

  const handleEditModel = (providerNode, model) => {
    const key = `${providerNode.id}|${model.id}`;
    const existing = overrides[key] || {};
    setEditModel({ key, provider: providerNode, model });
    setFormTargetModel(existing.targetModel || "");
    setFormContextWindow(existing.contextWindow ? String(existing.contextWindow) : "");
    setFormSystemPrompt(existing.systemPrompt || "");
    setFormName(existing.name || model.name || model.id);
    setShowEditModal(true);
  };

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!editModel) return;
    try {
      await fetch("/api/model-editor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: editModel.key,
          targetModel: formTargetModel,
          contextWindow: formContextWindow ? Number(formContextWindow) : 0,
          systemPrompt: formSystemPrompt,
          name: formName,
        }),
      });
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOverride = async (key) => {
    try {
      await fetch(`/api/model-editor?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditPrefix = (providerNode) => {
    setEditProvider(providerNode);
    setFormPrefix(providerNode.prefix || "");
    setShowPrefixModal(true);
  };

  const handleSavePrefix = async (e) => {
    e.preventDefault();
    if (!editProvider || !formPrefix.trim()) return;
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editProvider.id, prefix: formPrefix.trim() }),
      });
      if (res.ok) {
        setShowPrefixModal(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update prefix");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <Card padding="md">
        <div className="text-xs text-text-muted py-4">Loading model editor...</div>
      </Card>
    );
  }

  if (providers.length === 0) {
    return (
      <Card padding="md">
        <div className="text-xs text-text-muted italic py-2">
          No custom providers found. Add an OpenAI/Anthropic/MoonshotAI compatible provider first.
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {providers.map((prov) => {
          const models = getProviderModels(prov.id);
          return (
            <Card key={prov.id} padding="md" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      {prov.type === "anthropic-compatible" ? "extension" : "dns"}
                    </span>
                    <h3 className="text-base font-semibold text-text-main">{prov.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">Prefix:</span>
                    <code className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {prov.prefix}
                    </code>
                    <button
                      onClick={() => handleEditPrefix(prov)}
                      className="p-0.5 rounded text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="Edit prefix"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                  </div>
                  {prov.baseUrl && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-muted">Base URL:</span>
                      <code className="font-mono text-[11px] text-text-muted/80 truncate max-w-md">{prov.baseUrl}</code>
                    </div>
                  )}
                </div>
              </div>

              {models.length === 0 ? (
                <div className="text-xs text-text-muted italic py-1">
                  No models imported. Import models from Providers → {prov.name} → Compatible Models.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {models.map((model) => {
                    const overrideKey = `${prov.id}|${model.id}`;
                    const override = overrides[overrideKey];
                    return (
                      <div key={model.id} className="flex items-center justify-between p-2 rounded-lg border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm text-text-main truncate max-w-[200px]">{model.id}</code>
                            {override?.name && override.name !== model.id && (
                              <span className="text-xs text-primary">({"\u2192"} {override.name})</span>
                            )}
                          </div>
                          {override?.targetModel && (
                            <p className="text-[11px] text-text-muted mt-0.5">
                              {"\u2193"} upstream: <code className="font-mono">{override.targetModel}</code>
                            </p>
                          )}
                          {override?.systemPrompt && (
                            <p className="text-[11px] text-text-muted mt-0.5 italic truncate max-w-xl">
                              prompt: {'"'}{override.systemPrompt}{'"'}
                            </p>
                          )}
                          {override?.contextWindow > 0 && (
                            <p className="text-[11px] text-text-muted mt-0.5">
                              context: {(override.contextWindow / 1000).toFixed(0)}k tokens
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditModel(prov, model)}
                            className="p-1 rounded text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            title="Edit model override"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          {override && (
                            <button
                              onClick={() => handleDeleteOverride(overrideKey)}
                              className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                              title="Remove override"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Model Edit Modal */}
      {showEditModal && editModel && (
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title={`Edit Model: ${editModel.model.id}`}
        >
          <form onSubmit={handleSaveOverride} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Display Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={editModel.model.id}
              />
              <p className="text-[11px] text-text-muted mt-1">Custom display name for this model.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Target Model (Override upstream ID)</label>
              <Input
                value={formTargetModel}
                onChange={(e) => setFormTargetModel(e.target.value)}
                placeholder="Leave empty to use original model ID"
              />
              <p className="text-[11px] text-text-muted mt-1">
                If set, this model ID will be sent to the upstream provider instead of <code>{editModel.model.id}</code>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Context Window Override</label>
              <Input
                type="number"
                value={formContextWindow}
                onChange={(e) => setFormContextWindow(e.target.value)}
                placeholder="0 = use default"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Override context window in tokens (0 = no override). E.g. 128000 for 128k context.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Custom System Prompt</label>
              <textarea
                value={formSystemPrompt}
                onChange={(e) => setFormSystemPrompt(e.target.value)}
                placeholder="System instructions to prepend to all chats using this model..."
                rows={4}
                className="w-full rounded-[10px] border border-border/50 bg-surface-2 p-2.5 text-sm text-text-main placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 focus:bg-surface transition-all duration-150 ease-out"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Injected into system messages before processing requests for this model.
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Prefix Edit Modal */}
      {showPrefixModal && editProvider && (
        <Modal
          isOpen={showPrefixModal}
          onClose={() => setShowPrefixModal(false)}
          title={`Edit Prefix: ${editProvider.name}`}
        >
          <form onSubmit={handleSavePrefix} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Provider Prefix</label>
              <Input
                value={formPrefix}
                onChange={(e) => setFormPrefix(e.target.value)}
                placeholder="e.g. custom1"
                required
              />
              <p className="text-[11px] text-text-muted mt-1">
                Clients will call <code>{formPrefix || "PREFIX"}/model-name</code> to reach this provider.
                This replaces the previous prefix <code>{editProvider.prefix}</code>.
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button type="button" variant="secondary" onClick={() => setShowPrefixModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Prefix</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
