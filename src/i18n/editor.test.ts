import { describe, expect, it } from "vitest";
import { DEMO_FLAT, FLAT_FURNITURE } from "../data/flat-preset";
import { analyzeLayout } from "../lib/geometry/layout";
import { editorChinese, editorEnglish, type EditorTranslationKey } from "./editor";
import { editorInputMessage, layoutMessage, lockMessage } from "./editor-messages";

describe("whole-flat translations", () => {
  it("has complete key and placeholder parity", () => {
    expect(Object.keys(editorChinese).sort()).toEqual(Object.keys(editorEnglish).sort());
    for (const key of Object.keys(editorEnglish) as EditorTranslationKey[]) {
      expect(editorChinese[key].trim().length).toBeGreaterThan(0);
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(editorChinese[key])).toEqual(placeholders(editorEnglish[key]));
    }
  });

  it("localises new numeric fields and lock numbers", () => {
    expect(editorInputMessage({ code: "input.missing", field: "angle" }, "zh-Hant")).toContain("旋轉角度");
    expect(lockMessage({ code: "lock.distance", lockId: "distance-1", firstId: "living-sofa", secondId: "living-coffee-table", required: 40, actual: 32.5 }, FLAT_FURNITURE, "zh-Hant")).toContain("要求 40 厘米；嘗試值 32.5 厘米");
  });

  it("translates exact furniture overlap values rather than a canned result", () => {
    const furniture = [FLAT_FURNITURE[0], { ...FLAT_FURNITURE[3], position: { x: 350, z: 270 } }];
    const issue = analyzeLayout(DEMO_FLAT, furniture, 260).find((entry) => entry.code === "furniture");
    expect(issue).toBeDefined();
    if (issue) {
      expect(layoutMessage(issue, DEMO_FLAT, furniture, "en")).toContain("penetration 10 cm");
      expect(layoutMessage(issue, DEMO_FLAT, furniture, "zh-Hant")).toContain("梳化與邊几");
    }
  });
});