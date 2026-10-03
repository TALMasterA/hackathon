"use client";

import { useState } from "react";
import { Link2, LockKeyhole, Save, Trash2 } from "lucide-react";
import { formatCm } from "@/i18n/dictionary";
import { editorText, type EditorTranslationKey } from "@/i18n/editor";
import type { LockSetupIssue } from "@/lib/geometry/locks";
import { polygonDistance, rectanglePolygon } from "@/lib/geometry/oriented";
import type { DistanceLock, FlatFurniture, Language, LayoutLocks } from "@/types/domain";

const setupKeys: Record<LockSetupIssue, EditorTranslationKey> = { "same-items": "locks.same", "missing-items": "locks.missing", "minimum-input": "locks.minimumInvalid" };

interface LocksPanelProps {
  furniture: readonly FlatFurniture[];
  locks: LayoutLocks;
  selectedId: string | null;
  editable: boolean;
  language: Language;
  setupIssue: LockSetupIssue | null;
  onPosition: (id: string) => void;
  onSave: (input: { id?: string; firstId: string; secondId: string; minimum: string }) => void;
  onRemove: (id: string) => void;
}

function DistanceLockRow({ lock, furniture, editable, language, onSave, onRemove }: { lock: DistanceLock; furniture: readonly FlatFurniture[]; editable: boolean; language: Language; onSave: LocksPanelProps["onSave"]; onRemove: LocksPanelProps["onRemove"] }) {
  const [minimum, setMinimum] = useState(String(lock.minimum));
  const first = furniture.find((item) => item.id === lock.firstId);
  const second = furniture.find((item) => item.id === lock.secondId);
  if (!first || !second) return null;
  const actual = polygonDistance(rectanglePolygon(first), rectanglePolygon(second));
  return (
    <li className="distance-lock-row" data-testid={`lock-${lock.id}`}>
      <div className="lock-row-names"><Link2 size={15} aria-hidden="true" /><strong>{first.name[language]} / {second.name[language]}</strong><span>{lock.id}</span></div>
      <p>{editorText(language, "locks.required", { distance: formatCm(lock.minimum, language) })} · {editorText(language, "locks.actual", { distance: formatCm(actual, language) })}</p>
      <form className="lock-row-edit" noValidate onSubmit={(event) => { event.preventDefault(); onSave({ ...lock, minimum }); }}>
        <div className="dimension-field"><label htmlFor={`minimum-${lock.id}`}>{editorText(language, "locks.minimum")}</label><div className="input-with-unit"><input id={`minimum-${lock.id}`} type="text" inputMode="decimal" value={minimum} disabled={!editable} onChange={(event) => setMinimum(event.target.value)} /><span>{editorText(language, "editor.unit")}</span></div></div>
        <button type="submit" className="icon-button" disabled={!editable} aria-label={`${editorText(language, "locks.update")} ${lock.id}`} title={editorText(language, "locks.update")} data-tooltip={editorText(language, "locks.update")}><Save size={17} aria-hidden="true" /></button>
        <button type="button" className="icon-button" disabled={!editable} aria-label={`${editorText(language, "locks.remove")} ${lock.id}`} title={editorText(language, "locks.remove")} data-tooltip={editorText(language, "locks.remove")} onClick={() => onRemove(lock.id)}><Trash2 size={17} aria-hidden="true" /></button>
      </form>
    </li>
  );
}

export function LocksPanel({ furniture, locks, selectedId, editable, language, setupIssue, onPosition, onSave, onRemove }: LocksPanelProps) {
  const [firstId, setFirstId] = useState(selectedId ?? furniture[0]?.id ?? "");
  const [secondId, setSecondId] = useState(furniture.find((item) => item.id !== (selectedId ?? furniture[0]?.id))?.id ?? "");
  const [minimum, setMinimum] = useState("0");
  const disabled = !editable || furniture.length < 2;
  const selector = (id: string, value: string, onChange: (id: string) => void, label: EditorTranslationKey) => <label className="lock-endpoint" htmlFor={id}>{editorText(language, label)}<select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{furniture.map((item) => <option value={item.id} key={item.id}>{item.name[language]} ({item.id})</option>)}</select></label>;
  return (
    <section className="locks-panel" aria-labelledby="locks-title" data-testid="locks-panel">
      <h2 id="locks-title">{editorText(language, "locks.title")}</h2>
      {selectedId && <label className="position-lock-toggle"><input type="checkbox" checked={locks.position.includes(selectedId)} disabled={!editable} onChange={() => onPosition(selectedId)} /><LockKeyhole size={16} aria-hidden="true" /><span>{editorText(language, "locks.position")}</span></label>}
      <h3 className="small-heading">{editorText(language, "locks.distance")}</h3>
      {locks.distance.length === 0 ? <p className="muted-text">{editorText(language, "locks.none")}</p> : <ul className="distance-lock-list">{locks.distance.map((lock) => <DistanceLockRow key={`${lock.id}-${lock.minimum}`} lock={lock} furniture={furniture} editable={editable} language={language} onSave={onSave} onRemove={onRemove} />)}</ul>}
      <form className="new-distance-lock" noValidate onSubmit={(event) => { event.preventDefault(); onSave({ firstId, secondId, minimum }); }}>
        {selector("lock-first", firstId, setFirstId, "locks.first")}
        {selector("lock-second", secondId, setSecondId, "locks.second")}
        <div className="dimension-field"><label htmlFor="lock-minimum">{editorText(language, "locks.minimum")}</label><div className="input-with-unit"><input id="lock-minimum" type="text" inputMode="decimal" value={minimum} disabled={disabled} aria-describedby={setupIssue ? "lock-input-error" : undefined} aria-invalid={setupIssue === "minimum-input"} onChange={(event) => setMinimum(event.target.value)} /><span>{editorText(language, "editor.unit")}</span></div></div>
        {setupIssue && <p className="field-error" id="lock-input-error" role="status">{editorText(language, setupKeys[setupIssue])}</p>}
        <button type="submit" className="secondary-button" disabled={disabled}><Link2 size={17} aria-hidden="true" />{editorText(language, "locks.add")}</button>
      </form>
    </section>
  );
}