"use client";

import { PromptRuleCard } from "./PromptRuleCard";
import { Button } from "@/shared/components";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";

export function PromptRuleList({
  rules = [],
  loading,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onTestRule,
  onHistory,
  onNewRule,
  onOpenTemplates,
  onReorder,
  isFiltered = false,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) {
      const newRules = arrayMove(rules, oldIndex, newIndex);
      onReorder?.(newRules);
    }
  };

  if (loading && rules.length === 0) {
    return (
      <div className="py-16 text-center text-text-muted flex flex-col items-center justify-center gap-3">
        <span className="material-symbols-outlined text-[32px] animate-spin text-primary">
          progress_activity
        </span>
        <p className="text-xs">Loading prompt injection rules...</p>
      </div>
    );
  }

  if (rules.length === 0) {
    if (isFiltered) {
      return (
        <div className="py-16 text-center border border-dashed border-border/70 rounded-2xl p-8 bg-surface/30 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center text-text-muted">
            <span className="material-symbols-outlined text-[28px]">filter_alt_off</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">No rules match your filters</h3>
            <p className="text-xs text-text-muted max-w-sm mt-1">
              Try adjusting your search query, scope filter, or position filter to see more rules.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="py-16 text-center border border-dashed border-border/70 rounded-2xl p-8 bg-surface/30 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center text-text-muted">
          <span className="material-symbols-outlined text-[28px]">tune</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">No prompt injection rules found</h3>
          <p className="text-xs text-text-muted max-w-sm mt-1">
            Create custom rules to automatically inject instructions, enforce personas, or format outputs across your LLM requests.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button variant="secondary" size="sm" onClick={onOpenTemplates} className="gap-1.5">
            <span className="material-symbols-outlined text-[16px]">auto_stories</span>
            Browse Templates
          </Button>
          <Button variant="primary" size="sm" onClick={onNewRule} className="gap-1.5">
            <span className="material-symbols-outlined text-[16px]">add</span>
            Create First Rule
          </Button>
        </div>
      </div>
    );
  }

  const isSortable = !isFiltered && rules.length > 1;

  if (isSortable) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={rules.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid grid-cols-1 gap-3">
            {rules.map((rule, idx) => (
              <PromptRuleCard
                key={rule.id}
                rule={rule}
                index={idx}
                onToggle={onToggle}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onTestRule={onTestRule}
                onHistory={onHistory}
                isSortable={true}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {rules.map((rule, idx) => (
        <PromptRuleCard
          key={rule.id}
          rule={rule}
          index={idx}
          onToggle={onToggle}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onTestRule={onTestRule}
          onHistory={onHistory}
          isSortable={false}
        />
      ))}
    </div>
  );
}
