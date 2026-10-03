import type { Language } from "../types/domain";

export const english = {
  "app.title": "Whole-flat layout",
  "app.category": "FURNITURE LAYOUT",
  "app.demo": "Preset demo",
  "app.reset": "Reset Demo",
  "app.language": "Language",
  "app.skip": "Skip to selected item",
  "room.scenario": "Concord 1 Option 1 — 2B reference scenario (simplified demo dimensions)",
  "scene.label": "Simplified 3D flat",
  "scene.loading": "Loading flat",
  "scene.unavailable": "The 3D view is unavailable on this device. The plan and numeric editor still work.",
  "scene.caption": "Simplified model generated from entered dimensions. Appearance is illustrative.",
  "scene.reset": "Reset View",
  "scene.zoomIn": "Zoom in",
  "scene.zoomOut": "Zoom out",
  "scene.before": "Before",
  "scene.after": "After",
  "scene.comparison": "Layout comparison",
  "source.heading": "Scenario & assumptions",
  "source.assumptions": "This 660 × 640 cm whole flat, five-room layout and default 260 cm ceiling height are simplified demo assumptions, not Housing Authority-certified measurements.",
  "source.plan": "The official PDF is a typical full-floor plan, not a dimensioned individual-flat plan. This flat is not an exact reconstruction.",
  "source.zones": "Door swing zones are conservative rectangular demo constraints, not regulations or universal safety standards. Windows are visual only; sill and window clearance are not checked.",
  "source.verify": "Verify the dimensions of your own flat before making a purchase decision.",
  "source.index": "Housing Authority reference",
  "source.pdf": "Concord 1 official PDF",
  "source.limitations": "Only rectangular furniture, walls, configured door swing zones and the flat envelope are checked. Window sill/clearance, delivery routes, fixtures, skirting boards, pipes, irregular shapes and compressible furniture are not modelled. This is not professional, structural, accessibility or building-code advice.",
  "footer.privacy": "Browser-only calculations. No photos, accounts or FitIn backend.",
  "footer.project": "HacKU 2026 · Problem Statement 4",
} as const;

export type TranslationKey = keyof typeof english;

export const traditionalChinese: Record<TranslationKey, string> = {
  "app.title": "全屋傢俬配置",
  "app.category": "傢俬配置",
  "app.demo": "預設示範",
  "app.reset": "重設示範",
  "app.language": "語言",
  "app.skip": "跳至所選傢俬",
  "room.scenario": "康和一型第一款 — 2B 參考情境（簡化示範尺寸）",
  "scene.label": "簡化全屋三維模型",
  "scene.loading": "正在載入單位",
  "scene.unavailable": "此裝置無法顯示三維模型。平面圖及數字編輯仍可使用。",
  "scene.caption": "模型按輸入尺寸簡化生成，外觀只供示意。",
  "scene.reset": "重設視角",
  "scene.zoomIn": "放大",
  "scene.zoomOut": "縮小",
  "scene.before": "替換前",
  "scene.after": "替換後",
  "scene.comparison": "配置比較",
  "source.heading": "參考情境及假設",
  "source.assumptions": "此 660 × 640 厘米全屋、五個房間配置及預設 260 厘米樓底高度均為簡化示範假設，並非房屋委員會認證的尺寸。",
  "source.plan": "官方 PDF 是典型整層平面圖，並非附有尺寸的個別單位平面圖。此單位並非精確重建。",
  "source.zones": "門扇開啟預留區是保守的矩形示範限制，並非規例或通用安全標準。窗戶只供示意；未檢查窗台及窗戶淨空。",
  "source.verify": "作出購買決定前，請核實自己單位的尺寸。",
  "source.index": "房屋委員會參考資料",
  "source.pdf": "康和一型官方 PDF",
  "source.limitations": "僅檢查矩形傢俬、牆身、已設定門扇開啟預留區及單位外邊界。窗台及窗戶淨空、送貨路線、固定裝置、踢腳線、管道、不規則形狀及可壓縮傢俬均未建模。此工具並非專業、結構、無障礙或建築規例建議。",
  "footer.privacy": "僅在瀏覽器內計算。不收集照片、不設帳戶或 FitIn 後端。",
  "footer.project": "HacKU 2026 · 問題陳述 4",
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en: english, "zh-Hant": traditionalChinese };

export function translate(language: Language, key: TranslationKey, parameters: Record<string, string | number> = {}): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(parameters[name] ?? placeholder));
}

export function formatCm(value: number, language: Language): string {
  return new Intl.NumberFormat(language === "en" ? "en-HK" : "zh-HK", { maximumFractionDigits: 6 }).format(value);
}