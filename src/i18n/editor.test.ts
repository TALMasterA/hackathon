import { describe, expect, it } from "vitest";
import { DEMO_FLAT, SUGGESTED_FURNITURE } from "../data/flat-preset";
import { analyzeLayout } from "../lib/geometry/layout";
import { editorChinese, editorEnglish, type EditorTranslationKey } from "./editor";
import { editorInputMessage, layoutMessage, lockMessage, suggestionMessage } from "./editor-messages";

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
    expect(lockMessage({ code: "lock.distance", lockId: "distance-1", firstId: "living-sofa", secondId: "living-coffee-table", required: 40, actual: 32.5 }, SUGGESTED_FURNITURE, "zh-Hant")).toContain("要求 40 厘米；嘗試值 32.5 厘米");
  });

  it("translates exact furniture overlap values rather than a canned result", () => {
    const furniture = [SUGGESTED_FURNITURE[0], { ...SUGGESTED_FURNITURE[3], position: { x: 350, z: 270 } }];
    const issue = analyzeLayout(DEMO_FLAT, furniture, 260).find((entry) => entry.code === "furniture");
    expect(issue).toBeDefined();
    if (issue) {
      expect(layoutMessage(issue, DEMO_FLAT, furniture, "en")).toContain("penetration 10 cm");
      expect(layoutMessage(issue, DEMO_FLAT, furniture, "zh-Hant")).toContain("梳化與邊几");
    }
  });

  it("explains added and skipped suggestions with item names and reasons", () => {
    const report = { roomId: "living", added: ["living-tv"], skipped: [{ id: "living-sofa", name: SUGGESTED_FURNITURE[0].name, reason: "furniture" as const }, { id: "living-coffee-table", name: SUGGESTED_FURNITURE[1].name, reason: "present" as const }] };
    expect(suggestionMessage(report, "en")).toBe("Suggested items added: 1. Skipped: Sofa (would overlap furniture), Coffee table (already present).");
    expect(suggestionMessage(report, "zh-Hant")).toBe("已加入建議傢俬：1 件。已略過：梳化（會與傢俬重疊）、茶几（已存在）。");
    expect(suggestionMessage({ ...report, added: [] , skipped: [] }, "en")).toBe("No suggested items were added.");
  });
});
