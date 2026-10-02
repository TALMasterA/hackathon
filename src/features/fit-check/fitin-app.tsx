"use client";

import { useEffect, useReducer } from "react";
import { AppHeader } from "@/components/app-header";
import { RoomViewport } from "@/components/scene/room-viewport";
import { SourcePanel } from "@/components/source-panel";
import { StepIndicator } from "@/components/step-indicator";
import { DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES } from "@/data/preset";
import { translate } from "@/i18n/dictionary";
import { checkReplacement } from "@/lib/geometry/check-placement";
import { validatedRoomHeight } from "@/lib/geometry/input";
import { fieldId, ReplacementForm } from "./replacement-form";
import { ResultPanel } from "./result-panel";
import { INITIAL_STATE, fitInReducer } from "./state";

export function FitInApp() {
  const [state, dispatch] = useReducer(fitInReducer, INITIAL_STATE);
  const currentResult = checkReplacement(state.input, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES, state.selectedId);
  const issues = currentResult.status === "incomplete" && state.hasChecked ? currentResult.issues : [];
  const roomHeight = validatedRoomHeight(state.input.roomHeight, DEMO_ROOM) ?? DEMO_ROOM.height;
  const text = (key: Parameters<typeof translate>[1]) => translate(state.language, key);

  useEffect(() => {
    document.documentElement.lang = state.language;
    document.title = `FitIn | ${translate(state.language, "app.title")}`;
  }, [state.language]);

  function handleCheck() {
    dispatch({ type: "check", result: currentResult });
    if (currentResult.status === "incomplete") document.getElementById(fieldId(currentResult.issues[0].field))?.focus();
  }

  return (
    <div className="app-shell" lang={state.language}>
      <a className="skip-link" href="#replacement-form">{text("app.skip")}</a>
      <AppHeader language={state.language} onLanguage={(language) => dispatch({ type: "language", language })} onReset={() => dispatch({ type: "reset" })} />
      <main id="main">
        <div className="overview"><div><p className="eyebrow">{text("app.category")}</p><h1>{text("app.title")}</h1></div><span className="demo-tag"><span />{text("app.demo")}</span></div>
        <StepIndicator language={state.language} current={state.result ? 4 : 3} />
        <div className="workspace-grid">
          <section className="room-column" aria-labelledby="room-title">
            <div className="room-heading"><h2 id="room-title">{text("room.title")}</h2><span>{DEMO_ROOM.width} × {DEMO_ROOM.depth} × {roomHeight} {text("form.unit")}</span></div>
            <RoomViewport key={state.demoRevision} room={{ ...DEMO_ROOM, height: roomHeight }} furniture={EXISTING_FURNITURE} zones={RESERVED_ZONES} candidate={state.result?.status === "valid" ? state.result.candidate : null} view={state.view} selectedId={state.selectedId} language={state.language} onSelect={(id) => dispatch({ type: "select", id })} onView={(view) => dispatch({ type: "view", view })} />
            <p className="scene-caption">{text("scene.caption")}</p>
            <SourcePanel language={state.language} />
          </section>
          <aside className="form-column" aria-label={text("form.new")}>
            <ReplacementForm language={state.language} input={state.input} selectedId={state.selectedId} issues={issues} onField={(field, value) => dispatch({ type: "field", field, value })} onOrientation={(orientation) => dispatch({ type: "orientation", orientation })} onSelect={(id) => dispatch({ type: "select", id })} onCheck={handleCheck} />
            <ResultPanel language={state.language} result={state.result} dirty={state.dirty} />
          </aside>
        </div>
      </main>
      <footer className="app-footer"><p>{text("footer.privacy")}</p><p>{text("footer.project")}</p></footer>
    </div>
  );
}