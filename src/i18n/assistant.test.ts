import { describe, expect, it } from "vitest";
import { assistantChinese, assistantEnglish, assistantText, type AssistantTranslationKey } from "./assistant";

describe("design assistant translations", () => {
  it("has complete key and placeholder parity", () => {
    expect(Object.keys(assistantChinese).sort()).toEqual(Object.keys(assistantEnglish).sort());
    for (const key of Object.keys(assistantEnglish) as AssistantTranslationKey[]) {
      expect(assistantChinese[key].trim().length, key).toBeGreaterThan(0);
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(assistantChinese[key]), key).toEqual(placeholders(assistantEnglish[key]));
    }
  });

  it("fills placeholders and uses the brief's labels in both languages", () => {
    expect(assistantText("en", "proposal.title", { version: 2 })).toBe("Proposal v2");
    expect(assistantText("zh-Hant", "pref.changeLimit", { count: 1 })).toBe("最多改動 1 件傢俬");
    expect(assistantText("zh-Hant", "assistant.tab")).toBe("設計協作助手");
    expect(assistantText("zh-Hant", "confirm.generate")).toBe("產生方案");
    expect(assistantText("zh-Hant", "proposal.accept")).toBe("接受並套用");
    expect(assistantText("zh-Hant", "proposal.reject")).toBe("唔滿意");
    expect(assistantText("zh-Hant", "proposal.discard")).toBe("放棄方案");
    expect(assistantText("zh-Hant", "reject.generate")).toBe("按回饋重新產生");
    expect(assistantText("zh-Hant", "accepted.undo")).toBe("復原今次套用");
    expect(assistantText("zh-Hant", "assistant.placeholder")).toContain("想客廳易行啲，梳化唔好郁，其他傢俬可以調整。");
  });
});
