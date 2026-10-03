import { describe, expect, it } from "vitest";
import { Group } from "three";
import { createEditorState, editorReducer, type EditorAction, type EditorState } from "../flat-editor/state";
import { initialQuarterTurns, lookClearedBy, lookKey, lookRotationDeg, looksReducer, scopedLooks, visibleLooks, type Look, type Looks } from "./looks";

function furnishedState(): EditorState {
  const actions: EditorAction[] = [{ type: "suggest", roomId: "all" }, { type: "baseline" }, { type: "select", id: "living-sofa" }];
  return actions.reduce(editorReducer, createEditorState());
}

const look = (name = "My sofa"): Look => ({ object: new Group(), quarterTurns: 0, name, kind: "sofa" });

/** Mirrors the workspace: apply an editor action, then clear a look only when that action replaced its item. */
function step(state: EditorState, looks: Looks, action: EditorAction): [EditorState, Looks] {
  const next = editorReducer(state, action);
  const cleared = lookClearedBy(action, state, next);
  return [next, cleared ? looksReducer(looks, { type: "remove", itemId: cleared }) : looks];
}

describe("3D looks outside the editor reducer", () => {
  it("isolates equal item IDs and applies delayed results to their captured scenario", () => {
    const harmonyLook = look("Harmony sofa");
    const demoLook = look("Demo sofa");
    let looks = looksReducer(new Map(), { type: "set", itemId: lookKey("demo", "item-1"), look: demoLook });
    expect(scopedLooks(looks, "harmony").size).toBe(0);
    const capturedTarget = { scope: "harmony", id: "item-1" };
    looks = looksReducer(looks, { type: "set", itemId: lookKey(capturedTarget.scope, capturedTarget.id), look: harmonyLook });
    expect(scopedLooks(looks, "harmony").get("item-1")).toBe(harmonyLook);
    expect(scopedLooks(looks, "demo").get("item-1")).toBe(demoLook);
    looks = looksReducer(looks, { type: "remove", itemId: lookKey("harmony", "item-1") });
    expect(scopedLooks(looks, "demo").get("item-1")).toBe(demoLook);
  });

  it("clears only the replaced own flat's looks, since its item IDs start over", () => {
    const demoLook = look("Demo sofa");
    let looks = looksReducer(new Map(), { type: "set", itemId: lookKey("demo", "item-1"), look: demoLook });
    looks = looksReducer(looks, { type: "set", itemId: lookKey("own", "item-1"), look: look("Own sofa") });
    looks = looksReducer(looks, { type: "clear", scope: "own" });
    expect(scopedLooks(looks, "own").size).toBe(0);
    expect(scopedLooks(looks, "demo").get("item-1")).toBe(demoLook);
    expect(looksReducer(looks, { type: "clear", scope: "own" })).toBe(looks);
  });

  it("keep a deleted item's look so undo brings the item back with it", () => {
    const sofaLook = look();
    let looks = looksReducer(new Map(), { type: "set", itemId: "living-sofa", look: sofaLook });
    let state = furnishedState();
    [state, looks] = step(state, looks, { type: "delete-item", id: "living-sofa" });
    expect(visibleLooks(looks, state.current.furniture).has("living-sofa")).toBe(false);
    expect(looks.get("living-sofa")).toBe(sofaLook);
    [state, looks] = step(state, looks, { type: "undo" });
    expect(visibleLooks(looks, state.current.furniture).get("living-sofa")).toBe(sofaLook);
  });

  it("keep looks through Reset Demo so undo restores them", () => {
    const sofaLook = look();
    let looks = looksReducer(new Map(), { type: "set", itemId: "living-sofa", look: sofaLook });
    let state = furnishedState();
    [state, looks] = step(state, looks, { type: "reset" });
    expect(visibleLooks(looks, state.current.furniture).size).toBe(0);
    [state, looks] = step(state, looks, { type: "undo" });
    expect(visibleLooks(looks, state.current.furniture).get("living-sofa")).toBe(sofaLook);
  });

  it("clear the look when the item is replaced from the library, but not when a lock rejects the replacement", () => {
    const looks = looksReducer(new Map(), { type: "set", itemId: "living-sofa", look: look() });
    const locked = editorReducer(furnishedState(), { type: "distance-lock", firstId: "living-sofa", secondId: "living-coffee-table", minimum: "25" });
    const [rejected, kept] = step(locked, looks, { type: "replace-item", templateId: "double-bed" });
    expect(rejected.current).toBe(locked.current);
    expect(kept.has("living-sofa")).toBe(true);
    const [replaced, cleared] = step(furnishedState(), looks, { type: "replace-item", templateId: "coffee-table" });
    expect(replaced.current.furniture.find((item) => item.id === "living-sofa")?.kind).toBe("coffee-table");
    expect(cleared.has("living-sofa")).toBe(false);
  });

  it("clear the look on Remove look and leave other edits alone", () => {
    const looks = looksReducer(new Map(), { type: "set", itemId: "living-sofa", look: look() });
    const state = furnishedState();
    for (const action of [{ type: "propose", item: { ...state.current.furniture[0], orientation: 45 } }, { type: "draft", field: "width", value: "200" }, { type: "add-item", templateId: "chair" }] as EditorAction[]) {
      expect(lookClearedBy(action, state, editorReducer(state, action))).toBeNull();
    }
    expect(looksReducer(looks, { type: "remove", itemId: "living-sofa" }).has("living-sofa")).toBe(false);
  });

  it("turns a look a quarter at a time and ignores turns for items without a look", () => {
    let looks = looksReducer(new Map(), { type: "set", itemId: "living-sofa", look: look() });
    const turns = [];
    for (let index = 0; index < 4; index++) {
      looks = looksReducer(looks, { type: "turn", itemId: "living-sofa" });
      turns.push(looks.get("living-sofa")?.quarterTurns);
    }
    expect(turns).toEqual([1, 2, 3, 0]);
    expect(looksReducer(looks, { type: "turn", itemId: "missing" })).toBe(looks);
  });

  it("render only for existing items of the kind the look was made for", () => {
    const looks = looksReducer(new Map(), { type: "set", itemId: "item-1", look: look() });
    let state = editorReducer(createEditorState(), { type: "add-item", templateId: "sofa" });
    expect(visibleLooks(looks, state.current.furniture).has("item-1")).toBe(true);
    state = editorReducer(state, { type: "undo" });
    state = editorReducer(state, { type: "add-item", templateId: "wardrobe" });
    expect(state.current.furniture[0].id).toBe("item-1");
    expect(visibleLooks(looks, state.current.furniture).has("item-1")).toBe(false);
  });

  it("start a new look a quarter turn round only when its long side clearly crosses the item's", () => {
    // The real TRELLIS sofa from the end-to-end check: 0.40 x 0.45 x 1.00 m, front facing +X.
    const trellisSofa = { min: [-0.19, -0.229, -0.499], max: [0.206, 0.222, 0.5] } as const;
    expect(initialQuarterTurns(trellisSofa, { width: 180, depth: 80 })).toBe(1);
    expect(lookRotationDeg({ quarterTurns: 1 })).toBe(90);
    expect(initialQuarterTurns(trellisSofa, { width: 80, depth: 190 })).toBe(0);
    expect(initialQuarterTurns({ min: [0, 0, 0], max: [0.98, 0.46, 0.41] }, { width: 180, depth: 80 })).toBe(0);
    expect(initialQuarterTurns({ min: [0, 0, 0], max: [0.42, 0.8, 0.45] }, { width: 180, depth: 80 })).toBe(0);
    expect(initialQuarterTurns(trellisSofa, { width: 42, depth: 42 })).toBe(0);
  });
});
