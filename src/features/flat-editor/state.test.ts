import { describe, expect, it } from "vitest";
import { analyzeLayout } from "../../lib/geometry/layout";
import { DEMO_FLAT } from "../../data/flat-preset";
import { clientToPlan, draggedPosition, nearestPlanItem } from "../../components/plan/interaction";
import { rotationFromPoint } from "../../lib/geometry/oriented";
import { copySnapshot, createEditorState, editorReducer } from "./state";

describe("immediate editor state", () => {
  it("starts in After with independently copied baseline positions", () => {
    const state = createEditorState();
    expect(state.view).toBe("after");
    expect(state.locks).toEqual({ position: [], distance: [] });
    expect(state.baseline.furniture).not.toBe(state.current.furniture);
    expect(state.baseline.furniture[0].position).not.toBe(state.current.furniture[0].position);
  });

  it("immediately commits valid numeric edits without Check", () => {
    const state = editorReducer(createEditorState(), { type: "draft", field: "width", value: "250.5" });
    expect(state.current.furniture[0].width).toBe(250.5);
    expect(state.baseline.furniture[0].width).toBe(180);
    expect(state.view).toBe("after");
  });

  it("preserves incomplete drafts and the last geometric state", () => {
    const state = editorReducer(createEditorState(), { type: "draft", field: "depth", value: "" });
    expect(state.draft?.depth).toBe("");
    expect(state.current.furniture[0].depth).toBe(80);
    expect(state.inputIssues).toContainEqual({ code: "input.missing", field: "depth" });
  });

  it("allows overlap and returns live warnings instead of rejecting it", () => {
    const state = createEditorState();
    const updated = editorReducer(state, { type: "propose", item: { ...state.current.furniture[0], position: { ...state.current.furniture[1].position } } });
    expect(updated.current.furniture[0].position).toEqual(state.current.furniture[1].position);
    expect(analyzeLayout(DEMO_FLAT, updated.current.furniture, 260).some((issue) => issue.code === "furniture")).toBe(true);
  });

  it("snap-backs numeric edits and refreshes the draft on lock failure", () => {
    const state = createEditorState();
    const locked = { ...state, locks: { position: [state.selectedId!], distance: [] } };
    const result = editorReducer(locked, { type: "draft", field: "x", value: "300" });
    expect(result.current).toBe(state.current);
    expect(result.draft?.x).toBe("250");
    expect(result.lockNotice[0].code).toBe("lock.position");
  });

  it("Before is instantly available and read-only without a valid-result gate", () => {
    const state = editorReducer(createEditorState(), { type: "view", view: "before" });
    expect(editorReducer(state, { type: "draft", field: "width", value: "500" })).toBe(state);
    expect(state.draft?.width).toBe("180");
  });

  it("applies ceiling changes to the layout without clamping invalid input", () => {
    const valid = editorReducer(createEditorState(), { type: "ceiling", value: "220" });
    expect(valid.current.ceilingHeight).toBe(220);
    const invalid = editorReducer(valid, { type: "ceiling", value: "219" });
    expect(invalid.current.ceilingHeight).toBe(220);
    expect(invalid.ceilingIssue?.field).toBe("ceilingHeight");
  });

  it("Reset Demo restores both snapshots and retains language", () => {
    const state = editorReducer(editorReducer(createEditorState(), { type: "language", language: "zh-Hant" }), { type: "draft", field: "angle", value: "135" });
    const reset = editorReducer(state, { type: "reset" });
    expect(reset.current.furniture[0].orientation).toBe(0);
    expect(reset.baseline).toEqual(reset.current);
    expect(reset.language).toBe("zh-Hant");
  });

  it("copies snapshots without sharing mutable position/name objects", () => {
    const original = createEditorState().current;
    const copy = copySnapshot(original);
    copy.furniture[0].position.x = 999;
    copy.furniture[0].name.en = "Changed";
    expect(original.furniture[0].position.x).toBe(250);
    expect(original.furniture[0].name.en).toBe("Sofa");
  });
});

describe("pointer and dial math", () => {
  it("maps pointer coordinates correctly with SVG letterboxing", () => {
    expect(clientToPlan({ x: 250, z: 150 }, { left: 50, top: 50, width: 400, height: 200 }, { minX: 0, minZ: 0, width: 100, height: 100 })).toEqual({ x: 50, z: 50 });
  });

  it("preserves drag grab offsets for mouse and touch", () => {
    expect(draggedPosition({ x: 250, z: 270 }, { x: 240, z: 260 }, { x: 260, z: 275 })).toEqual({ x: 270, z: 285 });
  });

  it("offers a nearby small item a finger-friendly hit radius", () => {
    const state = createEditorState();
    expect(nearestPlanItem(state.current.furniture, { x: 400, z: 270 }, 22)?.id).toBe("living-side-table");
  });

  it.each([[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270]])("maps dial direction %s/%s to %s degrees", (x, z, angle) => {
    expect(rotationFromPoint({ x, z }, { x: 0, z: 0 })).toBe(angle);
  });
});