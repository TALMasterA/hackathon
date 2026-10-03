import { describe, expect, it } from "vitest";
import { DEMO_FLAT, SUGGESTED_FURNITURE } from "../../data/flat-preset";
import { HARMONY_EXAMPLES, HARMONY_FLAT } from "../../data/harmony-preset";
import { layoutMessage } from "../../i18n/editor-messages";
import { L_FLAT } from "../floorplan/test-flats";
import type { Flat } from "../../types/domain";
import { flatVoids } from "./architecture";
import { analyzeLayout } from "./layout";

const chair = SUGGESTED_FURNITURE.find((item) => item.kind === "chair")!;

describe("space inside the bounding box but outside the flat", () => {
  it("finds no voids in the demo flat, so its checks are unchanged", () => {
    expect(flatVoids(DEMO_FLAT)).toEqual([]);
  });

  it("leaves a flat with a traced outline to the outline check, diagonal bay included", () => {
    expect(flatVoids(HARMONY_FLAT)).toEqual([]);
    expect(analyzeLayout(HARMONY_FLAT, HARMONY_EXAMPLES, 260)).toEqual([]);
  });

  it("finds the notch of an L-shaped flat as one rectangle", () => {
    expect(flatVoids(L_FLAT)).toEqual([{ position: { x: 525, z: 475 }, width: 210, depth: 310, orientation: 0 }]);
  });

  it("counts the strip between facing rooms as inside the flat even without a wall", () => {
    const open = { ...L_FLAT, walls: L_FLAT.walls.filter((wall) => wall.id !== "living-kitchen"), doors: L_FLAT.doors.filter((door) => door.wallId !== "living-kitchen") };
    expect(flatVoids(open)).toEqual(flatVoids(L_FLAT));
  });

  it("reuses the result while rooms and walls are unchanged", () => {
    const lowerCeiling: Flat = { ...L_FLAT, height: 240 };
    expect(flatVoids(lowerCeiling)).toBe(flatVoids(L_FLAT));
  });

  it("reports furniture in the notch as outside the flat", () => {
    const item = { ...chair, id: "notch-chair", position: { x: 500, z: 450 } };
    const issues = analyzeLayout(L_FLAT, [item], 260);
    // Penetration is the shortest move back into the flat: past the notch's left edge at x = 420.
    expect(issues).toEqual([expect.objectContaining({ code: "outside", itemId: "notch-chair", penetration: 101, area: 42 * 42 })]);
    expect(layoutMessage(issues[0], L_FLAT, [item], "en")).toContain("outside the flat");
    expect(layoutMessage(issues[0], L_FLAT, [item], "zh-Hant")).toContain("單位範圍以外");
  });

  it("reports only the part that pokes into the notch", () => {
    const item = { ...chair, id: "edge-chair", position: { x: 380, z: 560 }, width: 120 };
    const outside = analyzeLayout(L_FLAT, [item], 260).find((issue) => issue.code === "outside");
    expect(outside).toMatchObject({ overlapX: 20, overlapZ: 42 });
  });
});
