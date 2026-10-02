import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES } from "../../data/preset";
import type { FurnitureItem, ReplacementInput } from "../../types/domain";
import { boundaryReduction, checkReplacement } from "./check-placement";
import { GEOMETRY_EPSILON_CM, getFootprint, getOverlap } from "./footprint";

const check = (changes: Partial<ReplacementInput> = {}) => checkReplacement({ ...DEFAULT_INPUT, ...changes }, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES, "old-sofa");

describe("fixed-centre sofa replacement", () => {
  it("accepts the default candidate and passes all four checks", () => {
    const result = check();
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.checks).toHaveLength(4);
      expect(result.checks.every((item) => item.passed)).toBe(true);
      expect(result.candidate.position).toEqual({ x: 200, z: 250 });
    }
  });

  it("excludes the old sofa from obstacles despite overlapping footprints", () => {
    const oldSofa = EXISTING_FURNITURE[0];
    expect(getOverlap(getFootprint(oldSofa), getFootprint({ ...oldSofa, width: 220, depth: 90 }))).not.toBeNull();
    expect(check().status).toBe("valid");
  });

  it.each(["", "   ", "0", "-1", "NaN", "Infinity", "abc", "20cm", "1e2", "1,5"])("returns incomplete for depth %j", (depth) => {
    const result = check({ depth });
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete") expect(result.issues[0].field).toBe("depth");
  });

  it("rejects a value above the UI maximum rather than clamping", () => {
    expect(check({ width: "1001" })).toEqual({ status: "incomplete", issues: [{ code: "input.maximum", field: "width", maximum: 1000 }] });
  });

  it("returns all missing fields together", () => {
    const result = check({ width: "", depth: "", height: "", roomHeight: "" });
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete") expect(result.issues).toHaveLength(4);
  });

  it("reports numeric left and right boundary overflows", () => {
    const result = check({ width: "450" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.violations).toEqual(expect.arrayContaining([
        { code: "boundary", side: "left", excess: 25 },
        { code: "boundary", side: "right", excess: 5 },
      ]));
      expect(boundaryReduction(result, "x")).toBe(50);
    }
  });

  it("reports the excess height", () => {
    const result = check({ height: "280" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.violations).toContainEqual({ code: "height", excess: 20 });
  });

  it("reports a 5 cm X overlap with the side table", () => {
    const result = check({ width: "250" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.violations).toContainEqual(expect.objectContaining({ code: "collision", furnitureId: "side-table", overlapX: 5, overlapZ: 40 }));
  });

  it("reports entry into the configured sofa-table clear zone", () => {
    const result = check({ depth: "100" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.violations).toContainEqual(expect.objectContaining({ code: "reserved", zoneId: "sofa-table-clear-zone", overlapZ: 5 }));
  });

  it("allows exact edge contact with the side table", () => {
    expect(check({ width: "240" }).status).toBe("valid");
  });

  it("allows exact contact with the back room boundary", () => {
    const result = checkReplacement({ ...DEFAULT_INPUT, depth: "100" }, DEMO_ROOM, EXISTING_FURNITURE, [], "old-sofa");
    expect(result.status).toBe("valid");
  });

  it("allows exact contact with all room sides in an obstacle-free room", () => {
    const centredSofa: FurnitureItem = { ...EXISTING_FURNITURE[0], position: { x: 210, z: 150 } };
    const result = checkReplacement({ ...DEFAULT_INPUT, width: "420", depth: "300" }, DEMO_ROOM, [centredSofa], [], "old-sofa");
    expect(result.status).toBe("valid");
  });

  it("swaps width and depth at 90 degrees", () => {
    const result = check({ orientation: 90 });
    expect(result.status).toBe("invalid");
    if (result.status !== "incomplete") {
      expect(getFootprint(result.candidate)).toMatchObject({ width: 90, depth: 220 });
      if (result.status === "invalid") expect(result.violations).toContainEqual({ code: "boundary", side: "back", excess: 60 });
    }
  });

  it("returns simultaneous boundary, height, collision, and reserved-zone violations", () => {
    const result = check({ width: "500", depth: "260", height: "280" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(new Set(result.violations.map((item) => item.code))).toEqual(new Set(["boundary", "height", "collision", "reserved"]));
      expect(result.violations.length).toBeGreaterThan(4);
    }
  });

  it("ignores sub-epsilon floating-point edge overlap", () => {
    expect(check({ width: String(240 + GEOMETRY_EPSILON_CM) }).status).toBe("valid");
    expect(check({ width: String(240 + 4 * GEOMETRY_EPSILON_CM) }).status).toBe("invalid");
  });

  it("changes the outcome when room height changes", () => {
    expect(check({ height: "250", roomHeight: "260" }).status).toBe("valid");
    const result = check({ height: "250", roomHeight: "220" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.violations).toContainEqual({ code: "height", excess: 30 });
  });

  it.each(["219", "351", "", "Infinity"])("rejects unsupported room height %j", (roomHeight) => {
    expect(check({ roomHeight }).status).toBe("incomplete");
  });

  it("accepts decimal dimensions without silently rounding", () => {
    const result = check({ width: "220.25", depth: "89.5", height: "85.75" });
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.candidate.width).toBe(220.25);
  });

  it("computes the fixed-centre depth reduction, not just the overflow", () => {
    const result = check({ depth: "120" });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(boundaryReduction(result, "z")).toBe(20);
  });

  it("detects entrance-zone intersection independently of furniture", () => {
    const nearEntrance: FurnitureItem = { ...EXISTING_FURNITURE[0], position: { x: 45, z: 50 } };
    const result = checkReplacement({ ...DEFAULT_INPUT, width: "40", depth: "40" }, DEMO_ROOM, [nearEntrance], RESERVED_ZONES, "old-sofa");
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.violations).toContainEqual(expect.objectContaining({ code: "reserved", zoneId: "entrance-zone" }));
  });

  it("allows exact zone-boundary contact", () => {
    expect(check({ depth: "90" }).status).toBe("valid");
  });
});