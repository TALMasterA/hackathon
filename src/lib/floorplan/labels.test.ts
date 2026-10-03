import { describe, expect, it } from "vitest";
import { findScaleBar, flatTypeIn, tickSearch, type TextBox } from "./labels";

/** Harmony 1's scale-bar labels and two flat labels, as pdf.js reports them (page at scale 1, y down). */
const text = (value: string, x: number, baseline: number, width = 2.3, height = 4.2): TextBox => ({ text: value, x, y: baseline - height, width, height });
const HARMONY: TextBox[] = [
  text("2", 967.14, 757.77), text("0", 995.12, 757.77), text("2", 1023.15, 757.77), text("4", 1051.11, 757.77), text("6", 1079.11, 757.77), text("8", 1106.97, 757.77), text("m", 1112.99, 757.58, 3),
  text("2B", 566.39, 227.17, 10.75, 9.8), text("2B", 611.02, 227.17, 10.75, 9.8), text("1B", 566.39, 711.64, 10.75, 9.8),
  text("STANDARD BLOCK", 380, 760, 60, 6),
];

describe("plan labels", () => {
  it("finds the scale bar from 0 to 8 m, ignoring the 2 m left of zero", () => {
    const bar = findScaleBar(HARMONY);
    expect(bar).toMatchObject({ metres: 8, zero: { x: 995.12 }, end: { x: 1106.97 } });
    const search = tickSearch(bar!.zero);
    expect(search.tap.x).toBeCloseTo(996.27, 2);
    expect(search.tap.y).toBeGreaterThan(757.77);
  });

  it("finds no scale bar without a zero and a unit on one line", () => {
    expect(findScaleBar(HARMONY.filter((entry) => entry.text !== "0"))).toBeNull();
    expect(findScaleBar(HARMONY.filter((entry) => entry.text !== "m"))).toBeNull();
  });

  it("reads the flat type inside a box only when one type is there", () => {
    expect(flatTypeIn(HARMONY, { minX: 480, maxX: 590, minZ: 150, maxZ: 270 })).toBe("2B");
    expect(flatTypeIn(HARMONY, { minX: 480, maxX: 700, minZ: 150, maxZ: 720 })).toBeNull();
    expect(flatTypeIn(HARMONY, { minX: 0, maxX: 100, minZ: 0, maxZ: 100 })).toBeNull();
  });
});
