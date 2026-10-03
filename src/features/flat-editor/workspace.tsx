"use client";

import { useEffect, useReducer, useRef, useState, type ComponentType } from "react";
import { ChevronDown, Flag, LockKeyhole, PanelRight, Redo2, Settings2, Undo2, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { FloorPlan, type PlanRequest } from "@/components/plan/floor-plan";
import { SourcePanel } from "@/components/source-panel";
import { FURNITURE_LIBRARY } from "@/data/flat-preset";
import { translate } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import { editorInputMessage, lockMessage } from "@/i18n/editor-messages";
import { analyzeLayout, issueItemIds } from "@/lib/geometry/layout";
import { LookPanel } from "@/features/model-looks/look-panel";
import { lookClearedBy, visibleLooks, type Looks } from "@/features/model-looks/looks";
import { useLooks } from "@/features/model-looks/use-looks";
import type { Flat, FlatFurniture, Language, LayoutViolation } from "@/types/domain";
import { FurniturePanel } from "./furniture-panel";
import { FlatMenu } from "./flat-menu";
import { CheckStatus, IssuesPanel } from "./issues-panel";
import { ItemList } from "./item-list";
import { LocksPanel } from "./locks-panel";
import { LibraryPanel } from "./library-panel";
import { SuggestionsPanel } from "./suggestions-panel";
import { itemChanges } from "./layout";
import { createEditorState, editorReducer, type EditorAction } from "./state";

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
  /** 3D looks of the displayed items, keyed by item ID; appearance only. */
  looks?: Looks;
  onSelect: (id: string) => void;
}

export function FlatEditorApp({ SceneViewport }: { SceneViewport?: ComponentType<EditorSceneProps> }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, createEditorState);
  const snapshot = state.view === "before" ? state.baseline : state.current;
  const flat = { ...state.flat, height: snapshot.ceilingHeight };
  const issues = analyzeLayout(flat, snapshot.furniture, snapshot.ceilingHeight);
  const selected = snapshot.furniture.find((item) => item.id === state.selectedId) ?? null;
  const editable = state.view === "after";
  const changes = itemChanges(state.baseline, state.current);
  const removed = editable ? state.baseline.furniture.filter((item) => !state.current.furniture.some((entry) => entry.id === item.id)) : [];
  const text = (key: Parameters<typeof editorText>[1]) => editorText(state.language, key);
  const [focus, setFocus] = useState<PlanRequest>({ id: null, revision: 0 });
  const [reveal, setReveal] = useState<PlanRequest>({ id: null, revision: 0 });
  const [tab, setTab] = useState<"furniture" | "selected" | "constraints">("furniture");
  const [lastSelectedId, setLastSelectedId] = useState(state.selectedId);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [visualization, setVisualization] = useState<"plan" | "scene">("plan");
  const [templateId, setTemplateId] = useState(FURNITURE_LIBRARY[0].id);
  const [removedLockFrom, setRemovedLockFrom] = useState<typeof state.locks | null>(null);
  const sidebar = useRef<HTMLElement>(null);
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  const inspectorClose = useRef<HTMLButtonElement>(null);
  if (lastSelectedId !== state.selectedId) {
    setLastSelectedId(state.selectedId);
    if (state.selectedId) {
      setTab("selected");
      setInspectorOpen(true);
    }
  }
  const looks = useLooks();
  const shownLooks = visibleLooks(looks.looks, snapshot.furniture);
  const replaceItem = (templateId: string) => {
    const action: EditorAction = { type: "replace-item", templateId };
    const cleared = lookClearedBy(action, state, editorReducer(state, action));
    dispatch(action);
    if (cleared) looks.update({ type: "remove", itemId: cleared });
  };
  const select = (id: string) => dispatch({ type: "select", id });
  const selectAndReveal = (id: string, focusedIds?: string[]) => {
    dispatch({ type: "select", id, focusedIds });
    setReveal((previous) => ({ id, revision: previous.revision + 1 }));
  };
  const focusRoom = (id: string | null) => {
    if (id) dispatch({ type: "room", id });
    setFocus((previous) => ({ id, revision: previous.revision + 1 }));
  };
  const closeInspector = () => {
    setInspectorOpen(false);
    inspectorTrigger.current?.focus();
  };
  const switchFlat = (next: Flat) => {
    dispatch({ type: "use-flat", flat: next });
    looks.update({ type: "clear" });
    setFocus((previous) => ({ id: null, revision: previous.revision + 1 }));
    setTab("furniture");
  };
  const switchNeedsConfirm = state.current.furniture.length > 0 || state.baseline.furniture.length > 0 || state.past.length > 0 || state.future.length > 0;
  const lockRemoved = removedLockFrom !== null && state.past.at(-1)?.locks === removedLockFrom;
  const libraryProps = { flat, selectedId: selected?.id ?? null, editable, fullRoomId: state.libraryFullRoomId, language: state.language, templateId, onTemplate: setTemplateId, onAdd: (id: string) => { if (focus.id) dispatch({ type: "room", id: focus.id }); dispatch({ type: "add-item", templateId: id }); }, onReplace: replaceItem, onDelete: (id: string) => dispatch({ type: "delete-item", id }) };
  const tabs = ["furniture", "selected", "constraints"] as const;
  const tabLabels = { furniture: text("editor.items"), selected: text("editor.selected"), constraints: text("editor.constraintsTab") };

  useEffect(() => {
    if (state.selectedId) sidebar.current?.scrollTo({ top: 0 });
  }, [state.selectedId]);

  useEffect(() => {
    if (inspectorOpen && window.matchMedia("(max-width: 767px)").matches) inspectorClose.current?.focus();
  }, [inspectorOpen]);

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
      <a className="skip-link" href="#item-details" onClick={() => { setTab("selected"); setInspectorOpen(true); requestAnimationFrame(() => document.getElementById("panel-selected")?.focus()); }}>{translate(state.language, "app.skip")}</a>
      <AppHeader language={state.language} onLanguage={(language) => dispatch({ type: "language", language })} onReset={() => { dispatch({ type: "reset" }); setFocus((previous) => ({ id: null, revision: previous.revision + 1 })); }} />
      <main id="main" className="editor-main">
        <div className="overview"><div><p className="eyebrow">{text("editor.category")}</p><h1>{text("editor.title")}</h1></div><span className="demo-tag"><span />{text(state.flat.dimensionSource === "user-traced" ? "editor.traced" : "editor.assumptions")}</span></div>
            <div className="layout-toolbar" aria-label={text("editor.title")}>
              <FlatMenu flat={flat} needsConfirm={switchNeedsConfirm} language={state.language} onUse={switchFlat} />
              <div className="segmented" role="group" aria-label={translate(state.language, "scene.comparison")}><button type="button" aria-pressed={state.view === "before"} onClick={() => dispatch({ type: "view", view: "before" })}>{translate(state.language, "scene.before")}</button><button type="button" aria-pressed={state.view === "after"} onClick={() => dispatch({ type: "view", view: "after" })}>{translate(state.language, "scene.after")}</button></div>
              <div className="history-tools"><button type="button" className="icon-button" disabled={!editable || state.past.length === 0} aria-label={text("editor.undo")} title={text("editor.undo")} data-tooltip={text("editor.undo")} onClick={() => dispatch({ type: "undo" })}><Undo2 size={18} aria-hidden="true" /></button><button type="button" className="icon-button" disabled={!editable || state.future.length === 0} aria-label={text("editor.redo")} title={text("editor.redo")} data-tooltip={text("editor.redo")} onClick={() => dispatch({ type: "redo" })}><Redo2 size={18} aria-hidden="true" /></button></div>
              <label className="room-picker">{text("editor.room")}<select value={focus.id ?? "all"} onChange={(event) => focusRoom(event.target.value === "all" ? null : event.target.value)}><option value="all">{text("plan.wholeFlat")}</option>{flat.rooms.map((room) => <option value={room.id} key={room.id}>{room.name[state.language]}</option>)}</select></label>
              <CheckStatus count={issues.length} itemCount={snapshot.furniture.length} language={state.language} />
              <details className="layout-settings">
                <summary><Settings2 size={17} aria-hidden="true" />{text("editor.settings")}<ChevronDown size={15} aria-hidden="true" /></summary>
                <div className="layout-settings-body">
              <div className="ceiling-control"><label htmlFor="ceiling-height">{text("editor.field.ceilingHeight")}</label><div className="input-with-unit"><input id="ceiling-height" type="text" inputMode="decimal" value={editable ? state.ceilingInput : String(snapshot.ceilingHeight)} disabled={!editable} aria-invalid={Boolean(state.ceilingIssue)} aria-describedby={`ceiling-range${state.ceilingIssue ? " ceiling-error" : ""}`} onChange={(event) => dispatch({ type: "ceiling", value: event.target.value })} onBlur={() => dispatch({ type: "normalise-draft" })} /><span>{text("editor.unit")}</span></div><p id="ceiling-range">{editorText(state.language, "editor.ceilingRange", { min: flat.minimumHeight, max: flat.maximumHeight })}</p>{state.ceilingIssue && <p id="ceiling-error" className="field-error">{editorInputMessage(state.ceilingIssue, state.language)}</p>}</div>
                  <button type="button" className="baseline-button secondary-button" disabled={!editable || state.inputIssues.length > 0 || Boolean(state.ceilingIssue)} onClick={() => dispatch({ type: "baseline" })}><Flag size={17} aria-hidden="true" />{text("editor.baseline")}</button>
                </div>
              </details>
              <button ref={inspectorTrigger} type="button" className="secondary-button inspector-trigger" aria-expanded={inspectorOpen} aria-controls="item-details" onClick={() => setInspectorOpen(!inspectorOpen)}><PanelRight size={17} aria-hidden="true" />{text("editor.inspector")}</button>
            </div>
        <div className="flat-workspace">
          <div className="flat-main" data-testid="workspace-scroll">
            {snapshot.furniture.length === 0 && <div className="workspace-empty"><p>{text("editor.noItems")}</p><button type="button" className="primary-button" disabled={!editable} onClick={() => dispatch({ type: "suggest", roomId: "all" })}><Flag size={17} aria-hidden="true" />{text("suggest.all")}</button></div>}
            {SceneViewport && <div className="segmented visualization-switch" role="group" aria-label={text("editor.plan")}><button type="button" aria-pressed={visualization === "plan"} onClick={() => setVisualization("plan")}>{text("editor.plan")}</button><button type="button" aria-pressed={visualization === "scene"} onClick={() => setVisualization("scene")}>{text("editor.scene")}</button></div>}
            <div className="flat-views" data-visualization={visualization} data-has-scene={Boolean(SceneViewport)}>
              <section className="visualization-card plan-card" aria-label={text("editor.plan")}><div className="view-heading"><h2>{text("editor.plan")}</h2><span>{flat.width} × {flat.depth} {text("editor.unit")}</span></div><FloorPlan key={state.cameraRevision} flat={flat} furniture={snapshot.furniture} baseline={editable ? state.baseline.furniture : []} issues={issues} selectedId={state.selectedId} focusedIds={state.focusedIds} positionLocks={state.locks.position} editable={editable} language={state.language} onSelect={select} onRoom={(id) => dispatch({ type: "room", id })} onPropose={(item) => dispatch({ type: "propose", item })} focus={focus} reveal={reveal} onFocusRoom={focusRoom} onGestureStart={() => dispatch({ type: "gesture-start" })} onGestureEnd={() => dispatch({ type: "gesture-end" })} /></section>
              {SceneViewport && <section className="visualization-card scene-card" aria-label={text("editor.scene")}><div className="view-heading"><h2>{text("editor.scene")}</h2></div><SceneViewport key={state.cameraRevision} flat={flat} furniture={snapshot.furniture} baseline={editable ? state.baseline.furniture : []} issues={issues} selectedId={state.selectedId} focusedIds={state.focusedIds} focusRoomId={focus.id} focusRevision={focus.revision} language={state.language} looks={shownLooks} onSelect={selectAndReveal} /><p className="plan-hint">{translate(state.language, "scene.caption")}</p></section>}
            </div>
            {editable && <p className="baseline-legend"><span className="baseline-swatch" />{text("editor.ghosts")}</p>}
            <IssuesPanel issues={issues} flat={flat} furniture={snapshot.furniture} language={state.language} onFocus={(issue) => selectAndReveal(issue.itemId, issueItemIds(issue))} />
            <SourcePanel language={state.language} flat={flat} />
          </div>
          <aside ref={sidebar} className="editor-sidebar" id="item-details" data-open={inspectorOpen} aria-label={text("editor.inspector")} onKeyDown={(event) => { if (event.key === "Escape") closeInspector(); }}>
            <div className="inspector-navigation">
              <div className="mobile-inspector-heading"><strong>{text("editor.inspector")}</strong><button ref={inspectorClose} type="button" className="icon-button" aria-label={text("editor.closeInspector")} onClick={closeInspector}><X size={18} aria-hidden="true" /></button></div>
              <div className="inspector-tabs" role="tablist" aria-label={text("editor.inspector")}>{tabs.map((entry, index) => <button key={entry} id={`tab-${entry}`} type="button" role="tab" aria-selected={tab === entry} aria-controls={`panel-${entry}`} tabIndex={tab === entry ? 0 : -1} onClick={() => setTab(entry)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null; if (next !== null) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus(); } }}>{tabLabels[entry]}</button>)}</div>
            </div>
            {state.lockNotice.length > 0 && <section className="lock-notice" role="status" data-testid="lock-notice"><h3>{text(state.lockNoticeContext === "edit" ? "locks.bounce" : "locks.notApplied")}</h3><ul>{state.lockNotice.map((issue) => <li key={issue.lockId}>{lockMessage(issue, state.current.furniture, state.language)}</li>)}</ul></section>}
            <div id="panel-furniture" role="tabpanel" aria-labelledby="tab-furniture" tabIndex={0} hidden={tab !== "furniture"}>
              <SuggestionsPanel flat={flat} roomId={focus.id ?? "all"} furniture={state.current.furniture} editable={editable} report={state.suggestionReport} language={state.language} onSuggest={(roomId) => dispatch({ type: "suggest", roomId })} />
              <p className="placement-room">{editorText(state.language, "editor.placementRoom", { room: flat.rooms.find((room) => room.id === (focus.id ?? state.selectedRoomId))?.name[state.language] ?? "" })}</p>
              <LibraryPanel {...libraryProps} mode="add" />
              <ItemList furniture={snapshot.furniture} selectedId={state.selectedId} positionLocks={state.locks.position} language={state.language} changes={changes} removed={removed} onSelect={selectAndReveal} />
            </div>
            <div id="panel-selected" role="tabpanel" aria-labelledby="tab-selected" tabIndex={0} hidden={tab !== "selected"}>
            <FurniturePanel item={selected} draft={state.draft} issues={state.inputIssues} editable={editable} positionLocked={Boolean(selected && state.locks.position.includes(selected.id))} language={state.language} onField={(field, value) => dispatch({ type: "draft", field, value })} onRotate={(angle) => { if (selected) dispatch({ type: "propose", item: { ...selected, orientation: angle } }); }} onBlur={() => dispatch({ type: "normalise-draft" })} onGestureStart={() => dispatch({ type: "gesture-start" })} onGestureEnd={() => dispatch({ type: "gesture-end" })} />
              {selected && <><label className="position-lock-toggle"><input type="checkbox" checked={state.locks.position.includes(selected.id)} disabled={!editable} onChange={() => dispatch({ type: "position-lock", id: selected.id })} /><LockKeyhole size={16} aria-hidden="true" />{text("locks.position")}</label><LibraryPanel {...libraryProps} mode="replace" /></>}
              <details className="look-disclosure" hidden={!selected}><summary>{text("look.title")}<ChevronDown size={16} aria-hidden="true" /></summary><LookPanel item={selected} look={selected ? shownLooks.get(selected.id) : undefined} editable={editable} language={state.language} onSet={(itemId, look) => looks.update({ type: "set", itemId, look })} onTurn={(itemId) => looks.update({ type: "turn", itemId })} onRemove={(itemId) => looks.update({ type: "remove", itemId })} /></details>
            </div>
            <div id="panel-constraints" role="tabpanel" aria-labelledby="tab-constraints" tabIndex={0} hidden={tab !== "constraints"}>
              {lockRemoved && <div className="undo-notice" role="status"><p>{text("locks.removed")}</p><button type="button" className="secondary-button" disabled={!editable} onClick={() => dispatch({ type: "undo" })}><Undo2 size={17} aria-hidden="true" />{text("editor.undo")}</button></div>}
              <LocksPanel key={state.cameraRevision} furniture={state.current.furniture} locks={state.locks} selectedId={state.selectedId} editable={editable} language={state.language} setupIssue={state.lockSetupIssue} onSave={(input) => dispatch({ type: "distance-lock", ...input })} onRemove={(id) => { setRemovedLockFrom(state.locks); dispatch({ type: "remove-distance-lock", id }); }} />
            </div>
          </aside>
        </div>
      </main>
      <footer className="app-footer"><p>{translate(state.language, "footer.privacy")}</p><p>{translate(state.language, "footer.project")}</p></footer>
    </div>
  );
}