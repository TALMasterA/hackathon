import { polygonDistance, polygonOverlap, rectanglePolygon } from "../../lib/geometry/oriented";
import type { FlatFurniture, LayoutLocks } from "../../types/domain";
import { zonePolygon, type LayoutContext } from "./context";
import type { Conflict, InterpretationWarning, Pose, Preference, PreferenceEntry, PreferenceSource } from "./types";

/** Orientations closer than this count as the same direction, for avoided orientations and repeats. */
export const ANGLE_TOLERANCE_DEG = 10;
/** A pair distance this close to a distance lock's minimum cannot get any shorter. */
export const LOCK_SLACK_CM = 1;

export const angleDifference = (first: number, second: number) => {
  const difference = Math.abs((((first - second) % 360) + 360) % 360);
  return Math.min(difference, 360 - difference);
};

/** Preferences with the same key are about the same thing; the newer one replaces the older one. */
export function preferenceKey(preference: Preference): string {
  switch (preference.type) {
    case "keep-in-place":
      return `keep:${preference.itemId}`;
    case "minimise-changes":
      return "change-little";
    case "open-zone":
      return `zone:${preference.zone.kind}:${preference.zone.kind === "door" ? preference.zone.doorId : preference.zone.itemId}`;
    case "pair":
      return `pair:${[preference.firstId, preference.secondId].sort().join("+")}`;
    case "avoid-position":
      return `avoid-position:${preference.itemId}:${Math.round(preference.centre.x)}:${Math.round(preference.centre.z)}`;
    case "avoid-orientation":
      return `avoid-orientation:${preference.itemId}:${Math.round(preference.angle)}`;
  }
}

export function entry(preference: Preference, source: PreferenceSource, round: number): PreferenceEntry {
  return { key: preferenceKey(preference), preference, source, round };
}

/** Item ids a preference refers to. */
export function preferenceItems(preference: Preference): string[] {
  switch (preference.type) {
    case "keep-in-place":
    case "avoid-position":
    case "avoid-orientation":
      return [preference.itemId];
    case "pair":
      return [preference.firstId, preference.secondId];
    case "open-zone":
      return preference.zone.kind === "item-front" ? [preference.zone.itemId] : [];
    case "minimise-changes":
      return [];
  }
}

export const isGoal = (preference: Preference) => preference.type === "open-zone" || preference.type === "pair";

/**
 * recordRejectionFeedback's merge: entries with a removed key go, then each added entry replaces an
 * earlier one with the same key. A change limit only ever gets stricter by merging.
 */
export function mergePreferences(existing: readonly PreferenceEntry[], added: readonly PreferenceEntry[], removedKeys: readonly string[] = []): PreferenceEntry[] {
  let result = existing.filter((item) => !removedKeys.includes(item.key));
  for (const next of added) {
    const previous = result.find((item) => item.key === next.key);
    let merged = next;
    if (previous && previous.preference.type === "minimise-changes" && next.preference.type === "minimise-changes") {
      const limits = [previous.preference.maxChangedItems, next.preference.maxChangedItems].filter((value): value is number => value !== undefined);
      merged = { ...next, preference: { type: "minimise-changes", ...(limits.length > 0 ? { maxChangedItems: Math.min(...limits) } : {}) } };
    }
    result = previous ? result.map((item) => item.key === next.key ? merged : item) : [...result, merged];
  }
  return result;
}

const samePose = (first: Pose | undefined, second: Pose | undefined) => first === second || (first !== undefined && second !== undefined && Math.hypot(first.position.x - second.position.x, first.position.z - second.position.z) < 1 && angleDifference(first.orientation, second.orientation) < 1);

function keptPose(preference: Extract<Preference, { type: "keep-in-place" }>, furniture: readonly FlatFurniture[]): Pose | null {
  if (preference.pose) return preference.pose;
  const item = furniture.find((entry) => entry.id === preference.itemId);
  return item ? { position: item.position, orientation: item.orientation } : null;
}

/**
 * Contradictions in a list of preferences: closer and farther for the same pair, two different poses
 * kept for one item, an item kept where it is avoided, and "closer" for a pair whose distance lock
 * already holds them at its minimum. None is resolved here.
 */
export function detectConflicts(list: readonly Preference[], baseline: readonly FlatFurniture[], locks: LayoutLocks): Conflict[] {
  const conflicts: Conflict[] = [];
  list.forEach((first, i) => {
    if (first.type === "pair" && first.direction === "closer") {
      const lock = locks.distance.find((entry) => [entry.firstId, entry.secondId].sort().join("+") === [first.firstId, first.secondId].sort().join("+"));
      const a = baseline.find((item) => item.id === first.firstId);
      const b = baseline.find((item) => item.id === first.secondId);
      if (lock && a && b) {
        const actual = polygonDistance(rectanglePolygon(a), rectanglePolygon(b));
        if (actual <= lock.minimum + LOCK_SLACK_CM) conflicts.push({ code: "closer-vs-lock", indices: [i], itemIds: [a.id, b.id], lock: { id: lock.id, minimum: lock.minimum, actual } });
      }
    }
    list.forEach((second, j) => {
      if (j <= i) return;
      if (first.type === "pair" && second.type === "pair" && preferenceKey(first) === preferenceKey(second) && first.direction !== second.direction) {
        conflicts.push({ code: "pair-direction", indices: [i, j], itemIds: [first.firstId, first.secondId] });
      }
      if (first.type === "keep-in-place" && second.type === "keep-in-place" && first.itemId === second.itemId && !samePose(first.pose, second.pose)) {
        conflicts.push({ code: "keep-pose", indices: [i, j], itemIds: [first.itemId] });
      }
      const [keep, avoid, keepIndex, avoidIndex] = first.type === "keep-in-place" ? [first, second, i, j] : second.type === "keep-in-place" ? [second, first, j, i] : [null, null, -1, -1];
      if (keep?.type !== "keep-in-place" || !avoid || (avoid.type !== "avoid-position" && avoid.type !== "avoid-orientation") || avoid.itemId !== keep.itemId) return;
      const pose = keptPose(keep, baseline);
      if (!pose) return;
      const clash = avoid.type === "avoid-position"
        ? Math.hypot(pose.position.x - avoid.centre.x, pose.position.z - avoid.centre.z) <= avoid.radius
        : !keep.allowRotation && angleDifference(pose.orientation, avoid.angle) < ANGLE_TOLERANCE_DEG;
      if (clash) conflicts.push({ code: "keep-vs-avoid", indices: [keepIndex, avoidIndex].sort((x, y) => x - y), itemIds: [keep.itemId] });
    });
  });
  return conflicts;
}

/** Limits worth showing before a search: a zone blocked by an item that may not move, or a pair that cannot change. */
export function detectWarnings(list: readonly Preference[], context: LayoutContext): InterpretationWarning[] {
  const kept = new Set(list.flatMap((preference) => preference.type === "keep-in-place" && !preference.pose ? [preference.itemId] : []));
  const locked = new Set(context.rotationOnly);
  const fixed = (id: string) => kept.has(id) || locked.has(id) || !context.roomItems.some((item) => item.id === id);
  const warnings: InterpretationWarning[] = [];
  for (const preference of list) {
    if (preference.type === "open-zone") {
      const polygon = zonePolygon(context.flat, context.shape, preference.zone, context.furniture);
      if (!polygon) continue;
      for (const item of context.roomItems) {
        if (preference.zone.kind === "item-front" && preference.zone.itemId === item.id) continue;
        if ((kept.has(item.id) || locked.has(item.id)) && polygonOverlap(rectanglePolygon(item), polygon)) warnings.push({ code: "zone-blocked-by-fixed", itemIds: [item.id], reason: kept.has(item.id) ? "kept" : "locked" });
      }
    }
    if (preference.type === "pair" && fixed(preference.firstId) && fixed(preference.secondId)) warnings.push({ code: "pair-fixed", itemIds: [preference.firstId, preference.secondId] });
  }
  return warnings;
}
