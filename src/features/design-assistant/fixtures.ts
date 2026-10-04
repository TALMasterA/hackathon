import { DEMO_FLAT, SUGGESTED_FURNITURE } from "../../data/flat-preset";
import type { FlatFurniture, LayoutLocks, LayoutSnapshot } from "../../types/domain";
import { getLayoutContext, type LayoutContext } from "./context";

/** Test fixtures: the demo flat with the team's twenty example items, as plain copies. */
export function demoLayout(overrides: Record<string, Partial<FlatFurniture>> = {}): LayoutSnapshot {
  return { ceilingHeight: 260, furniture: SUGGESTED_FURNITURE.map((item) => ({ ...item, name: { ...item.name }, position: { ...item.position }, ...overrides[item.id] })) };
}

export const NO_LOCKS: LayoutLocks = { position: [], distance: [] };

export function livingContext(layout: LayoutSnapshot = demoLayout(), locks: LayoutLocks = NO_LOCKS): LayoutContext {
  return getLayoutContext({ flat: DEMO_FLAT, current: layout, locks }, "living")!;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
