"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, LoaderCircle, RotateCw, Trash2, X } from "lucide-react";
import { SceneErrorBoundary } from "@/components/scene/scene-error-boundary";
import { editorText, type EditorTranslationKey } from "@/i18n/editor";
import type { FlatFurniture, FurnitureKind, Language, LocalizedName } from "@/types/domain";
import { objectBounds } from "@/components/scene/model-object";
import { initialQuarterTurns, type Look } from "./looks";
import { LookError, modelCache, parseGlb, photoHash, resizePhoto, runModelJob, type JobPhase } from "./model3d-client";

const LookPreview = dynamic(() => import("./look-preview"), { ssr: false, loading: () => <div className="look-preview-loading"><LoaderCircle className="loading-icon" size={22} aria-hidden="true" /></div> });

interface Target {
  id: string;
  kind: FurnitureKind;
  name: LocalizedName;
  width: number;
  depth: number;
}

type Job =
  | { phase: "preparing"; target: Target }
  | { phase: "confirm"; target: Target; photo: Blob; hash: string | null; name: string; photoUrl: string }
  | { phase: JobPhase; target: Target; started: number };

type Notice = { tone: "error" | "status"; key: EditorTranslationKey; parameters?: Record<string, string | number> };

function progressText(job: Job, now: number, text: (key: EditorTranslationKey, parameters?: Record<string, string | number>) => string): string | null {
  if (job.phase === "confirm") return null;
  if (job.phase === "preparing") return text("look.preparing");
  return text(`look.phase.${job.phase}`, { seconds: Math.max(0, Math.round((now - job.started) / 1000)) });
}

export interface LookPanelProps {
  item: FlatFurniture | null;
  look: Look | undefined;
  editable: boolean;
  language: Language;
  onSet: (itemId: string, look: Look) => void;
  onTurn: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}

/** "3D look (optional)": an AI look from a confirmed product photo for the selected item. */
export function LookPanel({ item, look, editable, language, onSet, onTurn, onRemove }: LookPanelProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const text = (key: EditorTranslationKey, parameters?: Record<string, string | number>) => editorText(language, key, parameters);
  const busy = job !== null;
  const timed = job !== null && "started" in job;

  useEffect(() => () => abort.current?.abort(), []);
  // Elapsed seconds tick on their own while a job runs, not only when its phase changes.
  useEffect(() => {
    if (!timed) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timed]);

  const fail = (error: unknown) => {
    const code = error instanceof LookError ? error.code : "failed";
    setJob(null);
    setNotice({ tone: code === "cancelled" ? "status" : "error", key: `look.error.${code}` });
  };

  const apply = async (target: Target, glb: ArrayBuffer, name: string) => {
    const object = await parseGlb(glb);
    onSet(target.id, { object, quarterTurns: initialQuarterTurns(objectBounds(object), target), name, kind: target.kind });
  };

  const choosePhoto = async (file: File) => {
    if (!item) return;
    const target = { id: item.id, kind: item.kind, name: item.name, width: item.width, depth: item.depth };
    setNotice(null);
    setJob({ phase: "preparing", target });
    try {
      const photo = await resizePhoto(file);
      const hash = await photoHash(photo);
      const cached = modelCache.get(hash);
      if (cached) {
        await apply(target, cached, file.name);
        setJob(null);
        setNotice({ tone: "status", key: "look.cached" });
        return;
      }
      setJob({ phase: "confirm", target, photo, hash, name: file.name, photoUrl: URL.createObjectURL(photo) });
    } catch (error) {
      fail(error);
    }
  };

  const send = async () => {
    if (job?.phase !== "confirm") return;
    const { target, photo, hash, name, photoUrl } = job;
    URL.revokeObjectURL(photoUrl);
    const controller = new AbortController();
    abort.current = controller;
    const started = Date.now();
    setNow(started);
    setJob({ phase: "sending", target, started });
    try {
      const glb = await runModelJob(photo, { signal: controller.signal, onPhase: (phase) => setJob({ phase, target, started }) });
      modelCache.set(hash, glb);
      await apply(target, glb, name);
      setJob(null);
    } catch (error) {
      fail(error);
    } finally {
      abort.current = null;
    }
  };

  const cancel = () => {
    if (job?.phase === "confirm") {
      URL.revokeObjectURL(job.photoUrl);
      setJob(null);
      setNotice({ tone: "status", key: "look.error.cancelled" });
    } else abort.current?.abort();
  };

  const progress = job && progressText(job, now, text);
  const cancellable = job && job.phase !== "preparing" && job.phase !== "downloading";

  return (
    <section className="look-panel" aria-labelledby="look-title" data-testid="look-panel">
      <h2 id="look-title">{text("look.title")}</h2>
      <p className="constraint-note">{text("look.intro")}</p>
      {!item && !busy && <p className="muted-text">{text("look.none")}</p>}
      {item && look && (
        <div className="look-current">
          <p><strong>{text("look.current", { name: look.name })}</strong><br /><span>{text("look.madeByAi")}</span></p>
          <div className="look-preview" role="img" aria-label={text("look.preview", { width: item.width, depth: item.depth, height: item.height })}>
            <SceneErrorBoundary key={look.object.uuid} fallback={<p className="muted-text">{text("look.previewUnavailable")}</p>}>
              <LookPreview key={`${item.width}-${item.depth}-${item.height}`} look={look} item={item} />
            </SceneErrorBoundary>
          </div>
          <p className="constraint-note">{text("look.preview", { width: item.width, depth: item.depth, height: item.height })}</p>
          <div className="library-actions">
            <button type="button" className="secondary-button" disabled={!editable} onClick={() => onTurn(item.id)}><RotateCw size={17} aria-hidden="true" />{text("look.turn")}</button>
            <button type="button" className="secondary-button" disabled={!editable} onClick={() => onRemove(item.id)}><Trash2 size={17} aria-hidden="true" />{text("look.remove")}</button>
          </div>
        </div>
      )}
      {item && (
        <button type="button" className="secondary-button look-photo" disabled={!editable || busy} onClick={() => photoInput.current?.click()}><Camera size={17} aria-hidden="true" />{text("look.fromPhoto")}</button>
      )}
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choosePhoto(file); }} />
      {job?.phase === "confirm" && (
        <div className="look-consent" role="group" aria-labelledby="look-consent-text">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the resized photo */}
          <img src={job.photoUrl} alt="" />
          <p className="look-for">{text("look.for", { item: job.target.name[language] })}</p>
          <p id="look-consent-text">{text("look.consent")}</p>
          <div className="library-actions">
            <button type="button" className="secondary-button" onClick={() => void send()}><Check size={17} aria-hidden="true" />{text("look.confirm")}</button>
            <button type="button" className="secondary-button" onClick={cancel}><X size={17} aria-hidden="true" />{text("look.cancel")}</button>
          </div>
        </div>
      )}
      {progress && (
        <div className="look-progress" role="status">
          <p className="look-for">{text("look.for", { item: job.target.name[language] })}</p>
          <p><LoaderCircle className="loading-icon" size={16} aria-hidden="true" />{progress}</p>
          {cancellable && <button type="button" className="secondary-button" onClick={cancel}><X size={17} aria-hidden="true" />{text("look.cancel")}</button>}
        </div>
      )}
      {notice && <p className={notice.tone === "error" ? "field-error" : "suggestion-status"} role={notice.tone === "error" ? "alert" : "status"}>{text(notice.key, notice.parameters)}{notice.tone === "error" && ` ${text("look.keep")}`}</p>}
    </section>
  );
}
