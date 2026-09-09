"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { Card, Button, Input, Select, ModelSelectModal, CardSkeleton } from "@/shared/components";
import { useModelCaps } from "@/shared/hooks/useModelCaps";

export default function ArenaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ArenaContent />
    </Suspense>
  );
}

function ArenaContent() {
  const [models, setModels] = useState(["", ""]);
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState([null, null]);
  const [loading, setLoading] = useState([false, false]);
  const [showModelPicker, setShowModelPicker] = useState(null); // index of model picker
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [activeApiKey, setActiveApiKey] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [providersRes, aliasesRes, keysRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/models/alias"),
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
        if (keysRes.ok) {
          const kData = await keysRes.json();
          const firstActiveKey = (kData.keys || []).find((k) => k.isActive !== false);
          if (firstActiveKey?.key) {
            setActiveApiKey(firstActiveKey.key);
          }
        }
      } catch (e) {
        console.error("Error fetching providers/aliases/keys:", e);
      }
    };
    fetchData();
  }, []);

  const handleSelectModel = (modelObj, index) => {
    const newModels = [...models];
    newModels[index] = modelObj.value;
    setModels(newModels);
    setShowModelPicker(null);
  };

  const handleRunComparison = async () => {
    if (!prompt.trim()) return;

    setResults([null, null]);
    setLoading([true, true]);

    // Fire requests in parallel
    models.forEach(async (model, index) => {
      if (!model) {
        setLoading((prev) => { const n = [...prev]; n[index] = false; return n; });
        return;
      }

      const start = Date.now();
      try {
        const headers = {
          "Content-Type": "application/json",
        };
        if (activeApiKey) {
          headers["Authorization"] = `Bearer ${activeApiKey}`;
        }
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          }),
        });
        
        const end = Date.now();
        const data = await res.json();
        
        setResults((prev) => {
          const n = [...prev];
          if (res.ok) {
            n[index] = {
              success: true,
              content: data.choices?.[0]?.message?.content || JSON.stringify(data),
              time: end - start,
              tokens: data.usage || {},
            };
          } else {
            n[index] = {
              success: false,
              content: data.error?.message || data.error || "Unknown Error",
              time: end - start,
            };
          }
          return n;
        });
      } catch (e) {
        setResults((prev) => {
          const n = [...prev];
          n[index] = { success: false, content: e.message, time: Date.now() - start };
          return n;
        });
      } finally {
        setLoading((prev) => { const n = [...prev]; n[index] = false; return n; });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">swords</span>
          Model Arena
        </h1>
        <p className="text-sm text-text-muted">
          Compare the speed, cost, and quality of two models side-by-side.
        </p>
      </div>

      <Card padding="md">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.map((model, index) => (
              <div key={index} className="flex flex-col gap-2">
                <label className="text-sm font-medium">Model {index + 1}</label>
                <div className="flex gap-2">
                  <Input
                    value={model}
                    onChange={(e) => {
                      const newModels = [...models];
                      newModels[index] = e.target.value;
                      setModels(newModels);
                    }}
                    placeholder="e.g. cc/claude-sonnet-4.5"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="secondary"
                    icon="search"
                    onClick={() => setShowModelPicker(index)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-medium">Test Prompt</label>
            <textarea
              className="w-full min-h-[120px] p-3 rounded-lg border border-border bg-surface-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="Write a python script to parse CSV..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex justify-end mt-2">
            <Button
              icon="play_arrow"
              onClick={handleRunComparison}
              disabled={!prompt.trim() || (!models[0] && !models[1]) || loading[0] || loading[1]}
            >
              {loading[0] || loading[1] ? "Running..." : "Run Comparison"}
            </Button>
          </div>
        </div>
      </Card>

      {(results[0] || results[1] || loading[0] || loading[1]) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((index) => (
            <Card key={index} padding="sm" className="h-full flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                <span className="font-mono text-sm font-semibold truncate pr-2">
                  {models[index] || "None"}
                </span>
                {results[index] && (
                  <span className={`text-xs px-2 py-1 rounded font-mono ${results[index].success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    {results[index].time}ms
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-auto bg-black/5 dark:bg-white/5 rounded-lg p-3">
                {loading[index] ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-3 text-text-muted">
                    <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                    <span className="text-sm">Waiting for response...</span>
                  </div>
                ) : results[index] ? (
                  <div className="flex flex-col h-full">
                    <pre className="text-sm font-mono whitespace-pre-wrap flex-1 break-words">
                      {results[index].content}
                    </pre>
                    {results[index].success && results[index].tokens && (
                      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-text-muted flex gap-4">
                        <span>Input: {results[index].tokens.prompt_tokens || 0}</span>
                        <span>Output: {results[index].tokens.completion_tokens || 0}</span>
                        <span>Total: {results[index].tokens.total_tokens || 0}</span>
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
          ))}
        </div>
      )}

      {showModelPicker !== null && (
        <ModelSelectModal
          isOpen={true}
          onClose={() => setShowModelPicker(null)}
          onSelect={(modelObj) => handleSelectModel(modelObj, showModelPicker)}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Select Model ${showModelPicker + 1}`}
        />
      )}
    </div>
  );
}
