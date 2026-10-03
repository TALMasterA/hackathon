"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { FURNITURE_LIBRARY } from "@/data/flat-preset";
import { editorText } from "@/i18n/editor";
import type { Flat, Language } from "@/types/domain";

export function LibraryPanel({ flat, selectedId, editable, fullRoomId, language, onAdd, onReplace, onDelete }: { flat: Flat; selectedId: string | null; editable: boolean; fullRoomId: string | null; language: Language; onAdd: (templateId: string) => void; onReplace: (templateId: string) => void; onDelete: (id: string) => void }) {
  const [templateId, setTemplateId] = useState(FURNITURE_LIBRARY[0].id);
  const template = FURNITURE_LIBRARY.find((entry) => entry.id === templateId)!;
  const room = flat.rooms.find((entry) => entry.id === fullRoomId);
  return (
    <section className="library-panel" aria-labelledby="library-title">
      <h2 id="library-title">{editorText(language, "library.title")}</h2>
      <label className="lock-endpoint" htmlFor="library-template">{editorText(language, "library.type")}<select id="library-template" value={templateId} disabled={!editable} onChange={(event) => setTemplateId(event.target.value)}>{FURNITURE_LIBRARY.map((entry) => <option value={entry.id} key={entry.id}>{entry.name[language]}</option>)}</select></label>
      <p className="library-size">{editorText(language, "library.size", templateDimensions(template))}</p>
      <div className="library-actions"><button type="button" className="secondary-button" disabled={!editable} onClick={() => onAdd(templateId)}><Plus size={17} aria-hidden="true" />{editorText(language, "library.add")}</button><button type="button" className="secondary-button" disabled={!editable || !selectedId} onClick={() => onReplace(templateId)}><ArrowLeftRight size={17} aria-hidden="true" />{editorText(language, "library.replace")}</button></div>
      {room && <p className="field-error" role="status">{editorText(language, "library.full", { room: room.name[language] })}</p>}
      {selectedId && <button type="button" className="delete-item-button" disabled={!editable} onClick={() => onDelete(selectedId)}><Trash2 size={16} aria-hidden="true" />{editorText(language, "editor.delete")}</button>}
    </section>
  );
}

function templateDimensions(template: { width: number; depth: number; height: number }): Record<string, number> {
  return { width: template.width, depth: template.depth, height: template.height };
}