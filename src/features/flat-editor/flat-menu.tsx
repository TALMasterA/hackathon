"use client";

import { useRef, useState } from "react";
import { Building2, ChevronDown, Download, FileUp, House, ScanLine } from "lucide-react";
import { DEMO_FLAT } from "@/data/flat-preset";
import { editorText } from "@/i18n/editor";
import { flatFileName, parseFlatFile, serializeFlat, type FlatFileError } from "@/lib/floorplan/flat-file";
import type { Flat, Language } from "@/types/domain";

interface FlatMenuProps {
  flat: Flat;
  /** Whether switching would discard furniture, locks or undo history, so it asks first. */
  needsConfirm: boolean;
  language: Language;
  /** Opens the floor-plan trace screen; absent while tracing is unavailable. */
  onTrace?: () => void;
  onUse: (flat: Flat) => void;
}

type Notice = { tone: "status" | "error"; message: string };

export function FlatMenu({ flat, needsConfirm, language, onTrace, onUse }: FlatMenuProps) {
  const text = (key: Parameters<typeof editorText>[1], parameters?: Record<string, string | number>) => editorText(language, key, parameters);
  const menu = useRef<HTMLDetailsElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Flat | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const apply = (next: Flat) => {
    setPending(null);
    onUse(next);
    if (menu.current) menu.current.open = false;
  };
  const request = (next: Flat) => {
    setNotice(null);
    if (needsConfirm) setPending(next);
    else apply(next);
  };

  async function openFile(file: File | undefined) {
    if (!file) return;
    const result = file.size > 1_000_000 ? { ok: false as const, error: "too-large" as FlatFileError } : parseFlatFile(await file.text());
    if (!result.ok) {
      setNotice({ tone: "error", message: text(`flat.error.${result.error}`, { detail: "detail" in result ? result.detail ?? "" : "" }) });
      return;
    }
    setNotice({ tone: "status", message: text("flat.opened", { name: result.flat.name[language] }) });
    request(result.flat);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([serializeFlat(flat)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = flatFileName(flat);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <details ref={menu} className="layout-settings flat-menu" onToggle={(event) => { if (!event.currentTarget.open) setPending(null); }}>
      <summary><Building2 size={17} aria-hidden="true" />{text("flat.menu")}<ChevronDown size={15} aria-hidden="true" /></summary>
      <div className="layout-settings-body flat-menu-body">
        <p className="flat-menu-current">{text("flat.current", { name: flat.name[language] })}</p>
        {pending ? (
          <div className="flat-menu-confirm" role="alertdialog" aria-label={text("flat.switch")}>
            <p>{text("flat.confirm", { name: pending.name[language] })}</p>
            <div className="flat-menu-actions">
              <button type="button" className="primary-button" onClick={() => apply(pending)}>{text("flat.switch")}</button>
              <button type="button" className="secondary-button" onClick={() => setPending(null)}>{text("flat.cancel")}</button>
            </div>
          </div>
        ) : (
          <div className="flat-menu-actions">
            <button type="button" className="secondary-button" disabled={flat.id === DEMO_FLAT.id && flat.dimensionSource === DEMO_FLAT.dimensionSource} onClick={() => request(DEMO_FLAT)}><House size={17} aria-hidden="true" />{text("flat.demo")}</button>
            <button type="button" className="secondary-button" disabled={!onTrace} onClick={() => { if (menu.current) menu.current.open = false; onTrace?.(); }}><ScanLine size={17} aria-hidden="true" />{text("flat.trace")}</button>
            <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}><FileUp size={17} aria-hidden="true" />{text("flat.open")}</button>
            <button type="button" className="secondary-button" onClick={download}><Download size={17} aria-hidden="true" />{text("flat.download")}</button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ""; }} />
          </div>
        )}
        {notice && <p className={notice.tone === "error" ? "field-error" : "suggestion-status"} role={notice.tone === "error" ? "alert" : "status"}>{notice.message}</p>}
      </div>
    </details>
  );
}
