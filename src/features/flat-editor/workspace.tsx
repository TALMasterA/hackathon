"use client";

import { useEffect, useReducer, useState, type ComponentType } from "react";
import { Flag, Redo2, Undo2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FloorPlan, type PlanRequest } from "@/components/plan/floor-plan";
import { SourcePanel } from "@/components/source-panel";
import { DEMO_FLAT } from "@/data/flat-preset";
import { translate } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { editorInputMessage, lockMessage } from "@/i18n/editor-messages";
import { analyzeLayout, issueItemIds } from "@/lib/geometry/layout";
import type { Flat, FlatFurniture, Language, LayoutViolation } from "@/types/domain";
import { FurniturePanel } from "./furniture-panel";
import { IssuesPanel } from "./issues-panel";
import { ItemList } from "./item-list";
import { LocksPanel } from "./locks-panel";
import { LibraryPanel } from "./library-panel";
import { SuggestionsPanel } from "./suggestions-panel";
import { itemChanges } from "./layout";
import { createEditorState, editorReducer } from "./state";

export interface EditorSceneProps {
  flat: Flat;
  furniture: readonly FlatFurniture[];
  baseline: readonly FlatFurniture[];
  issues: readonly LayoutViolation[];
  selectedId: string | null;
  focusedIds: readonly string[];
  focusRoomId: string | null;
  /** Room-focus request sequence: every chip/Fit request reframes the camera, even for the same room. */
  focusRevision: number;
  language: Language;
  onSelect: (id: string) => void;
}

export function FlatEditorApp({ SceneViewport }: { SceneViewport?: ComponentType<EditorSceneProps> }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, createEditorState);
  const snapshot = state.view === "before" ? state.baseline : state.current;
  const flat = { ...DEMO_FLAT, height: snapshot.ceilingHeight };
  const issues = analyzeLayout(flat, snapshot.furniture, snapshot.ceilingHeight);
  const selected = snapshot.furniture.find((item) => item.id === state.selectedId) ?? null;
  const editable = state.view === "after";
  const changes = itemChanges(state.baseline, state.current);
  const removed = editable ? state.baseline.furniture.filter((item) => !state.current.furniture.some((entry) => entry.id === item.id)) : [];
  const text = (key: Parameters<typeof editorText>[1]) => editorText(state.language, key);
  const [focus, setFocus] = useState<PlanRequest>({ id: null, revision: 0 });
  const [reveal, setReveal] = useState<PlanRequest>({ id: null, revision: 0 });
  const select = (id: string) => dispatch({ type: "select", id });
  const selectAndReveal = (id: string, focusedIds?: string[]) => {
    dispatch({ type: "select", id, focusedIds });
    setReveal((previous) => ({ id, revision: previous.revision + 1 }));
  };
  const focusRoom = (id: string | null) => {
    if (id) dispatch({ type: "room", id });
    setFocus((previous) => ({ id, revision: previous.revision + 1 }));
  };

  useEffect(() => {
    document.documentElement.lang = state.language;
    document.title = `FitIn | ${editorText(state.language, "editor.title")}`;
  }, [state.language]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea")) return;
      const key = event.key.toLowerCase();
      const type = key === "z" ? (event.shiftKey ? "redo" : "undo") : key === "y" && event.ctrlKey && !event.shiftKey ? "redo" : null;
      if (!type) return;
      event.preventDefault();
      dispatch({ type });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app-shell" lang={state.language} data-testid="flat-editor" data-view={state.view}>
      <a className="skip-link" href="#item-details">{translate(state.language, "app.skip")}</a>
      <AppHeader language={state.language} onLanguage={(language) => dispatch({ type: "language", language })} onReset={() => { dispatch({ type: "reset" }); setFocus((previous) => ({ id: null, revision: previous.revision + 1 })); }} />
      <main id="main">
        <div className="overview"><div><p className="eyebrow">{text("editor.category")}</p><h1>{text("editor.title")}</h1></div><span className="demo-tag"><span />{text("editor.assumptions")}</span></div>
        <div className="flat-workspace">
          <div className="flat-main">
            <div className="layout-toolbar">
              <div className="segmented" role="group" aria-label={translate(state.language, "scene.comparison")}><button type="button" aria-pressed={state.view === "before"} onClick={() => dispatch({ type: "view", view: "before" })}>{translate(state.language, "scene.before")}</button><button type="button" aria-pressed={state.view === "after"} onClick={() => dispatch({ type: "view", view: "after" })}>{translate(state.language, "scene.after")}</button></div>
              <div className="history-tools"><button type="button" className="icon-button" disabled={!editable || state.past.length === 0} aria-label={text("editor.undo")} title={text("editor.undo")} data-tooltip={text("editor.undo")} onClick={() => dispatch({ type: "undo" })}><Undo2 size={18} aria-hidden="true" /></button><button type="button" className="icon-button" disabled={!editable || state.future.length === 0} aria-label={text("editor.redo")} title={text("editor.redo")} data-tooltip={text("editor.redo")} onClick={() => dispatch({ type: "redo" })}><Redo2 size={18} aria-hidden="true" /></button></div>
              <button type="button" className="baseline-button quiet-button" disabled={!editable || state.inputIssues.length > 0 || Boolean(state.ceilingIssue)} onClick={() => dispatch({ type: "baseline" })}><Flag size={17} aria-hidden="true" />{text("editor.baseline")}</button>
              <label className="room-picker">{text("editor.room")}<select value={state.selectedRoomId} onChange={(event) => focusRoom(event.target.value)}>{flat.rooms.map((room) => <option value={room.id} key={room.id}>{room.name[state.language]}</option>)}</select></label>
              <div className="ceiling-control"><label htmlFor="ceiling-height">{text("editor.field.ceilingHeight")}</label><div className="input-with-unit"><input id="ceiling-height" type="text" inputMode="decimal" value={editable ? state.ceilingInput : String(snapshot.ceilingHeight)} disabled={!editable} aria-invalid={Boolean(state.ceilingIssue)} aria-describedby={`ceiling-range${state.ceilingIssue ? " ceiling-error" : ""}`} onChange={(event) => dispatch({ type: "ceiling", value: event.target.value })} onBlur={() => dispatch({ type: "normalise-draft" })} /><span>{text("editor.unit")}</span></div><p id="ceiling-range">{editorText(state.language, "editor.ceilingRange", { min: flat.minimumHeight, max: flat.maximumHeight })}</p>{state.ceilingIssue && <p id="ceiling-error" className="field-error">{editorInputMessage(state.ceilingIssue, state.language)}</p>}</div>
            </div>
            <div className="flat-views">
              <section aria-label={text("editor.plan")}><div className="view-heading"><h2>{text("editor.plan")}</h2><span>{flat.width} × {flat.depth} {text("editor.unit")}</span></div><FloorPlan key={state.cameraRevision} flat={flat} furniture={snapshot.furniture} baseline={editable ? state.baseline.furniture : []} issues={issues} selectedId={state.selectedId} focusedIds={state.focusedIds} positionLocks={state.locks.position} editable={editable} language={state.language} onSelect={select} onRoom={(id) => dispatch({ type: "room", id })} onPropose={(item) => dispatch({ type: "propose", item })} focus={focus} reveal={reveal} onFocusRoom={focusRoom} onGestureStart={() => dispatch({ type: "gesture-start" })} onGestureEnd={() => dispatch({ type: "gesture-end" })} /></section>
              {SceneViewport && <section aria-label={text("editor.scene")}><div className="view-heading"><h2>{text("editor.scene")}</h2></div><SceneViewport key={state.cameraRevision} flat={flat} furniture={snapshot.furniture} baseline={editable ? state.baseline.furniture : []} issues={issues} selectedId={state.selectedId} focusedIds={state.focusedIds} focusRoomId={focus.id} focusRevision={focus.revision} language={state.language} onSelect={selectAndReveal} /></section>}
            </div>
            {editable && <p className="baseline-legend"><span className="baseline-swatch" />{text("editor.ghosts")}</p>}
            <p className="scene-caption">{translate(state.language, "scene.caption")}</p>
            <IssuesPanel issues={issues} flat={flat} furniture={snapshot.furniture} language={state.language} onFocus={(issue) => selectAndReveal(issue.itemId, issueItemIds(issue))} />
            <SourcePanel language={state.language} />
          </div>
          <aside className="editor-sidebar" id="item-details" aria-label={text("editor.selected")}>
            <SuggestionsPanel flat={flat} roomId={state.selectedRoomId} furniture={state.current.furniture} editable={editable} report={state.suggestionReport} language={state.language} onSuggest={(roomId) => dispatch({ type: "suggest", roomId })} />
            <FurniturePanel item={selected} draft={state.draft} issues={state.inputIssues} editable={editable} positionLocked={Boolean(selected && state.locks.position.includes(selected.id))} language={state.language} onField={(field, value) => dispatch({ type: "draft", field, value })} onRotate={(angle) => { if (selected) dispatch({ type: "propose", item: { ...selected, orientation: angle } }); }} onBlur={() => dispatch({ type: "normalise-draft" })} onGestureStart={() => dispatch({ type: "gesture-start" })} onGestureEnd={() => dispatch({ type: "gesture-end" })} />
            {state.lockNotice.length > 0 && <section className="lock-notice" role="status" data-testid="lock-notice"><h3>{text(state.lockNoticeContext === "edit" ? "locks.bounce" : "locks.notApplied")}</h3><ul>{state.lockNotice.map((issue) => <li key={issue.lockId}>{lockMessage(issue, state.current.furniture, state.language)}</li>)}</ul></section>}
            <LocksPanel key={`${state.cameraRevision}-${state.selectedId ?? "none"}`} furniture={state.current.furniture} locks={state.locks} selectedId={state.selectedId} editable={editable} language={state.language} setupIssue={state.lockSetupIssue} onPosition={(id) => dispatch({ type: "position-lock", id })} onSave={(input) => dispatch({ type: "distance-lock", ...input })} onRemove={(id) => dispatch({ type: "remove-distance-lock", id })} />
            <LibraryPanel key={state.cameraRevision} flat={flat} selectedId={state.selectedId} editable={editable} fullRoomId={state.libraryFullRoomId} language={state.language} onAdd={(templateId) => dispatch({ type: "add-item", templateId })} onReplace={(templateId) => dispatch({ type: "replace-item", templateId })} onDelete={(id) => dispatch({ type: "delete-item", id })} />
            <ItemList furniture={snapshot.furniture} selectedId={state.selectedId} positionLocks={state.locks.position} language={state.language} changes={changes} removed={removed} onSelect={selectAndReveal} />
          </aside>
        </div>
      </main>
      <footer className="app-footer"><p>{translate(state.language, "footer.privacy")}</p><p>{translate(state.language, "footer.project")}</p></footer>
    </div>
  );
}