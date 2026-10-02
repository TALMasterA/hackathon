import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES } from "../../data/preset";
import { checkReplacement } from "../../lib/geometry/check-placement";
import { INITIAL_STATE, fitInReducer } from "./state";

const valid = checkReplacement(DEFAULT_INPUT, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES, "old-sofa");
const accepted = fitInReducer(INITIAL_STATE, { type: "check", result: valid });

describe("accepted replacement state", () => {
  it("enables and displays After only following a valid check", () => {
    expect(accepted.result?.status).toBe("valid");
    expect(accepted.view).toBe("after");
  });

  it("does not enable After without a valid result", () => {
    expect(fitInReducer(INITIAL_STATE, { type: "view", view: "after" }).view).toBe("before");
  });

  it.each(["width", "depth", "height", "roomHeight"] as const)("invalidates acceptance after editing %s", (field) => {
    const state = fitInReducer(accepted, { type: "field", field, value: "240" });
    expect(state.result).toBeNull();
    expect(state.view).toBe("before");
    expect(state.dirty).toBe(true);
  });

  it("invalidates acceptance after changing orientation", () => {
    expect(fitInReducer(accepted, { type: "orientation", orientation: 90 })).toMatchObject({ result: null, view: "before", dirty: true });
  });

  it("preserves acceptance when translating the UI", () => {
    expect(fitInReducer(accepted, { type: "language", language: "zh-Hant" })).toMatchObject({ result: valid, view: "after", language: "zh-Hant" });
  });

  it("preserves acceptance for unchanged data", () => {
    expect(fitInReducer(accepted, { type: "field", field: "width", value: "220" })).toBe(accepted);
    expect(fitInReducer(accepted, { type: "select", id: "old-sofa" })).toBe(accepted);
  });

  it("keeps Before for an invalid fit", () => {
    const invalid = checkReplacement({ ...DEFAULT_INPUT, width: "250" }, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES, "old-sofa");
    expect(fitInReducer(accepted, { type: "check", result: invalid }).view).toBe("before");
  });

  it("resets the demo and camera revision while retaining the language", () => {
    const translated = fitInReducer(accepted, { type: "language", language: "zh-Hant" });
    expect(fitInReducer(translated, { type: "reset" })).toMatchObject({ input: DEFAULT_INPUT, result: null, view: "before", language: "zh-Hant", demoRevision: 1 });
  });
});