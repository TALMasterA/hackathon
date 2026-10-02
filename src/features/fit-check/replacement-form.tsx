import { Armchair, MoveHorizontal, MoveVertical, Ruler } from "lucide-react";
import { DEMO_ROOM, EXISTING_FURNITURE } from "@/data/preset";
import { formatCm, translate, type TranslationKey } from "@/i18n/dictionary";
import { inputMessage } from "@/i18n/messages";
import type { InputField, InputIssue, Language, Orientation, ReplacementInput } from "@/types/domain";

interface ReplacementFormProps {
  language: Language;
  input: ReplacementInput;
  selectedId: string;
  issues: InputIssue[];
  onField: (field: InputField, value: string) => void;
  onOrientation: (orientation: Orientation) => void;
  onSelect: (id: string) => void;
  onCheck: () => void;
}

export function fieldId(field: InputField): string {
  return field === "roomHeight" ? "room-height" : `candidate-${field}`;
}

function DimensionField({ field, value, language, issue, onChange }: {
  field: InputField;
  value: string;
  language: Language;
  issue?: InputIssue;
  onChange: (field: InputField, value: string) => void;
}) {
  const id = fieldId(field);
  return (
    <div className={`dimension-field ${issue ? "has-error" : ""}`}>
      <label htmlFor={id}>{translate(language, `form.field.${field}`)}</label>
      <div className="input-with-unit">
        <input id={id} name={field} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={value} aria-invalid={Boolean(issue)} aria-describedby={`${id}-unit${issue ? ` ${id}-error` : ""}${field === "roomHeight" ? " room-height-range" : ""}`} onChange={(event) => onChange(field, event.target.value)} />
        <span id={`${id}-unit`}>{translate(language, "form.unit")}</span>
      </div>
      {issue && <p id={`${id}-error`} className="field-error">{inputMessage(issue, language)}</p>}
    </div>
  );
}

export function ReplacementForm({ language, input, selectedId, issues, onField, onOrientation, onSelect, onCheck }: ReplacementFormProps) {
  const text = (key: TranslationKey) => translate(language, key);
  const selected = EXISTING_FURNITURE.find((item) => item.id === selectedId);
  return (
    <form id="replacement-form" className="replacement-form" noValidate onSubmit={(event) => { event.preventDefault(); onCheck(); }}>
      <section className="room-form-section" aria-labelledby="room-settings-title">
        <div className="section-heading"><span className="section-index">01</span><h2 id="room-settings-title">{text("step.room")}</h2></div>
        <div className="room-settings">
          <p className="room-footprint">{translate(language, "room.dimensions", { width: DEMO_ROOM.width, depth: DEMO_ROOM.depth })}</p>
          <DimensionField field="roomHeight" value={input.roomHeight} language={language} issue={issues.find((issue) => issue.field === "roomHeight")} onChange={onField} />
        </div>
        <p className="field-hint" id="room-height-range">{translate(language, "room.heightRange", { min: DEMO_ROOM.minimumHeight, max: DEMO_ROOM.maximumHeight })}</p>
      </section>

      <fieldset className="furniture-selection">
        <legend><span className="section-index">02</span>{text("form.selection")}</legend>
        {EXISTING_FURNITURE.filter((item) => item.replaceable).map((item) => (
          <label className="furniture-option" key={item.id}>
            <input type="radio" name="furniture" value={item.id} checked={selectedId === item.id} onChange={() => onSelect(item.id)} />
            <Armchair size={26} className="furniture-icon" aria-hidden="true" />
            <span className="furniture-description"><strong>{item.name[language]}</strong><span>{translate(language, "form.existingSize", itemDimensions(item, language))}</span></span>
          </label>
        ))}
      </fieldset>

      <fieldset className="candidate-fields">
        <legend><span className="section-index">03</span>{text("form.new")}</legend>
        <div className="dimensions-grid">
          {(["width", "depth", "height"] as const).map((field) => <DimensionField key={field} field={field} value={input[field]} language={language} issue={issues.find((issue) => issue.field === field)} onChange={onField} />)}
        </div>
      </fieldset>

      <div className="orientation-row">
        <span id="orientation-label">{text("form.orientation")}</span>
        <div className="segmented orientation-switch" role="group" aria-labelledby="orientation-label">
          <button type="button" aria-pressed={input.orientation === 0} onClick={() => onOrientation(0)}><MoveHorizontal size={17} aria-hidden="true" />{text("form.zero")}</button>
          <button type="button" aria-pressed={input.orientation === 90} onClick={() => onOrientation(90)}><MoveVertical size={17} aria-hidden="true" />{text("form.ninety")}</button>
        </div>
      </div>
      {selected && <p className="position-note">{translate(language, "form.position", { x: selected.position.x, z: selected.position.z })}</p>}
      <button className="primary-button" type="submit"><Ruler size={19} aria-hidden="true" />{text("form.check")}</button>
    </form>
  );
}

function itemDimensions(item: { width: number; depth: number; height: number }, language: Language): Record<string, string> {
  return { width: formatCm(item.width, language), depth: formatCm(item.depth, language), height: formatCm(item.height, language) };
}