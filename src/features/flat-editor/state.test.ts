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

describe("multiple lock management and bounce-back", () => {
  const gapAction = { type: "distance-lock", firstId: "living-sofa", secondId: "living-coffee-table", minimum: "25" } as const;

  it("creates, edits and removes a satisfiable distance lock", () => {
    const created = editorReducer(createEditorState(), gapAction);
    expect(created.locks.distance).toHaveLength(1);
    const edited = editorReducer(created, { ...gapAction, id: "distance-1", minimum: "30" });
    expect(edited.locks.distance[0].minimum).toBe(30);
    expect(editorReducer(edited, { type: "remove-distance-lock", id: "distance-1" }).locks.distance).toEqual([]);
  });

  it("does not apply an impossible lock or move items to satisfy it", () => {
    const initial = createEditorState();
    const state = editorReducer(initial, { ...gapAction, minimum: "100" });
    expect(state.locks.distance).toEqual([]);
    expect(state.current).toBe(initial.current);
    expect(state.lockNotice).toContainEqual(expect.objectContaining({ code: "lock.distance", required: 100, actual: 32.5 }));
    expect(state.lockNoticeContext).toBe("setup");
  });

  it("keeps the old lock when an edited minimum is impossible", () => {
    const created = editorReducer(createEditorState(), gapAction);
    expect(editorReducer(created, { ...gapAction, id: "distance-1", minimum: "100" }).locks.distance[0].minimum).toBe(25);
  });

  it.each(["", "-1", "Infinity", "10cm"])("rejects bad minimum input %j", (minimum) => {
    const state = editorReducer(createEditorState(), { ...gapAction, minimum });
    expect(state.locks.distance).toEqual([]);
    expect(state.lockSetupIssue).toBe("minimum-input");
  });

  it("rejects same/missing item endpoints", () => {
    expect(editorReducer(createEditorState(), { ...gapAction, secondId: "living-sofa" }).lockSetupIssue).toBe("same-items");
    expect(editorReducer(createEditorState(), { ...gapAction, secondId: "missing" }).lockSetupIssue).toBe("missing-items");
  });

  it("maintains multiple position locks and still permits rotation", () => {
    const first = editorReducer(createEditorState(), { type: "position-lock", id: "living-sofa" });
    const state = editorReducer(first, { type: "position-lock", id: "living-coffee-table" });
    expect(state.locks.position).toHaveLength(2);
    expect(editorReducer(state, { type: "draft", field: "angle", value: "30" }).current.furniture[0].orientation).toBe(30);
  });

  it("returns the last accepted drag position after a locked threshold is crossed", () => {
    const initial = editorReducer(createEditorState(), gapAction);
    const original = initial.current.furniture[0];
    const valid = editorReducer(initial, { type: "propose", item: { ...original, position: { x: 250, z: 268 } } });
    const rejected = editorReducer(valid, { type: "propose", item: { ...original, position: { x: 250, z: 250 } } });
    expect(rejected.current.furniture[0].position).toEqual({ x: 250, z: 268 });
    expect(rejected.lockNotice).toContainEqual(expect.objectContaining({ required: 25, actual: 12.5 }));
    expect(rejected.draft?.z).toBe("268");
  });

  it("supports several user-defined distance locks on the same item", () => {
    const first = editorReducer(createEditorState(), gapAction);
    const state = editorReducer(first, { type: "distance-lock", firstId: "living-sofa", secondId: "living-side-table", minimum: "5" });
    expect(state.locks.distance).toHaveLength(2);
    const item = state.current.furniture[0];
    const result = editorReducer(state, { type: "propose", item: { ...item, position: { x: 280, z: 250 } } });
    expect(result.lockNotice).toHaveLength(2);
    expect(result.current).toBe(state.current);
  });
});