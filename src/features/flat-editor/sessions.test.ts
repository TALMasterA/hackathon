import { describe, expect, it } from "vitest";
import { createEditorState, createScenarioSessions, editorReducer, sessionReducer, type EditorAction, type EditorState } from "./state";
import { FLAT_SCENARIOS } from "../../data/flat-scenarios";
import { analyzeLayout } from "../../lib/geometry/layout";

describe("selectable editor sessions", () => {
  it("starts on Harmony but preserves default demo fixtures", () => {
    expect(createScenarioSessions().activeId).toBe("harmony");
    expect(createEditorState().selectedRoomId).toBe("living");
    expect(createEditorState("harmony").selectedRoomId).toBe("central");
  });

  it("retains complete independent documents, drafts and histories through switching", () => {
    let state = createScenarioSessions();
    state = sessionReducer(state, { type: "edit", action: { type: "add-item", templateId: "sofa" } });
    state = sessionReducer(state, { type: "edit", action: { type: "position-lock", id: "item-1" } });
    state = sessionReducer(state, { type: "edit", action: { type: "baseline" } });
    state = sessionReducer(state, { type: "edit", action: { type: "draft", field: "width", value: "" } });
    const harmony = state.sessions.harmony;
    state = sessionReducer(state, { type: "switch", id: "demo" });
    expect(state.sessions.demo.current.furniture).toEqual([]);
    state = sessionReducer(state, { type: "edit", action: { type: "add-item", templateId: "chair" } });
    expect(state.sessions.demo.current.furniture[0].id).toBe("item-1");
    expect(state.sessions.demo.locks.position).toEqual([]);
    const demo = state.sessions.demo;
    state = sessionReducer(state, { type: "switch", id: "harmony" });
    expect(state.sessions.harmony).toBe(harmony);
    expect(state.sessions.demo).toBe(demo);
    state = sessionReducer(state, { type: "edit", action: { type: "reset" } });
    expect(state.sessions.harmony.selectedRoomId).toBe("central");
    expect(state.sessions.demo).toBe(demo);
    state = sessionReducer(state, { type: "edit", action: { type: "undo" } });
    expect(state.sessions.harmony.current).toEqual(harmony.current);
    expect(state.sessions.harmony.baseline).toEqual(harmony.baseline);
    expect(state.sessions.harmony.locks).toEqual(harmony.locks);
  });

  it("uses global language without adding a document-history entry", () => {
    const state = sessionReducer(createScenarioSessions(), { type: "edit", action: { type: "language", language: "zh-Hant" } });
    for (const session of Object.values(state.sessions)) {
      expect(session.language).toBe("zh-Hant");
      expect(session.past).toHaveLength(0);
    }
  });

  it("keeps enforcing the remaining Harmony spacing lock after deleting another", () => {
    let state = editorReducer(createEditorState("harmony"), { type: "suggest", roomId: "all" });
    const [sofa, coffee, tv] = state.current.furniture;
    state = editorReducer(state, { type: "distance-lock", firstId: sofa.id, secondId: coffee.id, minimum: "5" });
    state = editorReducer(state, { type: "distance-lock", firstId: sofa.id, secondId: tv.id, minimum: "25" });
    expect(state.locks.distance).toHaveLength(2);
    const remainingId = state.locks.distance[1].id;
    state = editorReducer(state, { type: "remove-distance-lock", id: state.locks.distance[0].id });
    state = editorReducer(state, { type: "propose", item: { ...sofa, position: { x: sofa.position.x, z: 210 } } });
    expect(state.current.furniture[0]).toEqual(sofa);
    expect(state.lockNotice).toContainEqual(expect.objectContaining({ code: "lock.distance", lockId: remainingId }));
  });

  it.each(["demo", "harmony"] as const)("retains full editing and constraint behavior in %s", (scenarioId) => {
    let state: EditorState = createEditorState(scenarioId);
    const edit = (action: EditorAction) => { state = editorReducer(state, action); };
    edit({ type: "suggest", roomId: "all" });
    expect(state.current.furniture).toHaveLength(FLAT_SCENARIOS[scenarioId].examples.length);
    expect(analyzeLayout(FLAT_SCENARIOS[scenarioId].flat, state.current.furniture, 260)).toEqual([]);
    const [first, second, third] = state.current.furniture;
    edit({ type: "select", id: first.id });
    edit({ type: "draft", field: "angle", value: "33" });
    expect(state.current.furniture[0].orientation).toBe(33);
    edit({ type: "position-lock", id: first.id });
    edit({ type: "propose", item: { ...state.current.furniture[0], position: { x: first.position.x + 40, z: first.position.z } } });
    expect(state.current.furniture[0].position).toEqual(first.position);
    expect(state.lockNotice[0].code).toBe("lock.position");
    edit({ type: "distance-lock", firstId: first.id, secondId: second.id, minimum: "0" });
    edit({ type: "distance-lock", firstId: first.id, secondId: third.id, minimum: "0" });
    const otherLock = state.locks.distance[1];
    edit({ type: "remove-distance-lock", id: state.locks.distance[0].id });
    expect(state.locks.distance).toEqual([otherLock]);
    edit({ type: "undo" });
    expect(state.locks.distance).toHaveLength(2);
    edit({ type: "baseline" });
    const beforeReplace = state.current.furniture[0];
    edit({ type: "replace-item", templateId: "chair" });
    expect(state.current.furniture[0].kind).toBe("chair");
    expect(state.current.furniture[0].position).toEqual(beforeReplace.position);
    edit({ type: "delete-item", id: first.id });
    expect(state.locks.distance).toEqual([]);
    expect(state.locks.position).toEqual([]);
    edit({ type: "undo" });
    expect(state.locks.distance).toHaveLength(2);
    edit({ type: "view", view: "before" });
    const document = state.current;
    edit({ type: "add-item", templateId: "chair" });
    expect(state.current).toBe(document);
    edit({ type: "view", view: "after" });
    edit({ type: "reset" });
    expect(state.current.furniture).toEqual([]);
    edit({ type: "undo" });
    expect(state.current).toEqual(document);
    edit({ type: "redo" });
    expect(state.current.furniture).toEqual([]);
  });
});