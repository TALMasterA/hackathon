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
  "scene.appearance": "3D furniture appearance",
  "scene.models": "Models",
  "scene.boxes": "Boxes",
  "scene.modelsHint": "Furniture models stretched to each item's checked size (appearance only)",
  "scene.boxesHint": "The exact boxes that every check uses",
  "source.heading": "Scenario & assumptions",
  "source.assumptions": "This 660 × 640 cm whole flat, five-room layout and default 260 cm ceiling height are simplified demo assumptions, not Housing Authority-certified measurements.",
  "source.plan": "The official PDF is a typical full-floor plan with a metric scale bar but no dimension lines, so a flat can be measured from it only approximately (Flat → Read my floor plan). This demo flat is not an exact reconstruction.",
  "source.zones": "Door swing zones are conservative rectangular demo constraints, not regulations or universal safety standards. Windows are visual only; sill and window clearance are not checked.",
  "source.verify": "Verify the dimensions of your own flat before making a purchase decision.",
  "source.index": "Housing Authority reference",
  "source.pdf": "Concord 1 official PDF",
  "source.limitations": "Only rectangular furniture, walls, configured door swing zones and the flat envelope are checked. Window sill/clearance, delivery routes, fixtures, skirting boards, pipes, irregular shapes and compressible furniture are not modelled. This is not professional, structural, accessibility or building-code advice.",
  "source.traced.how": "Traced by you from {file}; scale from {method}; rooms read by {reader}.",
  "source.traced.method.scale-bar": "the plan's scale bar",
  "source.traced.method.known-length": "a length you measured",
  "source.traced.reader.ai": "AI ({model}), snapped to the drawn wall lines and reviewed by you",
  "source.traced.reader.manual": "you",
  "source.traced.unknown": "a flat file",
  "source.traced.unchecked": "{count} room edges could not be matched to a drawn wall line and were kept where you accepted them.",
  "source.traced.caveat": "Accuracy depends on your calibration. Housing Authority plans show a typical floor; individual flats and finishes vary, and plaster or tiles can make clear sizes 1–3 cm smaller per face. Measure at least one room with a tape before buying.",
  "footer.privacy": "Measurements, layout and checks never leave your device. Only a photo you choose to send for an optional 3D look, or the cropped plan of your flat you choose to have read by AI, goes to fal.ai. FitIn stores nothing.",
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
  "scene.appearance": "三維傢俬外觀",
  "scene.models": "模型",
  "scene.boxes": "方塊",
  "scene.modelsHint": "傢俬模型按每件傢俬的檢查尺寸拉伸（只影響外觀）",
  "scene.boxesHint": "所有檢查實際使用的方塊",
  "source.heading": "參考情境及假設",
  "source.assumptions": "此 660 × 640 厘米全屋、五個房間配置及預設 260 厘米樓底高度均為簡化示範假設，並非房屋委員會認證的尺寸。",
  "source.plan": "官方 PDF 是典型整層平面圖，附有公制比例尺但沒有尺寸線，因此只能據此大約量度單位（單位 → 讀取我的平面圖）。此示範單位並非精確重建。",
  "source.zones": "門扇開啟預留區是保守的矩形示範限制，並非規例或通用安全標準。窗戶只供示意；未檢查窗台及窗戶淨空。",
  "source.verify": "作出購買決定前，請核實自己單位的尺寸。",
  "source.index": "房屋委員會參考資料",
  "source.pdf": "康和一型官方 PDF",
  "source.limitations": "僅檢查矩形傢俬、牆身、已設定門扇開啟預留區及單位外邊界。窗台及窗戶淨空、送貨路線、固定裝置、踢腳線、管道、不規則形狀及可壓縮傢俬均未建模。此工具並非專業、結構、無障礙或建築規例建議。",
  "source.traced.how": "由你按 {file} 描畫；比例取自{method}；房間由{reader}讀取。",
  "source.traced.method.scale-bar": "平面圖上的比例尺",
  "source.traced.method.known-length": "你量度的一段長度",
  "source.traced.reader.ai": "AI（{model}）讀取，再對齊圖中牆線並經你檢查",
  "source.traced.reader.manual": "你",
  "source.traced.unknown": "單位檔案",
  "source.traced.unchecked": "有 {count} 條房間邊線未能對齊圖中的牆線，已按你確認的位置保留。",
  "source.traced.caveat": "準確度取決於你的比例校準。房屋委員會平面圖是典型樓層，個別單位及裝修會有差異，批盪或瓷磚可令每邊淨空減少 1–3 厘米。購買前請最少用捲尺量度一個房間。",
  "footer.privacy": "尺寸、配置及檢查結果絕不會離開你的裝置。只有你選擇傳送、用作可選三維外觀的相片，或你選擇交由 AI 讀取的單位裁剪平面圖，才會傳送至 fal.ai。FitIn 不會儲存任何資料。",
  "footer.project": "HacKU 2026 · 問題陳述 4",
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en: english, "zh-Hant": traditionalChinese };

export function translate(language: Language, key: TranslationKey, parameters: Record<string, string | number> = {}): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(parameters[name] ?? placeholder));
}

export function formatCm(value: number, language: Language): string {
  return new Intl.NumberFormat(language === "en" ? "en-HK" : "zh-HK", { maximumFractionDigits: 6 }).format(value);
}