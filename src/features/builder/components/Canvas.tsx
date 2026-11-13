import { useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, GitBranch, GripVertical, MoreVertical, Plus, Scissors, Trash2 } from "lucide-react";
import type { FormDefinition, Question } from "@/schema/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getField } from "@/fields/registry";
import { fieldUi } from "@/fields/ui";
import { themeToCssVars } from "@/features/themes/theme";
import { QuestionBlock } from "@/features/renderer/FormRenderer";
import { cn } from "@/lib/utils";
import { useBuilder } from "../context";
import { newId } from "../factory";
import { questionsIn } from "../state";

type Section = FormDefinition["sections"][number];

function QuestionCard({ q, index, total }: { q: Question; index: number; total: number }) {
  const { form, dispatch, selectedId, select } = useBuilder();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id, data: { sectionId: q.sectionId } });
  const def = getField(q.type);
  const Icon = fieldUi[q.type].icon;
  const selected = selectedId === q.id;
  const number = form.questions.filter(x => !getField(x.type).isContent).findIndex(x => x.id === q.id) + 1;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("group relative", isDragging && "z-10 opacity-40")}>
      <div className={cn("flex rounded-lg border bg-card shadow-sm transition-colors", selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50")}>
        <button type="button" className="flex cursor-grab items-start px-1.5 pt-4 text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
          aria-label={`Reorder “${q.label || def.label}”. Press space to pick up, arrow keys to move.`} {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <div role="button" tabIndex={0} aria-pressed={selected} aria-label={`Edit ${def.label}: ${q.label || "untitled"}`}
          onClick={() => select(q.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(q.id); } }}
          className="min-w-0 flex-1 cursor-pointer py-3 pr-2 focus-visible:outline-none">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>{def.isContent ? def.label : `${number}. ${def.label}`}</span>
            {q.required && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Required</Badge>}
            {q.rules.length > 0 && <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]"><GitBranch className="h-3 w-3" aria-hidden="true" />{q.rules.length} rule{q.rules.length > 1 ? "s" : ""}</Badge>}
            {q.aiNotes && <Badge variant="warning" className="px-1.5 py-0 text-[10px]">Review</Badge>}
          </div>
          {/* Inert, themed preview of the real respondent input */}
          <div className="sf-root pointer-events-none rounded-md p-3 text-sm" aria-hidden="true" ref={el => el?.setAttribute("inert", "")} style={{ ...themeToCssVars(form.theme), fontSize: "0.9rem" }} data-input={form.theme.inputStyle} data-button={form.theme.buttonStyle}>
            <QuestionBlock q={q} value={undefined} onChange={() => {}} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Question actions"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => { const id = newId("q"); dispatch({ type: "duplicate_question", id: q.id, newId: id }); select(id); }}><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>
              <DropdownMenuItem disabled={index === 0} onSelect={() => dispatch({ type: "move_question", id: q.id, toSectionId: q.sectionId, toIndex: index - 1 })}><ArrowUp className="h-4 w-4" /> Move up</DropdownMenuItem>
              <DropdownMenuItem disabled={index === total - 1} onSelect={() => dispatch({ type: "move_question", id: q.id, toSectionId: q.sectionId, toIndex: index + 1 })}><ArrowDown className="h-4 w-4" /> Move down</DropdownMenuItem>
              {form.sections.length > 1 && <DropdownMenuSeparator />}
              {form.sections.filter(s => s.id !== q.sectionId).map(s => (
                <DropdownMenuItem key={s.id} onSelect={() => dispatch({ type: "move_question", id: q.id, toSectionId: s.id, toIndex: Number.MAX_SAFE_INTEGER })}>
                  Move to “{s.title || `Section ${form.sections.indexOf(s) + 1}`}”
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => { dispatch({ type: "delete_question", id: q.id }); if (selected) select(null); }}><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Duplicate question" onClick={() => { const id = newId("q"); dispatch({ type: "duplicate_question", id: q.id, newId: id }); select(id); }}><Copy className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete question" onClick={() => { dispatch({ type: "delete_question", id: q.id }); if (selected) select(null); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </li>
  );
}

function SectionBlock({ section, index }: { section: Section; index: number }) {
  const { form, dispatch, addQuestion, select } = useBuilder();
  const qs = questionsIn(form, section.id);
  const { setNodeRef, isOver } = useDroppable({ id: `section:${section.id}`, data: { sectionId: section.id } });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLast = index === form.sections.length - 1;
  return (
    <section aria-label={section.title || `Section ${index + 1}`} className="space-y-3">
      <div className="rounded-lg border border-dashed bg-muted/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="shrink-0">Section {index + 1}</Badge>
          <Input aria-label={`Section ${index + 1} title`} placeholder="Section title (optional)" value={section.title} maxLength={200}
            onChange={e => dispatch({ type: "update_section", id: section.id, patch: { title: e.target.value } })} className="h-8 min-w-0 flex-1 bg-background" />
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move section up" disabled={index === 0} onClick={() => dispatch({ type: "move_section", id: section.id, toIndex: index - 1 })}><ArrowUp className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move section down" disabled={isLast} onClick={() => dispatch({ type: "move_section", id: section.id, toIndex: index + 1 })}><ArrowDown className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete section" disabled={form.sections.length === 1}
              onClick={() => (qs.length ? setConfirmDelete(true) : dispatch({ type: "delete_section", id: section.id }))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <Input aria-label={`Section ${index + 1} description`} placeholder="Description (optional)" value={section.description ?? ""} maxLength={2000}
          onChange={e => dispatch({ type: "update_section", id: section.id, patch: { description: e.target.value || undefined } })} className="mt-2 h-8 bg-background text-sm" />
      </div>

      <SortableContext id={section.id} items={qs.map(q => q.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn("min-h-[3.5rem] space-y-3 rounded-lg transition-colors", isOver && "bg-primary/5 outline-dashed outline-2 outline-primary/40")}>
          {qs.map((q, i) => <QuestionCard key={q.id} q={q} index={i} total={qs.length} />)}
          {qs.length === 0 && <li className="flex h-14 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Empty section — add a field or drag one here</li>}
        </ul>
      </SortableContext>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => { select(null); addQuestion("short_text", section.id); }}><Plus className="h-4 w-4" /> Add question</Button>
        {!isLast && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Scissors className="h-3.5 w-3.5" aria-hidden="true" /> Page break after this section
            <Switch checked={section.pageBreakAfter} onCheckedChange={v => dispatch({ type: "update_section", id: section.id, patch: { pageBreakAfter: v } })} aria-label="Page break after this section" />
          </label>
        )}
      </div>
      {section.pageBreakAfter && !isLast && <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" aria-hidden="true"><span className="h-px flex-1 bg-border" />Page break<span className="h-px flex-1 bg-border" /></div>}

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete section?" confirmLabel="Delete section" destructive
        description={`Its ${qs.length} question(s) will be moved into the ${index === 0 ? "next" : "previous"} section. You can undo this.`}
        onConfirm={() => dispatch({ type: "delete_section", id: section.id })} />
    </section>
  );
}

/** Centre panel: sections, sortable questions (pointer + keyboard drag-and-drop), page breaks. */
export function Canvas() {
  const { form, dispatch } = useBuilder();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const active = activeId ? form.questions.find(q => q.id === activeId) : undefined;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const overId = String(over.id);
    if (overId.startsWith("section:")) {
      const sectionId = overId.slice("section:".length);
      dispatch({ type: "move_question", id: String(a.id), toSectionId: sectionId, toIndex: Number.MAX_SAFE_INTEGER });
      return;
    }
    const target = form.questions.find(q => q.id === overId);
    if (!target) return;
    const list = questionsIn(form, target.sectionId);
    dispatch({ type: "move_question", id: String(a.id), toSectionId: target.sectionId, toIndex: list.findIndex(q => q.id === overId) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-6">
        {form.sections.map((s, i) => <SectionBlock key={s.id} section={s} index={i} />)}
        <Button variant="secondary" className="w-full" onClick={() => dispatch({ type: "add_section", section: { id: newId("s"), title: "", pageBreakAfter: false } })}>
          <Plus className="h-4 w-4" /> Add section
        </Button>
      </div>
      <DragOverlay>
        {active && <div className="rounded-lg border border-primary bg-card px-4 py-3 text-sm shadow-lg">{active.label || getField(active.type).label}</div>}
      </DragOverlay>
    </DndContext>
  );
}
