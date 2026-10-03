"use client";

import { useEffect, useReducer, type ComponentType } from "react";
import { AppHeader } from "@/components/app-header";
import { FloorPlan } from "@/components/plan/floor-plan";
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
import { createEditorState, editorReducer } from "./state";

export interface EditorSceneProps {
  flat: Flat;
  furniture: readonly FlatFurniture[];
  baseline: readonly FlatFurniture[];
  issues: readonly LayoutViolation[];
  selectedId: string | null;
  focusedIds: readonly string[];
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
  const text = (key: Parameters<typeof editorText>[1]) => editorText(state.language, key);
  const select = (id: string) => dispatch({ type: "select", id });

  useEffect(() => {
    document.documentElement.lang = state.language;
    document.title = `FitIn | ${editorText(state.language, "editor.title")}`;
  }, [state.language]);

  return (
    <div className="app-shell" lang={state.language} data-testid="flat-editor" data-view={state.view}>
      <a className="skip-link" href="#item-details">{translate(state.language, "app.skip")}</a>
      <AppHeader language={state.language} onLanguage={(language) => dispatch({ type: "language", language })} onReset={() => dispatch({ type: "reset" })} />
      <main id="main">
        <div className="overview"><div><p className="eyebrow">{text("editor.category")}</p><h1>{text("editor.title")}</h1></div><span className="demo-tag"><span />{text("editor.assumptions")}</span></div>
        <div className="flat-workspace">
          <div className="flat-main">
            <div className="layout-toolbar">
              <div className="segmented" role="group" aria-label={translate(state.language, "scene.comparison")}><button type="button" aria-pressed={state.view === "before"} onClick={() => dispatch({ type: "view", view: "before" })}>{translate(state.language, "scene.before")}</button><button type="button" aria-pressed={state.view === "after"} onClick={() => dispatch({ type: "view", view: "after" })}>{translate(state.language, "scene.after")}</button></div>
              <label className="room-picker">{text("editor.room")}<select value={state.selectedRoomId} onChange={(event) => dispatch({ type: "room", id: event.target.value })}>{flat.rooms.map((room) => <option value={room.id} key={room.id}>{room.name[state.language]}</option>)}</select></label>
              <div className="ceiling-control"><label htmlFor="ceiling-height">{text("editor.field.ceilingHeight")}</label><div className="input-with-unit"><input id="ceiling-height" type="text" inputMode="decimal" value={editable ? state.ceilingInput : String(snapshot.ceilingHeight)} disabled={!editable} aria-invalid={Boolean(state.ceilingIssue)} aria-describedby={`ceiling-range${state.ceilingIssue ? " ceiling-error" : ""}`} onChange={(event) => dispatch({ type: "ceiling", value: event.target.value })} /><span>{text("editor.unit")}</span></div><p id="ceiling-range">{editorText(state.language, "editor.ceilingRange", { min: flat.minimumHeight, max: flat.maximumHeight })}</p>{state.ceilingIssue && <p id="ceiling-error" className="field-error">{editorInputMessage(state.ceilingIssue, state.language)}</p>}</div>
            </div>
            <div className="flat-views">
              <section aria-label={text("editor.plan")}><div className="view-heading"><h2>{text("editor.plan")}</h2><span>{flat.width} × {flat.depth} {text("editor.unit")}</span></div><FloorPlan flat={flat} furniture={snapshot.furniture} issues={issues} selectedId={state.selectedId} focusedIds={state.focusedIds} positionLocks={state.locks.position} editable={editable} language={state.language} onSelect={select} onRoom={(id) => dispatch({ type: "room", id })} onPropose={(item) => dispatch({ type: "propose", item })} /></section>
              {SceneViewport && <section aria-label={text("editor.scene")}><div className="view-heading"><h2>{text("editor.scene")}</h2></div><SceneViewport key={state.cameraRevision} flat={flat} furniture={snapshot.furniture} baseline={[]} issues={issues} selectedId={state.selectedId} focusedIds={state.focusedIds} language={state.language} onSelect={select} /></section>}
            </div>
            <p className="scene-caption">{translate(state.language, "scene.caption")}</p>
            <IssuesPanel issues={issues} flat={flat} furniture={snapshot.furniture} language={state.language} onFocus={(issue) => dispatch({ type: "select", id: issue.itemId, focusedIds: issueItemIds(issue) })} />
            <SourcePanel language={state.language} />
          </div>
          <aside className="editor-sidebar" id="item-details" aria-label={text("editor.selected")}>
            <FurniturePanel item={selected} draft={state.draft} issues={state.inputIssues} editable={editable} positionLocked={Boolean(selected && state.locks.position.includes(selected.id))} language={state.language} onField={(field, value) => dispatch({ type: "draft", field, value })} onRotate={(angle) => { if (selected) dispatch({ type: "propose", item: { ...selected, orientation: angle } }); }} onBlur={() => dispatch({ type: "normalise-draft" })} />
            {state.lockNotice.length > 0 && <section className="lock-notice" role="status" data-testid="lock-notice"><h3>{text("locks.bounce")}</h3><ul>{state.lockNotice.map((issue) => <li key={issue.lockId}>{lockMessage(issue, state.current.furniture, state.language)}</li>)}</ul></section>}
            <ItemList furniture={snapshot.furniture} selectedId={state.selectedId} positionLocks={state.locks.position} language={state.language} onSelect={select} />
          </aside>
        </div>
      </main>
      <footer className="app-footer"><p>{translate(state.language, "footer.privacy")}</p><p>{translate(state.language, "footer.project")}</p></footer>
    </div>
  );
}