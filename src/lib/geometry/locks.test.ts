import { describe, expect, it } from "vitest";
import { DEMO_FLAT, FLAT_FURNITURE } from "../../data/flat-preset";
import type { FlatFurniture, LayoutLocks } from "../../types/domain";
import { furnitureDraft, replaceDimensions, validateFurnitureDraft } from "./edit";
import { analyzeLayout } from "./layout";
import { distanceLockViolations, proposeItemEdit } from "./locks";

const first: FlatFurniture = { ...FLAT_FURNITURE[3], id: "first", position: { x: 100, z: 100 }, width: 40, depth: 40 };
const second: FlatFurniture = { ...first, id: "second", position: { x: 200, z: 100 } };
const third: FlatFurniture = { ...first, id: "third", position: { x: 100, z: 200 } };
const furniture = [first, second, third];
const locks: LayoutLocks = { position: [], distance: [{ id: "gap-1", firstId: "first", secondId: "second", minimum: 50 }, { id: "gap-2", firstId: "first", secondId: "third", minimum: 50 }] };

describe("generic lock rejection", () => {
  it("blocks a position-locked move but allows rotation and resizing", () => {
    const locked = { position: ["first", "second"], distance: [] };
    expect(proposeItemEdit(furniture, { ...first, position: { x: 101, z: 100 } }, locked)).toMatchObject({ accepted: false, item: first });
    expect(proposeItemEdit(furniture, { ...second, position: { x: 201, z: 100 } }, locked).accepted).toBe(false);
    expect(proposeItemEdit(furniture, { ...first, orientation: 30, width: 50 }, locked).accepted).toBe(true);
  });

  it("accepts an edit satisfying multiple distance locks on one item", () => {
    expect(proposeItemEdit(furniture, { ...first, position: { x: 90, z: 90 } }, locks).accepted).toBe(true);
    expect(distanceLockViolations(furniture, locks.distance)).toEqual([]);
  });

  it("bounces to the last accepted item and reports every broken lock", () => {
    const result = proposeItemEdit(furniture, { ...first, position: { x: 125, z: 125 } }, locks);
    expect(result.accepted).toBe(false);
    expect(result.item).toBe(first);
    expect(result.violations).toHaveLength(2);
    expect(result.violations).toEqual(expect.arrayContaining([expect.objectContaining({ lockId: "gap-1", required: 50, actual: 35 }), expect.objectContaining({ lockId: "gap-2", required: 50, actual: 35 })]));
  });

  it("collects position and distance violations together", () => {
    const result = proposeItemEdit(furniture, { ...first, position: { x: 125, z: 125 } }, { ...locks, position: ["first"] });
    expect(result.violations).toHaveLength(3);
  });

  it("also rejects a rotation or dimension replacement that breaks a distance lock", () => {
    const tighter = { ...locks, distance: locks.distance.map((lock) => ({ ...lock, minimum: 55 })) };
    expect(proposeItemEdit(furniture, { ...first, orientation: 45 }, tighter).accepted).toBe(false);
    expect(proposeItemEdit(furniture, replaceDimensions(first, { width: 100, depth: 40, height: 50 }), locks).accepted).toBe(false);
  });

  it("accepts temporary overlap when no distance lock forbids it", () => {
    const proposed = { ...first, position: { ...second.position } };
    expect(proposeItemEdit(furniture, proposed, { position: [], distance: [] }).accepted).toBe(true);
    expect(analyzeLayout(DEMO_FLAT, [proposed, second], 260).some((issue) => issue.code === "furniture")).toBe(true);
  });

  it("allows zero-distance locks even during overlap", () => {
    expect(proposeItemEdit(furniture, { ...first, position: second.position }, { position: [], distance: [{ ...locks.distance[0], minimum: 0 }] }).accepted).toBe(true);
  });
});

describe("manual whole-flat edits", () => {
  it.each(["", "0", "-2", "NaN", "Infinity", "20cm", "1e2", "1001"])("preserves invalid-dimension rejection for %j", (width) => {
    expect(validateFurnitureDraft({ ...furnitureDraft(first), width }, first, DEMO_FLAT).complete).toBe(false);
  });

  it("keeps position and rotation when replacing dimensions", () => {
    const rotated = { ...first, orientation: 30.5 };
    const next = replaceDimensions(rotated, { width: 80, depth: 60, height: 75 });
    expect(next.position).toEqual(rotated.position);
    expect(next.orientation).toBe(30.5);
    expect(next.width).toBe(80);
  });

  it("accepts precise decimals and outside-envelope positions without clamping", () => {
    const result = validateFurnitureDraft({ ...furnitureDraft(first), width: "40.5", x: "-25.25", angle: "135.5" }, first, DEMO_FLAT);
    expect(result.complete).toBe(true);
    if (result.complete) expect(result.item).toMatchObject({ width: 40.5, position: { x: -25.25, z: 100 }, orientation: 135.5 });
  });

  it("normalises the 360 input alias and rejects out-of-range rotation", () => {
    const complete = validateFurnitureDraft({ ...furnitureDraft(first), angle: "360" }, first, DEMO_FLAT);
    if (complete.complete) expect(complete.item.orientation).toBe(0);
    expect(validateFurnitureDraft({ ...furnitureDraft(first), angle: "361" }, first, DEMO_FLAT).complete).toBe(false);
  });
});