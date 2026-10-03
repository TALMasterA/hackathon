import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { validateInput } from "./input";

const input = { width: "220", depth: "90", height: "85", roomHeight: "260", orientation: 0 };

describe("retained manual dimension validation", () => {
  it.each(["", "   ", "0", "-1", "NaN", "Infinity", "abc", "20cm", "1e2", "1,5"])("rejects malformed or nonpositive depth %j", (depth) => {
    const result = validateInput({ ...input, depth }, DEMO_FLAT);
    expect(result.complete).toBe(false);
    if (!result.complete) expect(result.issues[0].field).toBe("depth");
  });
  it.each(["219", "351", "", "Infinity"])("rejects ceiling outside the supported range %j", (roomHeight) => {
    expect(validateInput({ ...input, roomHeight }, DEMO_FLAT).complete).toBe(false);
  });
  it("rejects product maximums without silently clamping", () => {
    expect(validateInput({ ...input, width: "1001", height: "501" }, DEMO_FLAT).complete).toBe(false);
  });
  it("collects all missing dimensions", () => {
    const result = validateInput({ ...input, width: "", depth: "", height: "", roomHeight: "" }, DEMO_FLAT);
    if (!result.complete) expect(result.issues).toHaveLength(4);
    else throw new Error("Blank dimensions accepted");
  });
  it("preserves decimal values and accepts ceiling range endpoints", () => {
    expect(validateInput({ ...input, width: "220.25", roomHeight: "220" }, DEMO_FLAT)).toMatchObject({ complete: true, dimensions: { width: 220.25 } });
    expect(validateInput({ ...input, roomHeight: "350" }, DEMO_FLAT).complete).toBe(true);
  });
});