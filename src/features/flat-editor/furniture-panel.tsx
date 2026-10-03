import { LockKeyhole } from "lucide-react";
import { RotationDial } from "@/components/rotation-dial";
import { editorText } from "@/i18n/editor";
import { editorInputMessage } from "@/i18n/editor-messages";
import type { EditorInputIssue, FlatFurniture, FurnitureDraft, Language } from "@/types/domain";

export function EditorFieldInput({ field, value, language, issue, disabled, onChange, onBlur }: { field: keyof FurnitureDraft; value: string; language: Language; issue?: EditorInputIssue; disabled: boolean; onChange: (field: keyof FurnitureDraft, value: string) => void; onBlur: () => void }) {
  const id = `furniture-${field}`;
  return (
    <div className={`dimension-field ${issue ? "has-error" : ""}`}>
      <label htmlFor={id}>{editorText(language, `editor.field.${field}`)}</label>
      <div className="input-with-unit"><input id={id} name={field} type="text" inputMode="decimal" spellCheck={false} autoComplete="off" value={value} disabled={disabled} aria-invalid={Boolean(issue)} aria-describedby={`${id}-unit${issue ? ` ${id}-error` : ""}`} onChange={(event) => onChange(field, event.target.value)} onBlur={onBlur} /><span id={`${id}-unit`}>{field === "angle" ? "°" : editorText(language, "editor.unit")}</span></div>
      {issue && <p id={`${id}-error`} className="field-error">{editorInputMessage(issue, language)}</p>}
    </div>
  );
}

export function FurniturePanel({ item, draft, issues, editable, positionLocked, language, onField, onRotate, onBlur, onGestureStart, onGestureEnd }: { item: FlatFurniture | null; draft: FurnitureDraft | null; issues: readonly EditorInputIssue[]; editable: boolean; positionLocked: boolean; language: Language; onField: (field: keyof FurnitureDraft, value: string) => void; onRotate: (angle: number) => void; onBlur: () => void; onGestureStart: () => void; onGestureEnd: () => void }) {
  const input = (field: keyof FurnitureDraft) => <EditorFieldInput key={field} field={field} value={draft?.[field] ?? ""} language={language} issue={issues.find((issue) => issue.field === field)} disabled={!editable || (positionLocked && (field === "x" || field === "z"))} onChange={onField} onBlur={onBlur} />;
  return (
    <section className="item-detail" aria-labelledby="selected-item-title" data-testid="item-detail">
      <h2 id="selected-item-title">{editorText(language, "editor.selected")}</h2>
      {!item || !draft ? <p className="muted-text">{editorText(language, "editor.empty")}</p> : <>
        <div className="selected-item-heading"><strong>{item.name[language]}</strong>{positionLocked && <LockKeyhole size={17} aria-label={editorText(language, "locks.locked")} />}</div>
        {!editable && <p className="readonly-status">{editorText(language, "editor.readonly")}</p>}
        <h3 className="small-heading">{editorText(language, "editor.dimensions")}</h3>
        <div className="dimensions-grid">{(["width", "depth", "height"] as const).map(input)}</div>
        <h3 className="small-heading">{editorText(language, "editor.position")}</h3>
        <div className="position-grid">{input("x")}{input("z")}</div>
        <h3 className="small-heading">{editorText(language, "editor.rotation")}</h3>
        <div className="rotation-row"><RotationDial angle={item.orientation} language={language} disabled={!editable} onRotate={onRotate} onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} />{input("angle")}</div>
        {issues.length > 0 && <p className="input-status" role="status">{editorText(language, "editor.incomplete")}</p>}
      </>}
    </section>
  );
}