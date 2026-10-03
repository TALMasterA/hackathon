"use client";

import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { FURNITURE_LIBRARY } from "@/data/flat-preset";
import { editorText } from "@/i18n/editor";
import type { Flat, Language } from "@/types/domain";

export function LibraryPanel({ flat, selectedId, editable, fullRoomId, language, mode, templateId, onTemplate, onAdd, onReplace, onDelete }: { flat: Flat; selectedId: string | null; editable: boolean; fullRoomId: string | null; language: Language; mode: "add" | "replace"; templateId: string; onTemplate: (id: string) => void; onAdd: (templateId: string) => void; onReplace: (templateId: string) => void; onDelete: (id: string) => void }) {
  const template = FURNITURE_LIBRARY.find((entry) => entry.id === templateId)!;
  const room = flat.rooms.find((entry) => entry.id === fullRoomId);
  const titleId = `library-title-${mode}`;
  const inputId = `library-template-${mode}`;
  return (
    <section className="library-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{editorText(language, mode === "add" ? "library.title" : "library.replace")}</h2>
      <label className="lock-endpoint" htmlFor={inputId}>{editorText(language, "library.type")}<select id={inputId} value={templateId} disabled={!editable} onChange={(event) => onTemplate(event.target.value)}>{FURNITURE_LIBRARY.map((entry) => <option value={entry.id} key={entry.id}>{entry.name[language]}</option>)}</select></label>
      <p className="library-size">{editorText(language, "library.size", templateDimensions(template))}</p>
      <div className="library-actions">{mode === "add" ? <button type="button" className="secondary-button" disabled={!editable} onClick={() => onAdd(templateId)}><Plus size={17} aria-hidden="true" />{editorText(language, "library.add")}</button> : <button type="button" className="secondary-button" disabled={!editable || !selectedId} onClick={() => onReplace(templateId)}><ArrowLeftRight size={17} aria-hidden="true" />{editorText(language, "library.replace")}</button>}</div>
      {mode === "add" && room && <p className="field-error" role="status">{editorText(language, "library.full", { room: room.name[language] })}</p>}
      {mode === "replace" && selectedId && <button type="button" className="delete-item-button" disabled={!editable} onClick={() => onDelete(selectedId)}><Trash2 size={16} aria-hidden="true" />{editorText(language, "editor.delete")}</button>}
    </section>
  );
}

function templateDimensions(template: { width: number; depth: number; height: number }): Record<string, number> {
  return { width: template.width, depth: template.depth, height: template.height };
}