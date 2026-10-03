import { describe, expect, it } from "vitest";
import { analyzeLayout } from "../../lib/geometry/layout";
import { DEMO_FLAT } from "../../data/flat-preset";
import { clientToPlan, draggedPosition, nearestPlanItem } from "../../components/plan/interaction";
import { rotationFromPoint } from "../../lib/geometry/oriented";
import { copySnapshot, createEditorState, editorReducer, HISTORY_LIMIT, type EditorAction, type EditorState } from "./state";
import { itemChanges, placeLibraryItem } from "./layout";
import { FURNITURE_LIBRARY, SUGGESTED_FURNITURE } from "../../data/flat-preset";

/** The former furnished start: every suggestion added, used as baseline, with the sofa selected. */
function furnishedState(): EditorState {
  const actions: EditorAction[] = [{ type: "suggest", roomId: "all" }, { type: "baseline" }, { type: "select", id: "living-sofa" }];
  return actions.reduce(editorReducer, createEditorState());
}

describe("immediate editor state", () => {
  it("starts in After with independently copied baseline positions", () => {
    const state = furnishedState();
    expect(state.view).toBe("after");
    expect(state.locks).toEqual({ position: [], distance: [] });
    expect(state.baseline.furniture).not.toBe(state.current.furniture);
    expect(state.baseline.furniture[0].position).not.toBe(state.current.furniture[0].position);
  });

  it("immediately commits valid numeric edits without Check", () => {
    const state = editorReducer(furnishedState(), { type: "draft", field: "width", value: "250.5" });
    expect(state.current.furniture[0].width).toBe(250.5);
    expect(state.baseline.furniture[0].width).toBe(180);
    expect(state.view).toBe("after");
  });

  it("preserves incomplete drafts and the last geometric state", () => {
    const state = editorReducer(furnishedState(), { type: "draft", field: "depth", value: "" });
    expect(state.draft?.depth).toBe("");
    expect(state.current.furniture[0].depth).toBe(80);
    expect(state.inputIssues).toContainEqual({ code: "input.missing", field: "depth" });
  });

  it("allows overlap and returns live warnings instead of rejecting it", () => {
    const state = furnishedState();
    const updated = editorReducer(state, { type: "propose", item: { ...state.current.furniture[0], position: { ...state.current.furniture[1].position } } });
    expect(updated.current.furniture[0].position).toEqual(state.current.furniture[1].position);
    expect(analyzeLayout(DEMO_FLAT, updated.current.furniture, 260).some((issue) => issue.code === "furniture")).toBe(true);
  });

  it("snap-backs numeric edits and refreshes the draft on lock failure", () => {
    const state = furnishedState();
    const locked = { ...state, locks: { position: [state.selectedId!], distance: [] } };
    const result = editorReducer(locked, { type: "draft", field: "x", value: "300" });
    expect(result.current).toBe(state.current);
    expect(result.draft?.x).toBe("250");
    expect(result.lockNotice[0].code).toBe("lock.position");
  });

  it("Before is instantly available and read-only without a valid-result gate", () => {
    const state = editorReducer(furnishedState(), { type: "view", view: "before" });
    expect(editorReducer(state, { type: "draft", field: "width", value: "500" })).toBe(state);
    expect(state.draft?.width).toBe("180");
  });

  it("applies ceiling changes to the layout without clamping invalid input", () => {
    const valid = editorReducer(furnishedState(), { type: "ceiling", value: "220" });
    expect(valid.current.ceilingHeight).toBe(220);
    const invalid = editorReducer(valid, { type: "ceiling", value: "219" });
    expect(invalid.current.ceilingHeight).toBe(220);
    expect(invalid.ceilingIssue?.field).toBe("ceilingHeight");
  });

  it("Reset Demo restores both empty snapshots and retains language", () => {
    const state = editorReducer(editorReducer(furnishedState(), { type: "language", language: "zh-Hant" }), { type: "draft", field: "angle", value: "135" });
    const reset = editorReducer(state, { type: "reset" });
    expect(reset.current.furniture).toEqual([]);
    expect(reset.baseline).toEqual(reset.current);
    expect(reset.selectedId).toBeNull();
    expect(reset.language).toBe("zh-Hant");
    expect(reset.cameraRevision).toBe(state.cameraRevision + 1);
  });

  it("copies snapshots without sharing mutable position/name objects", () => {
    const original = furnishedState().current;
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

  it("maps pointer coordinates through a zoomed and panned view", () => {
    const screen = { left: 20, top: 10, width: 700, height: 680 };
    const zoomed = { minX: 430, minZ: 150, width: 175, height: 170 };
    expect(clientToPlan({ x: 20, z: 10 }, screen, zoomed)).toEqual({ x: 430, z: 150 });
    expect(clientToPlan({ x: 370, z: 350 }, screen, zoomed)).toEqual({ x: 517.5, z: 235 });
  });

  it("preserves drag grab offsets for mouse and touch", () => {
    expect(draggedPosition({ x: 250, z: 270 }, { x: 240, z: 260 }, { x: 260, z: 275 })).toEqual({ x: 270, z: 285 });
  });

  it("offers a nearby small item a finger-friendly hit radius", () => {
    const state = furnishedState();
    expect(nearestPlanItem(state.current.furniture, { x: 400, z: 270 }, 22)?.id).toBe("living-side-table");
  });

  it.each([[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270]])("maps dial direction %s/%s to %s degrees", (x, z, angle) => {
    expect(rotationFromPoint({ x, z }, { x: 0, z: 0 })).toBe(angle);
  });
});

describe("multiple lock management and bounce-back", () => {
  const gapAction = { type: "distance-lock", firstId: "living-sofa", secondId: "living-coffee-table", minimum: "25" } as const;

  it("deletes only one lock without moving furniture, releases it and supports undo/redo", () => {
    const first = editorReducer(furnishedState(), gapAction);
    const locked = editorReducer(first, { type: "distance-lock", firstId: "living-sofa", secondId: "living-side-table", minimum: "0" });
    const deleted = editorReducer(locked, { type: "remove-distance-lock", id: "distance-1" });
    expect(deleted.current).toBe(locked.current);
    expect(deleted.locks.distance).toEqual([locked.locks.distance[1]]);
    const proposal = { type: "propose", item: { ...locked.current.furniture[0], position: { x: 250, z: 250 } } } as const;
    expect(editorReducer(locked, proposal).current).toBe(locked.current);
    expect(editorReducer(deleted, proposal).current.furniture[0].position.z).toBe(250);
    const undone = editorReducer(deleted, { type: "undo" });
    expect(undone.locks).toEqual(locked.locks);
    expect(undone.current).toEqual(locked.current);
    expect(editorReducer(undone, { type: "redo" }).locks).toEqual(deleted.locks);
  });

  it("cleans only furniture-related locks and restores the complete document on undo", () => {
    const first = editorReducer(furnishedState(), gapAction);
    const second = editorReducer(first, { type: "distance-lock", firstId: "living-coffee-table", secondId: "living-side-table", minimum: "0" });
    const locked = editorReducer(second, { type: "position-lock", id: "living-sofa" });
    const deleted = editorReducer(locked, { type: "delete-item", id: "living-sofa" });
    expect(deleted.locks.position).toEqual([]);
    expect(deleted.locks.distance).toEqual([locked.locks.distance[1]]);
    expect(deleted.locks.distance.every((lock) => deleted.current.furniture.some((item) => item.id === lock.firstId) && deleted.current.furniture.some((item) => item.id === lock.secondId))).toBe(true);
    const undone = editorReducer(deleted, { type: "undo" });
    expect(undone.current).toEqual(locked.current);
    expect(undone.locks).toEqual(locked.locks);
    expect(editorReducer(undone, { type: "redo" }).current).toEqual(deleted.current);
  });

  it("creates, edits and removes a satisfiable distance lock", () => {
    const created = editorReducer(furnishedState(), gapAction);
    expect(created.locks.distance).toHaveLength(1);
    const edited = editorReducer(created, { ...gapAction, id: "distance-1", minimum: "30" });
    expect(edited.locks.distance[0].minimum).toBe(30);
    expect(editorReducer(edited, { type: "remove-distance-lock", id: "distance-1" }).locks.distance).toEqual([]);
  });

  it("does not apply an impossible lock or move items to satisfy it", () => {
    const initial = furnishedState();
    const state = editorReducer(initial, { ...gapAction, minimum: "100" });
    expect(state.locks.distance).toEqual([]);
    expect(state.current).toBe(initial.current);
    expect(state.lockNotice).toContainEqual(expect.objectContaining({ code: "lock.distance", required: 100, actual: 32.5 }));
    expect(state.lockNoticeContext).toBe("setup");
  });

  it("keeps the old lock when an edited minimum is impossible", () => {
    const created = editorReducer(furnishedState(), gapAction);
    expect(editorReducer(created, { ...gapAction, id: "distance-1", minimum: "100" }).locks.distance[0].minimum).toBe(25);
  });

  it.each(["", "-1", "Infinity", "10cm"])("rejects bad minimum input %j", (minimum) => {
    const state = editorReducer(furnishedState(), { ...gapAction, minimum });
    expect(state.locks.distance).toEqual([]);
    expect(state.lockSetupIssue).toBe("minimum-input");
  });

  it("rejects same/missing item endpoints", () => {
    expect(editorReducer(furnishedState(), { ...gapAction, secondId: "living-sofa" }).lockSetupIssue).toBe("same-items");
    expect(editorReducer(furnishedState(), { ...gapAction, secondId: "missing" }).lockSetupIssue).toBe("missing-items");
  });

  it("maintains multiple position locks and still permits rotation", () => {
    const first = editorReducer(furnishedState(), { type: "position-lock", id: "living-sofa" });
    const state = editorReducer(first, { type: "position-lock", id: "living-coffee-table" });
    expect(state.locks.position).toHaveLength(2);
    expect(editorReducer(state, { type: "draft", field: "angle", value: "30" }).current.furniture[0].orientation).toBe(30);
  });

  it("returns the last accepted drag position after a locked threshold is crossed", () => {
    const initial = editorReducer(furnishedState(), gapAction);
    const original = initial.current.furniture[0];
    const valid = editorReducer(initial, { type: "propose", item: { ...original, position: { x: 250, z: 268 } } });
    const rejected = editorReducer(valid, { type: "propose", item: { ...original, position: { x: 250, z: 250 } } });
    expect(rejected.current.furniture[0].position).toEqual({ x: 250, z: 268 });
    expect(rejected.lockNotice).toContainEqual(expect.objectContaining({ required: 25, actual: 12.5 }));
    expect(rejected.draft?.z).toBe("268");
  });

  it("supports several user-defined distance locks on the same item", () => {
    const first = editorReducer(furnishedState(), gapAction);
    const state = editorReducer(first, { type: "distance-lock", firstId: "living-sofa", secondId: "living-side-table", minimum: "5" });
    expect(state.locks.distance).toHaveLength(2);
    const item = state.current.furniture[0];
    const result = editorReducer(state, { type: "propose", item: { ...item, position: { x: 280, z: 250 } } });
    expect(result.lockNotice).toHaveLength(2);
    expect(result.current).toBe(state.current);
  });
});

describe("library and immediate baseline comparison", () => {
  it("adds a default-zero item to a free position in the selected room", () => {
    const initial = editorReducer(furnishedState(), { type: "room", id: "kitchen" });
    const state = editorReducer(initial, { type: "add-item", templateId: "chair" });
    expect(state.current.furniture).toHaveLength(21);
    const added = state.current.furniture.find((item) => item.id === state.selectedId)!;
    expect(added.roomId).toBe("kitchen");
    expect(added.orientation).toBe(0);
    expect(analyzeLayout(DEMO_FLAT, state.current.furniture, 260)).toEqual([]);
    expect(initial.current.furniture).toHaveLength(20);
    expect(state.baseline.furniture).toHaveLength(20);
  });

  it("reports no free initial position without rearranging existing furniture", () => {
    const room = DEMO_FLAT.rooms[0];
    const occupied = [{ ...furnishedState().current.furniture[0], ...room, id: "occupied", kind: "sofa" as const, roomId: "living", height: 80 }];
    expect(placeLibraryItem(DEMO_FLAT, occupied, FURNITURE_LIBRARY[5], "living", "new")).toBeNull();
    expect(occupied[0].position).toEqual(room.position);
  });

  it("keeps position and angle when replacing from the library", () => {
    const rotated = editorReducer(furnishedState(), { type: "draft", field: "angle", value: "135" });
    const state = editorReducer(rotated, { type: "replace-item", templateId: "desk" });
    expect(state.current.furniture[0]).toMatchObject({ id: "living-sofa", kind: "desk", width: 110, position: { x: 250, z: 270 }, orientation: 135 });
  });

  it("routes preset replacement through distance-lock rejection", () => {
    const state = editorReducer(furnishedState(), { type: "distance-lock", firstId: "living-sofa", secondId: "living-coffee-table", minimum: "25" });
    const result = editorReducer(state, { type: "replace-item", templateId: "double-bed" });
    expect(result.current).toBe(state.current);
    expect(result.lockNotice[0].code).toBe("lock.distance");
  });

  it("deletes an item and cleans position/distance locks while keeping its baseline", () => {
    const state = editorReducer(editorReducer(furnishedState(), { type: "position-lock", id: "living-sofa" }), { type: "distance-lock", firstId: "living-sofa", secondId: "living-coffee-table", minimum: "25" });
    const result = editorReducer(state, { type: "delete-item", id: "living-sofa" });
    expect(result.current.furniture).toHaveLength(19);
    expect(result.locks).toEqual({ position: [], distance: [] });
    expect(result.baseline.furniture[0].id).toBe("living-sofa");
    expect(itemChanges(result.baseline, result.current)["living-sofa"]).toEqual(["removed"]);
  });

  it("detects moved, rotated, resized, replaced, added and removed items", () => {
    const state = furnishedState();
    const current = copySnapshot(state.current);
    current.furniture[0] = { ...current.furniture[0], kind: "desk", name: { en: "Desk", "zh-Hant": "書枱" }, position: { x: 260, z: 270 }, orientation: 30, width: 100 };
    current.furniture.pop();
    current.furniture.push({ ...current.furniture[0], id: "new" });
    const changes = itemChanges(state.baseline, current);
    expect(changes["living-sofa"]).toEqual(["moved", "rotated", "resized", "replaced"]);
    expect(changes["new"]).toEqual(["added"]);
    expect(changes["second-chair"]).toEqual(["removed"]);
  });

  it("sets a new independent baseline without moving the camera or clearing locks", () => {
    const state = editorReducer(editorReducer(furnishedState(), { type: "draft", field: "angle", value: "30" }), { type: "position-lock", id: "living-sofa" });
    const updated = editorReducer(state, { type: "baseline" });
    expect(updated.baseline).toEqual(updated.current);
    expect(updated.baseline.furniture).not.toBe(updated.current.furniture);
    expect(itemChanges(updated.baseline, updated.current)).toEqual({});
    expect(updated.cameraRevision).toBe(state.cameraRevision);
    expect(updated.locks).toBe(state.locks);
  });

  it("does not replace the baseline from an incomplete draft or Before view", () => {
    const incomplete = editorReducer(furnishedState(), { type: "draft", field: "width", value: "" });
    expect(editorReducer(incomplete, { type: "baseline" })).toBe(incomplete);
    const before = editorReducer(furnishedState(), { type: "view", view: "before" });
    expect(editorReducer(before, { type: "add-item", templateId: "chair" })).toBe(before);
    expect(editorReducer(before, { type: "delete-item", id: "living-sofa" })).toBe(before);
  });

  it("allows geometric warnings in a user-chosen baseline", () => {
    const state = editorReducer(furnishedState(), { type: "draft", field: "width", value: "500" });
    const baseline = editorReducer(state, { type: "baseline" });
    expect(baseline.baseline.furniture[0].width).toBe(500);
    expect(analyzeLayout(DEMO_FLAT, baseline.baseline.furniture, 260).length).toBeGreaterThan(0);
  });

  it("discards incomplete drafts when comparing, without changing accepted geometry", () => {
    const invalid = editorReducer(editorReducer(furnishedState(), { type: "ceiling", value: "219" }), { type: "draft", field: "width", value: "" });
    const before = editorReducer(invalid, { type: "view", view: "before" });
    const after = editorReducer(before, { type: "view", view: "after" });
    expect(after.ceilingInput).toBe("260");
    expect(after.ceilingIssue).toBeNull();
    expect(after.draft?.width).toBe("180");
    expect(after.current).toBe(invalid.current);
  });

  it("follows a selected item into its new room but not an unrelated room-picker change", () => {
    const state = furnishedState();
    const moved = editorReducer(state, { type: "propose", item: { ...state.current.furniture[0], position: { x: 540, z: 100 }, orientation: 360 } });
    expect(moved.selectedRoomId).toBe("kitchen");
    expect(moved.current.furniture[0].orientation).toBe(0);
    const roomPicked = editorReducer(state, { type: "room", id: "master" });
    expect(editorReducer(roomPicked, { type: "draft", field: "height", value: "90" }).selectedRoomId).toBe("master");
  });

  it("rejects extreme finite coordinates without clamping the accepted item", () => {
    const state = furnishedState();
    const invalid = editorReducer(state, { type: "draft", field: "x", value: "100000000000000000000000" });
    expect(invalid.current).toBe(state.current);
    expect(invalid.draft?.x).toBe("100000000000000000000000");
    expect(invalid.inputIssues[0]).toMatchObject({ field: "x", code: "input.range", maximum: 10000 });
  });
});
describe("undo and redo history", () => {
  const sofa = (state: EditorState) => state.current.furniture.find((item) => item.id === "living-sofa")!;
  const run = (state: EditorState, ...actions: Parameters<typeof editorReducer>[1][]) => actions.reduce(editorReducer, state);

  it("records a whole drag gesture as one undo step", () => {
    const initial = furnishedState();
    let state = editorReducer(initial, { type: "gesture-start" });
    for (let step = 1; step <= 50; step++) state = editorReducer(state, { type: "propose", item: { ...sofa(state), position: { x: 250 + step, z: 270 } } });
    state = editorReducer(state, { type: "gesture-end" });
    expect(sofa(state).position).toEqual({ x: 300, z: 270 });
    expect(state.past).toHaveLength(initial.past.length + 1);
    const undone = editorReducer(state, { type: "undo" });
    expect(sofa(undone).position).toEqual({ x: 250, z: 270 });
    expect(undone.draft?.x).toBe("250");
  });

  it("coalesces typing in one field and separates different fields", () => {
    const initial = furnishedState();
    const typed = run(initial, { type: "draft", field: "width", value: "1" }, { type: "draft", field: "width", value: "12" }, { type: "draft", field: "width", value: "120" });
    expect(sofa(typed).width).toBe(120);
    expect(typed.past).toHaveLength(initial.past.length + 1);
    expect(sofa(editorReducer(typed, { type: "undo" })).width).toBe(180);
    const twoFields = run(initial, { type: "draft", field: "width", value: "200" }, { type: "draft", field: "depth", value: "90" });
    expect(twoFields.past).toHaveLength(initial.past.length + 2);
    const once = editorReducer(twoFields, { type: "undo" });
    expect(sofa(once)).toMatchObject({ width: 200, depth: 80 });
    expect(sofa(editorReducer(once, { type: "undo" })).width).toBe(180);
  });

  it("starts a new step after blur and coalesces ceiling typing", () => {
    const initial = furnishedState();
    const state = run(initial, { type: "draft", field: "width", value: "200" }, { type: "normalise-draft" }, { type: "draft", field: "width", value: "210" }, { type: "ceiling", value: "250" }, { type: "ceiling", value: "2500" }, { type: "ceiling", value: "240" });
    expect(state.past).toHaveLength(initial.past.length + 3);
    expect(editorReducer(state, { type: "undo" }).current.ceilingHeight).toBe(260);
  });

  it("does not record lock-bounced, incomplete or no-op actions", () => {
    const locked = editorReducer(furnishedState(), { type: "position-lock", id: "living-sofa" });
    const bounced = editorReducer(locked, { type: "propose", item: { ...sofa(locked), position: { x: 300, z: 270 } } });
    expect(bounced.lockNotice).toHaveLength(1);
    expect(bounced.past).toBe(locked.past);
    expect(editorReducer(locked, { type: "draft", field: "width", value: "" }).past).toBe(locked.past);
    expect(editorReducer(locked, { type: "baseline" }).past).toBe(locked.past);
    expect(run(locked, { type: "gesture-start" }, { type: "gesture-end" }).past).toBe(locked.past);
  });

  it("undoes and redoes add and delete steps", () => {
    const initial = furnishedState();
    const added = run(initial, { type: "room", id: "kitchen" }, { type: "add-item", templateId: "chair" });
    const deleted = editorReducer(added, { type: "delete-item", id: "living-sofa" });
    const undone = run(deleted, { type: "undo" }, { type: "undo" });
    expect(undone.current).toEqual(initial.current);
    expect(undone.future).toHaveLength(2);
    const redone = run(undone, { type: "redo" }, { type: "redo" });
    expect(redone.current).toEqual(deleted.current);
    expect(redone.future).toEqual([]);
  });

  it("clears redo when a new action follows an undo", () => {
    const undone = run(furnishedState(), { type: "draft", field: "angle", value: "30" }, { type: "undo" });
    expect(undone.future).toHaveLength(1);
    expect(editorReducer(undone, { type: "position-lock", id: "living-sofa" }).future).toEqual([]);
  });

  it("makes Reset Demo undoable", () => {
    const edited = run(furnishedState(), { type: "draft", field: "width", value: "200" }, { type: "position-lock", id: "living-sofa" }, { type: "baseline" });
    const reset = editorReducer(edited, { type: "reset" });
    expect(reset.past).toHaveLength(edited.past.length + 1);
    const undone = editorReducer(reset, { type: "undo" });
    expect(undone.current).toEqual(edited.current);
    expect(undone.baseline).toEqual(edited.baseline);
    expect(undone.locks).toEqual(edited.locks);
    expect(undone.cameraRevision).toBe(reset.cameraRevision);
  });

  it("ignores undo and redo in Before view", () => {
    const before = run(furnishedState(), { type: "draft", field: "angle", value: "30" }, { type: "view", view: "before" });
    expect(editorReducer(before, { type: "undo" })).toBe(before);
    expect(editorReducer(before, { type: "redo" })).toBe(before);
  });

  it("clears the selection when undo removes the selected item", () => {
    const added = run(furnishedState(), { type: "room", id: "kitchen" }, { type: "add-item", templateId: "chair" });
    expect(added.selectedId).toBe("item-1");
    const undone = editorReducer(added, { type: "undo" });
    expect(undone.selectedId).toBeNull();
    expect(undone.draft).toBeNull();
    expect(undone.focusedIds).toEqual([]);
  });

  it(`caps history at ${HISTORY_LIMIT} steps`, () => {
    let state = furnishedState();
    for (let step = 1; step <= 120; step++) state = editorReducer(state, { type: "propose", item: { ...sofa(state), position: { x: 250 + step, z: 270 } } });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    expect(state.past[0].current.furniture.find((item) => item.id === "living-sofa")?.position.x).toBe(270);
  });
});

describe("empty start and suggested furniture", () => {
  const ids = (state: EditorState) => state.current.furniture.map((item) => item.id);
  const livingIds = SUGGESTED_FURNITURE.filter((item) => item.roomId === "living").map((item) => item.id);

  it("starts with architecture only, no issues and nothing selected", () => {
    const state = createEditorState();
    expect(state.current.furniture).toEqual([]);
    expect(state.baseline.furniture).toEqual([]);
    expect(analyzeLayout(DEMO_FLAT, state.current.furniture, state.current.ceilingHeight)).toEqual([]);
    expect(state).toMatchObject({ selectedId: null, focusedIds: [], draft: null, selectedRoomId: "living", suggestionReport: null });
    const before = editorReducer(state, { type: "view", view: "before" });
    expect(before.baseline.furniture).toEqual([]);
    expect(before.selectedId).toBeNull();
  });

  it("furnishes the whole flat warning-free as one undo step", () => {
    const state = editorReducer(createEditorState(), { type: "suggest", roomId: "all" });
    expect(ids(state)).toEqual(SUGGESTED_FURNITURE.map((item) => item.id));
    expect(analyzeLayout(DEMO_FLAT, state.current.furniture, 260)).toEqual([]);
    expect(state.past).toHaveLength(1);
    expect(state.suggestionReport).toMatchObject({ roomId: "all", skipped: [] });
    expect(itemChanges(state.baseline, state.current)["living-sofa"]).toEqual(["added"]);
    expect(editorReducer(state, { type: "undo" }).current.furniture).toEqual([]);
    expect(editorReducer(state, { type: "propose", item: { ...state.current.furniture[0], position: { x: 260, z: 270 } } }).suggestionReport).toBeNull();
  });

  it("reports an already furnished room without adding or recording anything", () => {
    const once = editorReducer(createEditorState(), { type: "suggest", roomId: "living" });
    expect(ids(once)).toEqual(livingIds);
    const twice = editorReducer(once, { type: "suggest", roomId: "living" });
    expect(twice.current).toBe(once.current);
    expect(twice.past).toBe(once.past);
    expect(twice.suggestionReport?.added).toEqual([]);
    expect(twice.suggestionReport?.skipped.map((entry) => [entry.id, entry.reason])).toEqual(livingIds.map((id) => [id, "present"]));
  });

  it("skips a suggestion blocked by existing furniture without moving that furniture", () => {
    const added = editorReducer(createEditorState(), { type: "add-item", templateId: "chair" });
    const moved = editorReducer(added, { type: "propose", item: { ...added.current.furniture[0], position: { x: 250, z: 270 } } });
    const state = editorReducer(moved, { type: "suggest", roomId: "living" });
    expect(state.suggestionReport?.skipped).toEqual([{ id: "living-sofa", name: { en: "Sofa", "zh-Hant": "梳化" }, reason: "furniture" }]);
    expect(ids(state)).toEqual(["item-1", ...livingIds.filter((id) => id !== "living-sofa")]);
    expect(state.current.furniture[0]).toBe(moved.current.furniture[0]);
    expect(analyzeLayout(DEMO_FLAT, state.current.furniture, 260)).toEqual([]);
  });

  it("skips a suggestion that would break a distance lock", () => {
    const locked = { ...createEditorState(), locks: { position: [], distance: [{ id: "distance-1", firstId: "living-sofa", secondId: "living-coffee-table", minimum: 100 }] } };
    const state = editorReducer(locked, { type: "suggest", roomId: "living" });
    expect(state.suggestionReport?.skipped).toEqual([expect.objectContaining({ id: "living-coffee-table", reason: "lock" })]);
    expect(ids(state)).toEqual(livingIds.filter((id) => id !== "living-coffee-table"));
  });

  it("empties the flat on Reset Demo and restores the furniture on undo", () => {
    const furnished = editorReducer(createEditorState(), { type: "suggest", roomId: "all" });
    const reset = editorReducer(furnished, { type: "reset" });
    expect(reset.current.furniture).toEqual([]);
    expect(reset.baseline.furniture).toEqual([]);
    expect(editorReducer(reset, { type: "undo" }).current).toEqual(furnished.current);
  });

  it("does not suggest furniture in the read-only Before view", () => {
    const before = editorReducer(createEditorState(), { type: "view", view: "before" });
    expect(editorReducer(before, { type: "suggest", roomId: "all" })).toBe(before);
  });
});
