"use client";

import { useState, useMemo } from "react";
import { PageShell, ConfirmModal } from "@/shared/components";
import { usePromptInjections } from "./hooks/usePromptInjections";
import { PromptInjectionHeader } from "./components/PromptInjectionHeader";
import { PromptMetricsBar } from "./components/PromptMetricsBar";
import { PromptFilterControls } from "./components/PromptFilterControls";
import { PromptRuleList } from "./components/PromptRuleList";
import { RuleEditorModal } from "./components/RuleEditorModal";
import { PlaygroundModal } from "./components/PlaygroundModal";
import { TemplateLibraryModal } from "./components/TemplateLibraryModal";
import { PromptImportModal } from "./components/PromptImportModal";
import { RuleHistoryModal } from "./components/RuleHistoryModal";

export default function PromptInjectionPage() {
  const {
    rules,
    setRules,
    combos,
    apiKeys,
    activeProviders,
    loading,
    actionLoading,
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
  } = usePromptInjections();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");

  // Modal states
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [playgroundTargetRule, setPlaygroundTargetRule] = useState(null);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTargetRule, setHistoryTargetRule] = useState(null);
  const [deletingRule, setDeletingRule] = useState(null);

  // Client-side filtering
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      // 1. Status filter
      if (statusFilter === "active" && !r.enabled) return false;
      if (statusFilter === "inactive" && r.enabled) return false;

      // 2. Target filter
      if (targetFilter === "all_traffic" && r.targetType !== "all") return false;
      if (targetFilter === "models" && r.targetType !== "models" && r.targetType !== "custom") return false;
      if (targetFilter === "combos" && r.targetType !== "combos" && r.targetType !== "custom") return false;

      // 3. Position filter
      if (positionFilter !== "all" && r.position !== positionFilter) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inName = (r.name || "").toLowerCase().includes(q);
        const inDesc = (r.description || "").toLowerCase().includes(q);
        const inContent = (r.content || "").toLowerCase().includes(q);
        const inCombos = (r.targetCombos || []).some((c) => c.toLowerCase().includes(q));
        const inModels = (r.targetModels || []).some((m) => m.toLowerCase().includes(q));
        const inPattern = (r.matchCondition?.pattern || "").toLowerCase().includes(q);
        return inName || inDesc || inContent || inCombos || inModels || inPattern;
      }

      return true;
    });
  }, [rules, statusFilter, targetFilter, positionFilter, searchQuery]);

  // Handlers
  const handleOpenNewRule = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (rule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleApplyTemplate = (template) => {
    setEditingRule({
      name: template.name,
      description: template.description,
      position: template.position,
      content: template.content,
      targetType: "all",
      enabled: true,
      priority: 10,
    });
    setEditorOpen(true);
  };

  const handleSaveRule = async (formData) => {
    if (editingRule && editingRule.id) {
      return await updateRule(editingRule.id, formData);
    } else {
      return await createRule(formData);
    }
  };

  const handleReorderRules = async (newRules) => {
    setRules(newRules);
    await reorderRules(newRules.map((r) => r.id));
  };

  const handleTestRule = (rule) => {
    setPlaygroundTargetRule(rule);
    setPlaygroundOpen(true);
  };

  const handleOpenHistory = (rule = null) => {
    setHistoryTargetRule(rule);
    setHistoryOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRule) return;
    await deleteRule(deletingRule.id);
    setDeletingRule(null);
  };

  const isFiltered = Boolean(
    searchQuery.trim() ||
      statusFilter !== "all" ||
      targetFilter !== "all" ||
      positionFilter !== "all"
  );

  return (
    <PageShell width="full">
      <div className="flex flex-col gap-5">
        {/* Header Bar */}
        <PromptInjectionHeader
          onNewRule={handleOpenNewRule}
          onOpenPlayground={() => {
            setPlaygroundTargetRule(null);
            setPlaygroundOpen(true);
          }}
          onOpenTemplates={() => setTemplateLibraryOpen(true)}
          onOpenHistory={() => handleOpenHistory(null)}
          onImport={() => setImportOpen(true)}
          onExport={exportRules}
          onRefresh={fetchRules}
          loading={loading}
        />

        {/* Real-time Metrics */}
        <PromptMetricsBar rules={rules} />

        {/* Filtering & Search Bar */}
        <PromptFilterControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          targetFilter={targetFilter}
          onTargetChange={setTargetFilter}
          positionFilter={positionFilter}
          onPositionChange={setPositionFilter}
        />

        {/* Rules Grid / List */}
        <PromptRuleList
          rules={filteredRules}
          loading={loading}
          onToggle={toggleRule}
          onEdit={handleOpenEdit}
          onDuplicate={duplicateRule}
          onDelete={(r) => setDeletingRule(r)}
          onTestRule={handleTestRule}
          onHistory={handleOpenHistory}
          onNewRule={handleOpenNewRule}
          onOpenTemplates={() => setTemplateLibraryOpen(true)}
          onReorder={handleReorderRules}
          isFiltered={isFiltered}
        />
      </div>

      {/* Modals & Sub-dialogs */}
      <RuleEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveRule}
        rule={editingRule}
        combos={combos}
        apiKeys={apiKeys}
        activeProviders={activeProviders}
        loading={actionLoading}
      />

      <PromptImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={importRules}
        loading={actionLoading}
      />

      <PlaygroundModal
        isOpen={playgroundOpen}
        onClose={() => setPlaygroundOpen(false)}
        combos={combos}
        targetRule={playgroundTargetRule}
      />

      <TemplateLibraryModal
        isOpen={templateLibraryOpen}
        onClose={() => setTemplateLibraryOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />

      <RuleHistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        targetRule={historyTargetRule}
        onRollback={rollbackRevision}
        fetchRevisions={fetchRevisions}
        loading={actionLoading}
      />

      <ConfirmModal
        isOpen={!!deletingRule}
        onClose={() => setDeletingRule(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Prompt Injection Rule"
        message={`Are you sure you want to delete "${deletingRule?.name}"? Upstream requests will no longer receive this instruction.`}
        confirmText="Delete Rule"
        variant="danger"
      />
    </PageShell>
  );
}
