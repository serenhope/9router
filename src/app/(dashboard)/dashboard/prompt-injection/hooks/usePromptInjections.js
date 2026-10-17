import { useState, useEffect, useCallback } from "react";

export function usePromptInjections() {
  const [rules, setRules] = useState([]);
  const [combos, setCombos] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [installedModels, setInstalledModels] = useState([]);
  const [activeProviders, setActiveProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/prompt-injection");
      if (!res.ok) throw new Error("Failed to load prompt injection rules");
      const data = await res.json();
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch (err) {
      setError(err.message || "Error fetching rules");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContextData = useCallback(async () => {
    try {
      const [combosRes, keysRes, modelsRes, providersRes] = await Promise.allSettled([
        fetch("/api/combos"),
        fetch("/api/api-keys"),
        fetch("/api/models"),
        fetch("/api/connections"),
      ]);

      if (combosRes.status === "fulfilled" && combosRes.value.ok) {
        const d = await combosRes.value.json();
        setCombos(Array.isArray(d.combos) ? d.combos : []);
      }
      if (keysRes.status === "fulfilled" && keysRes.value.ok) {
        const d = await keysRes.value.json();
        setApiKeys(Array.isArray(d.keys) ? d.keys : []);
      }
      if (modelsRes.status === "fulfilled" && modelsRes.value.ok) {
        const d = await modelsRes.value.json();
        const list = Array.isArray(d.models) ? d.models : Array.isArray(d) ? d : [];
        setInstalledModels(list);
      }
      if (providersRes.status === "fulfilled" && providersRes.value.ok) {
        const d = await providersRes.value.json();
        setActiveProviders(Array.isArray(d.connections) ? d.connections : []);
      }
    } catch {
      // Best-effort context load
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchContextData();
  }, [fetchRules, fetchContextData]);

  const createRule = async (ruleData) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/prompt-injection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create rule");
      await fetchRules();
      return { success: true, rule: data.rule };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const updateRule = async (id, ruleData) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/prompt-injection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ruleData, id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update rule");
      await fetchRules();
      return { success: true, rule: data.rule };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const deleteRule = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/prompt-injection?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete rule");
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const toggleRule = async (id, currentStatus) => {
    try {
      const nextStatus = !currentStatus;
      // Optimistic update
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: nextStatus } : r)));
      const res = await fetch("/api/prompt-injection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: nextStatus }),
      });
      if (!res.ok) {
        // Rollback
        setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: currentStatus } : r)));
        throw new Error("Failed to toggle status");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const duplicateRule = async (rule) => {
    const copy = {
      name: `${rule.name} (Copy)`,
      description: rule.description,
      enabled: false,
      targetType: rule.targetType,
      targetCombos: [...(rule.targetCombos || [])],
      targetModels: [...(rule.targetModels || [])],
      targetKeys: [...(rule.targetKeys || [])],
      matchCondition: { ...rule.matchCondition },
      position: rule.position,
      content: rule.content,
      priority: (rule.priority || 10) + 1,
    };
    return await createRule(copy);
  };

  const reorderRules = async (orderedIds) => {
    try {
      const res = await fetch("/api/prompt-injection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder rules");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const importRules = async (rulesToImport, mode = "merge") => {
    setActionLoading(true);
    try {
      if (!Array.isArray(rulesToImport) || rulesToImport.length === 0) {
        throw new Error("Invalid or empty rules array");
      }
      if (mode === "replace") {
        await Promise.allSettled(
          rules.map((existing) =>
            fetch(`/api/prompt-injection?id=${encodeURIComponent(existing.id)}`, { method: "DELETE" })
          )
        );
      }
      for (const r of rulesToImport) {
        await fetch("/api/prompt-injection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: r.name || "Imported Rule",
            description: r.description || "",
            enabled: r.enabled !== false,
            targetType: r.targetType || "all",
            targetCombos: r.targetCombos || [],
            targetModels: r.targetModels || [],
            targetKeys: r.targetKeys || [],
            matchCondition: r.matchCondition || { type: "always", pattern: "", caseSensitive: false },
            position: r.position || "system_prepend",
            content: r.content || "",
            priority: r.priority || 10,
          }),
        });
      }
      await fetchRules();
      return { success: true, count: rulesToImport.length };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  const exportRules = () => {
    const blob = new Blob([JSON.stringify({ version: "1.0", exportedAt: new Date().toISOString(), rules }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `9router-prompt-injections-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchRevisions = async (ruleId = null) => {
    try {
      const url = ruleId
        ? `/api/prompt-injection?action=history&ruleId=${encodeURIComponent(ruleId)}`
        : `/api/prompt-injection?action=history`;
      const res = await fetch(url);
      const data = await res.json();
      return data.revisions || [];
    } catch {
      return [];
    }
  };

  const rollbackRevision = async (revisionId) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/prompt-injection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", revisionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rollback failed");
      await fetchRules();
      return { success: true, rule: data.rule };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(false);
    }
  };

  return {
    rules,
    setRules,
    combos,
    apiKeys,
    installedModels,
    activeProviders,
    loading,
    actionLoading,
    error,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    duplicateRule,
    reorderRules,
    importRules,
    exportRules,
    fetchRevisions,
    rollbackRevision,
  };
}
