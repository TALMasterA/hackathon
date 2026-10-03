import { DEMO_FLAT, SUGGESTED_FURNITURE } from "./flat-preset";
import { HARMONY_EXAMPLES, HARMONY_FLAT } from "./harmony-preset";

export const FLAT_SCENARIOS = {
  demo: { id: "demo", name: { en: "Current demo", "zh-Hant": "原有示範單位" }, flat: DEMO_FLAT, examples: SUGGESTED_FURNITURE, defaultRoomId: "living" },
  harmony: { id: "harmony", name: { en: "Harmony 1 Option 4 (PDF-derived)", "zh-Hant": "和諧一型方案四（PDF 描繪）" }, flat: HARMONY_FLAT, examples: HARMONY_EXAMPLES, defaultRoomId: "central" },
} as const;

export type ScenarioId = keyof typeof FLAT_SCENARIOS;

export function examplesForFlat(flatId: string) {
  return Object.values(FLAT_SCENARIOS).find((scenario) => scenario.flat.id === flatId)?.examples ?? [];
}