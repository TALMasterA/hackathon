import { describe, expect, it } from "vitest";
import { traceChinese, traceEnglish, traceText, type TraceTranslationKey } from "./trace";

describe("floor-plan trace translations", () => {
  it("has complete key and placeholder parity", () => {
    expect(Object.keys(traceChinese).sort()).toEqual(Object.keys(traceEnglish).sort());
    for (const key of Object.keys(traceEnglish) as TraceTranslationKey[]) {
      expect(traceChinese[key].trim().length).toBeGreaterThan(0);
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(traceChinese[key]), key).toEqual(placeholders(traceEnglish[key]));
    }
  });

  it("fills placeholders in both languages", () => {
    expect(traceText("en", "issue.bedroom-count", { type: "2B", expected: 2, actual: 1 })).toBe("2B flats have 2 bedrooms; this trace has 1.");
    expect(traceText("zh-Hant", "scale.found", { metres: 8 })).toContain("0 至 8 米");
  });
});
