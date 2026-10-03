import type { Flat, FlatFurniture } from "../types/domain";
import { DEMO_FLAT, SUGGESTED_FURNITURE } from "./flat-preset";
import { HARMONY_EXAMPLES, HARMONY_FLAT } from "./harmony-preset";

export const FLAT_SCENARIOS = {
  demo: { id: "demo", name: { en: "Current demo", "zh-Hant": "原有示範單位" }, flat: DEMO_FLAT, examples: SUGGESTED_FURNITURE },
  harmony: { id: "harmony", name: { en: "Harmony 1 Option 4 (PDF-derived)", "zh-Hant": "和諧一型方案四（PDF 描繪）" }, flat: HARMONY_FLAT, examples: HARMONY_EXAMPLES },
} as const;

export type ScenarioId = keyof typeof FLAT_SCENARIOS;

/**
 * The team's prepared placements for a built-in flat, or undefined for any other flat. The source is
 * matched too, so a traced or opened flat that reuses a built-in id never gets that flat's examples.
 */
export function examplesForFlat(flat: Pick<Flat, "id" | "dimensionSource">): readonly FlatFurniture[] | undefined {
  return Object.values(FLAT_SCENARIOS).find((scenario) => scenario.flat.id === flat.id && scenario.flat.dimensionSource === flat.dimensionSource)?.examples;
}
