import { describe, expect, it } from "vitest";
import { english, traditionalChinese, translate } from "./dictionary";

describe("shared bilingual UI", () => {
  it("has nonempty matching keys and template parameters", () => {
    expect(Object.keys(traditionalChinese).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(traditionalChinese[key].trim().length).toBeGreaterThan(0);
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(traditionalChinese[key])).toEqual(placeholders(english[key]));
    }
  });

  it("keeps explicit whole-flat assumptions in both languages", () => {
    expect(translate("en", "source.assumptions")).toContain("660 × 640");
    expect(translate("zh-Hant", "source.assumptions")).toContain("示範假設");
  });
});