import { describe, expect, it } from "vitest";
import { DEMO_FLAT, SUGGESTED_FURNITURE } from "../../data/flat-preset";
import { rectangleBox } from "../../lib/geometry/architecture";
import { analyzeLayout } from "../../lib/geometry/layout";
import { polygonBounds, rectanglePolygon } from "../../lib/geometry/oriented";
import { L_FLAT } from "../../lib/floorplan/test-flats";
import type { FlatFurniture } from "../../types/domain";
import { createEditorState, editorReducer, type EditorAction, type EditorState } from "./state";
import { isDemoFlat, suggestionIds, suggestionSlots } from "./suggestions";

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);

/** Distance from the item's back to the room edge it was placed against; null when it backs onto no edge. */
function backClearance(item: FlatFurniture): number | null {
  const room = rectangleBox(L_FLAT.rooms.find((entry) => entry.id === item.roomId)!);
  const bounds = polygonBounds(rectanglePolygon(item));
  const gaps: Record<number, number> = { 180: bounds.minZ - room.minZ, 0: room.maxZ - bounds.maxZ, 90: bounds.minX - room.minX, 270: room.maxX - bounds.maxX };
  return gaps[item.orientation] ?? null;
}

describe("switching flats", () => {
  it("starts a fresh document on the new flat but keeps the language", () => {
    const furnished = run(createEditorState(), { type: "suggest", roomId: "all" }, { type: "position-lock", id: "living-sofa" }, { type: "baseline" }, { type: "language", language: "zh-Hant" });
    const switched = editorReducer(furnished, { type: "use-flat", flat: L_FLAT });
    expect(switched.flat).toBe(L_FLAT);
    expect(switched.current).toEqual({ furniture: [], ceilingHeight: 260 });
    expect(switched.baseline.furniture).toEqual([]);
    expect(switched.locks).toEqual({ position: [], distance: [] });
    expect([switched.past, switched.future]).toEqual([[], []]);
    expect(switched).toMatchObject({ language: "zh-Hant", cameraRevision: furnished.cameraRevision + 1, selectedRoomId: "living", selectedId: null, nextItemNumber: 1 });
    expect(editorReducer(switched, { type: "undo" })).toBe(switched);
  });

  it("keeps a traced flat on Reset", () => {
    const furnished = run(createEditorState(L_FLAT), { type: "suggest", roomId: "all" });
    const reset = editorReducer(furnished, { type: "reset" });
    expect(reset.flat).toBe(L_FLAT);
    expect(reset.current.furniture).toEqual([]);
  });

  it("uses the traced flat for item placement and room assignment", () => {
    const state = run(createEditorState(L_FLAT), { type: "room", id: "kitchen" }, { type: "add-item", templateId: "fridge" });
    const fridge = state.current.furniture[0];
    expect(fridge.roomId).toBe("kitchen");
    const moved = editorReducer(state, { type: "propose", item: { ...fridge, position: { x: 200, z: 450 } } });
    expect(moved.current.furniture[0].roomId).toBe("bedroom");
  });
});

describe("suggestions on a traced flat", () => {
  it("plans a set per room kind with stable IDs and a double bed in the largest bedroom", () => {
    expect(isDemoFlat(DEMO_FLAT)).toBe(true);
    expect(isDemoFlat(L_FLAT)).toBe(false);
    expect(suggestionSlots(L_FLAT).map((slot) => slot.id)).toEqual(["living-sofa", "living-coffee-table", "living-tv-console", "living-dining-table", "living-chair-1", "living-chair-2", "bedroom-double-bed", "bedroom-wardrobe", "bedroom-desk", "kitchen-kitchen-counter", "kitchen-fridge"]);
    expect(suggestionIds(DEMO_FLAT)).toEqual(SUGGESTED_FURNITURE.map((item) => item.id));
  });

  it("adds a single bed to the living room of a flat without bedrooms", () => {
    const studio = { ...L_FLAT, rooms: L_FLAT.rooms.map((room) => room.kind === "bedroom" ? { ...room, kind: "other" as const } : room) };
    expect(suggestionSlots(studio).filter((slot) => slot.template.kind === "bed").map((slot) => slot.id)).toEqual(["living-single-bed"]);
  });

  it("furnishes every room warning-free as one undo step, with wall items backed against a wall", () => {
    const state = editorReducer(createEditorState(L_FLAT), { type: "suggest", roomId: "all" });
    expect(state.suggestionReport?.skipped).toEqual([]);
    expect(state.current.furniture.map((item) => item.id)).toEqual(suggestionIds(L_FLAT));
    expect(analyzeLayout(L_FLAT, state.current.furniture, 260)).toEqual([]);
    expect(state.past).toHaveLength(1);
    for (const id of ["living-sofa", "living-tv-console", "bedroom-double-bed", "bedroom-wardrobe", "kitchen-fridge"]) {
      expect(backClearance(state.current.furniture.find((item) => item.id === id)!), id).toBeCloseTo(1, 6);
    }
    const bed = state.current.furniture.find((item) => item.id === "bedroom-double-bed")!;
    expect(bed).toMatchObject({ width: 140, depth: 190, roomId: "bedroom" });
  });

  it("turns the TV console to face the sofa from the opposite wall", () => {
    const state = editorReducer(createEditorState(L_FLAT), { type: "suggest", roomId: "living" });
    const sofa = state.current.furniture.find((item) => item.id === "living-sofa")!;
    const tv = state.current.furniture.find((item) => item.id === "living-tv-console")!;
    expect(Math.abs(sofa.orientation - tv.orientation)).toBe(180);
  });

  it("reports suggestions already in place without adding anything", () => {
    const once = editorReducer(createEditorState(L_FLAT), { type: "suggest", roomId: "kitchen" });
    const twice = editorReducer(once, { type: "suggest", roomId: "kitchen" });
    expect(twice.current).toBe(once.current);
    expect(twice.suggestionReport?.skipped.map((entry) => entry.reason)).toEqual(["present", "present"]);
  });

  it("skips an item that fits nowhere in a too-small room", () => {
    const cramped = { ...L_FLAT, rooms: L_FLAT.rooms.map((room) => room.id === "kitchen" ? { ...room, width: 60, position: { x: 450, z: 160 } } : room) };
    const state = editorReducer(createEditorState(cramped), { type: "suggest", roomId: "kitchen" });
    expect(state.suggestionReport?.skipped).toContainEqual(expect.objectContaining({ id: "kitchen-kitchen-counter" }));
  });
});
