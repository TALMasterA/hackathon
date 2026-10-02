import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES } from "../data/preset";
import { checkReplacement } from "../lib/geometry/check-placement";
import { english, traditionalChinese, translate } from "./dictionary";
import { correctionMessages, inputMessage, violationMessage } from "./messages";

describe("bilingual explanations", () => {
  it("provides the exact same nonempty keys in both languages", () => {
    expect(Object.keys(traditionalChinese).sort()).toEqual(Object.keys(english).sort());
    expect(Object.values(traditionalChinese).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("preserves identical template parameters in every translation", () => {
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(traditionalChinese[key])).toEqual(placeholders(english[key]));
    }
  });

  it("localises the missing field name and explanation", () => {
    expect(inputMessage({ code: "input.missing", field: "depth" }, "en")).toContain("Depth is missing");
    expect(inputMessage({ code: "input.missing", field: "depth" }, "zh-Hant")).toContain("深度");
  });

  it("includes actual numeric collision data and the localised name", () => {
    const result = checkReplacement({ ...DEFAULT_INPUT, width: "250" }, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES, "old-sofa");
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      const collision = result.violations.find((item) => item.code === "collision");
      expect(collision).toBeDefined();
      if (collision) {
        expect(violationMessage(collision, "en")).toContain("5 cm horizontally");
        expect(violationMessage(collision, "zh-Hant")).toContain("邊几");
      }
    }
  });

  it("maps the boundary reduction back to product width when rotated", () => {
    const result = checkReplacement({ ...DEFAULT_INPUT, orientation: 90 }, DEMO_ROOM, EXISTING_FURNITURE, RESERVED_ZONES, "old-sofa");
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(correctionMessages(result, "en")[0]).toContain("reduce Width by at least 120 cm");
  });

  it("replaces scenario placeholders without leaving tokens in the UI", () => {
    expect(translate("en", "room.dimensions", { width: 420, depth: 300 })).toBe("420 × 300 cm room");
  });
});