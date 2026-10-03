"use client";

import { useState } from "react";
import { positiveNumber } from "./trace-state";

interface NumberFieldProps {
  id: string;
  label: string;
  unit: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}

/** A centimetre field that commits only valid values within range and shows the last valid one on blur. */
export function NumberField({ id, label, unit, value, minimum, maximum, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? value : positiveNumber(draft);
  const invalid = parsed === null || parsed < minimum || parsed > maximum;
  return (
    <div className={`dimension-field ${invalid ? "has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="input-with-unit">
        <input id={id} type="text" inputMode="decimal" value={draft ?? String(value)} aria-invalid={invalid} onChange={(event) => {
          setDraft(event.target.value);
          const next = positiveNumber(event.target.value);
          if (next !== null && next >= minimum && next <= maximum && next !== value) onChange(next);
        }} onBlur={() => setDraft(null)} />
        <span>{unit}</span>
      </div>
      <p className="field-hint">{minimum}–{maximum} {unit}</p>
    </div>
  );
}
