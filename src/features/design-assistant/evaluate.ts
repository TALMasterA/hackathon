import { containingRoom } from "../../lib/geometry/architecture";
import { GEOMETRY_EPSILON_CM } from "../../lib/geometry/footprint";
import { analyzeLayout, issueItemIds } from "../../lib/geometry/layout";
import { distanceLockViolations } from "../../lib/geometry/locks";
import { clipPolygon, normalizeAngle, polygonArea, polygonBounds, polygonDistance, rectanglePolygon } from "../../lib/geometry/oriented";
import type { Flat, FlatFurniture, LayoutLocks, Position2D } from "../../types/domain";
import { insideRoom, outsideRoomArea, zonePolygon, type RoomShape } from "./context";
import { angleDifference, ANGLE_TOLERANCE_DEG, isGoal, preferenceKey } from "./preferences";
import type { GoalOutcome, ItemChangeRecord, Metric, Preference, ValidationIssue, ValidationReport, ZoneRef } from "./types";

/** Moves and turns smaller than these are rounding, not a change. */
export const CHANGE_TOLERANCE = { cm: 0.5, deg: 0.5 } as const;
/** A zone with at most this much furniture in it counts as clear. */
export const ZONE_CLEAR_M2 = 0.005;
/** A zone counts as improved (or worse) by 0.05 m² or 25% of what was in it, whichever is less, but at least 0.01 m². */
export const ZONE_THRESHOLD = { absoluteM2: 0.05, relative: 0.25, floorM2: 0.01 } as const;
/** A pair distance counts as changed by 10 cm or more; "closer" is met when the items touch (within 1 cm). */
export const PAIR_THRESHOLD_CM = 10;
export const PAIR_MET_CM = 1;

export interface EvaluationScope {
  flat: Flat;
  shape: RoomShape;
  roomItemIds: readonly string[];
}

export interface GoalResult {
  key: string;
  preference: Extract<Preference, { type: "open-zone" | "pair" }>;
  metric: Metric;
  /** Share of the possible improvement, from -1 to 1; used only to rank candidates. */
  gain: number;
}

export interface Evaluation {
  changes: ItemChangeRecord[];
  metrics: Metric[];
  goals: GoalResult[];
  improved: number;
  worsened: number;
  /** Size of the change: items changed, plus metres moved, plus half a point per quarter turn. */
  cost: number;
}

const byId = (furniture: readonly FlatFurniture[]) => new Map(furniture.map((item) => [item.id, item]));

/** Items whose pose differs from the baseline, with how far each moved and turned. */
export function poseChanges(baseline: readonly FlatFurniture[], candidate: readonly FlatFurniture[]): ItemChangeRecord[] {
  const before = byId(baseline);
  return candidate.flatMap((item) => {
    const previous = before.get(item.id);
    if (!previous) return [];
    const displacement = Math.hypot(item.position.x - previous.position.x, item.position.z - previous.position.z);
    const rotation = angleDifference(item.orientation, previous.orientation);
    if (displacement <= CHANGE_TOLERANCE.cm && rotation <= CHANGE_TOLERANCE.deg) return [];
    return [{ id: item.id, from: { position: { ...previous.position }, orientation: previous.orientation }, to: { position: { ...item.position }, orientation: normalizeAngle(item.orientation) }, displacement, rotation }];
  });
}

function convexOverlapArea(first: readonly Position2D[], second: readonly Position2D[]): number {
  const a = polygonBounds(first);
  const b = polygonBounds(second);
  if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ) return 0;
  return polygonArea(clipPolygon(first, second));
}

/**
 * Furniture in a zone, in m²: the room's other items' overlap with it, plus (for a zone in front of an
 * item) the part of the zone outside the room, since a wall there blocks the space just as well.
 */
export function zoneBlockedArea(scope: EvaluationScope, zone: ZoneRef, furniture: readonly FlatFurniture[]): number | null {
  const polygon = zonePolygon(scope.flat, scope.shape, zone, furniture);
  if (!polygon) return null;
  let area = 0;
  for (const item of furniture) {
    if (!scope.roomItemIds.includes(item.id) || (zone.kind === "item-front" && zone.itemId === item.id)) continue;
    area += convexOverlapArea(rectanglePolygon(item), polygon);
  }
  if (zone.kind === "item-front") area += outsideRoomArea(scope.shape, polygon);
  return area / 10000;
}

/** One item's own overlap with a zone, in m². */
export function itemZoneOverlap(scope: EvaluationScope, zone: ZoneRef, furniture: readonly FlatFurniture[], itemId: string): number {
  const polygon = zonePolygon(scope.flat, scope.shape, zone, furniture);
  const item = furniture.find((entry) => entry.id === itemId);
  return polygon && item ? convexOverlapArea(rectanglePolygon(item), polygon) / 10000 : 0;
}

export function pairDistance(furniture: readonly FlatFurniture[], firstId: string, secondId: string): number | null {
  const first = furniture.find((item) => item.id === firstId);
  const second = furniture.find((item) => item.id === secondId);
  return first && second ? polygonDistance(rectanglePolygon(first), rectanglePolygon(second)) : null;
}

export const zoneThreshold = (before: number) => Math.max(ZONE_THRESHOLD.floorM2, Math.min(ZONE_THRESHOLD.absoluteM2, ZONE_THRESHOLD.relative * before));

function zoneOutcome(before: number, after: number): GoalOutcome {
  const threshold = zoneThreshold(before);
  if (before <= ZONE_CLEAR_M2) return after - before >= threshold ? "worsened" : "already-met";
  if (after <= ZONE_CLEAR_M2) return "met";
  if (before - after >= threshold) return "improved";
  return after - before >= threshold ? "worsened" : "unchanged";
}

function pairOutcome(direction: "closer" | "farther", before: number, after: number): GoalOutcome {
  const change = direction === "closer" ? before - after : after - before;
  if (direction === "closer") {
    if (before <= PAIR_MET_CM) return change <= -PAIR_THRESHOLD_CM ? "worsened" : "already-met";
    if (after <= PAIR_MET_CM) return "met";
  }
  if (change >= PAIR_THRESHOLD_CM) return "improved";
  return change <= -PAIR_THRESHOLD_CM ? "worsened" : "unchanged";
}

export const isImproved = (outcome: GoalOutcome | undefined) => outcome === "improved" || outcome === "met";

/** True when a moved item lands in an avoided region or faces an avoided direction. */
export function hitsAvoided(preferences: readonly Preference[], item: Pick<FlatFurniture, "id" | "position" | "orientation">): boolean {
  return preferences.some((preference) => {
    if (preference.type === "avoid-position" && preference.itemId === item.id) return Math.hypot(item.position.x - preference.centre.x, item.position.z - preference.centre.z) <= preference.radius;
    if (preference.type === "avoid-orientation" && preference.itemId === item.id) return angleDifference(item.orientation, preference.angle) < ANGLE_TOLERANCE_DEG;
    return false;
  });
}

/**
 * evaluatePreferences: only measurable, implemented objectives. Changed items, distance moved and
 * turning; furniture in each open zone; each pair's edge-to-edge distance; avoided spots hit. Each goal
 * metric has its before and after values and whether it improved, by the thresholds above.
 */
export function evaluatePreferences(scope: EvaluationScope, baseline: readonly FlatFurniture[], candidate: readonly FlatFurniture[], preferences: readonly Preference[]): Evaluation {
  const changes = poseChanges(baseline, candidate);
  const displacement = changes.reduce((sum, change) => sum + change.displacement, 0);
  const rotation = changes.reduce((sum, change) => sum + change.rotation, 0);
  const metrics: Metric[] = [
    { kind: "changed-count", unit: "count", before: 0, after: changes.length },
    { kind: "displacement", unit: "cm", before: 0, after: displacement },
    { kind: "rotation", unit: "deg", before: 0, after: rotation },
  ];
  const goals: GoalResult[] = [];
  for (const preference of preferences) {
    if (!isGoal(preference)) continue;
    const key = preferenceKey(preference);
    if (preference.type === "open-zone") {
      const before = zoneBlockedArea(scope, preference.zone, baseline);
      const after = zoneBlockedArea(scope, preference.zone, candidate);
      if (before === null || after === null) continue;
      const outcome = zoneOutcome(before, after);
      const metric: Metric = { kind: "zone", key, unit: "m2", before, after, outcome };
      metrics.push(metric);
      goals.push({ key, preference, metric, gain: before > 0 ? Math.max(-1, Math.min(1, (before - after) / before)) : after > 0 ? -1 : 0 });
    } else if (preference.type === "pair") {
      const before = pairDistance(baseline, preference.firstId, preference.secondId);
      const after = pairDistance(candidate, preference.firstId, preference.secondId);
      if (before === null || after === null) continue;
      const outcome = pairOutcome(preference.direction, before, after);
      const metric: Metric = { kind: "pair", key, unit: "cm", before, after, outcome };
      metrics.push(metric);
      const gain = preference.direction === "closer" ? (before - after) / Math.max(before, PAIR_MET_CM) : (after - before) / Math.max(before, 50);
      goals.push({ key, preference, metric, gain: Math.max(-1, Math.min(1, gain)) });
    }
  }
  if (preferences.some((preference) => preference.type === "avoid-position" || preference.type === "avoid-orientation")) {
    const moved = candidate.filter((item) => changes.some((change) => change.id === item.id));
    metrics.push({ kind: "avoided", unit: "count", before: 0, after: moved.filter((item) => hitsAvoided(preferences, item)).length });
  }
  return {
    changes,
    metrics,
    goals,
    improved: goals.filter((goal) => isImproved(goal.metric.outcome)).length,
    worsened: goals.filter((goal) => goal.metric.outcome === "worsened").length,
    cost: changes.length + displacement / 100 + rotation / 90 * 0.5,
  };
}

/**
 * validateLayout: the existing layout checks and locks applied to a candidate, as structured issues.
 * Warnings caused by changed items, broken locks, items kept in place that changed, changed items
 * leaving their room, and lost or resized items make it infeasible; warnings among unchanged items
 * were already there and are disclosed separately.
 */
export function validateLayout(input: { flat: Flat; shape: RoomShape; ceilingHeight: number; baseline: readonly FlatFurniture[]; candidate: readonly FlatFurniture[]; locks: LayoutLocks; preferences: readonly Preference[] }): ValidationReport {
  const { flat, shape, baseline, candidate, locks } = input;
  const changes = poseChanges(baseline, candidate);
  const changed = new Set(changes.map((change) => change.id));
  const issues: ValidationIssue[] = [];
  const before = byId(baseline);
  for (const item of candidate) {
    const previous = before.get(item.id);
    if (!previous || previous.width !== item.width || previous.depth !== item.depth || previous.height !== item.height || previous.kind !== item.kind || previous.roomId !== item.roomId) issues.push({ code: "missing", itemId: item.id });
  }
  for (const item of baseline) if (!candidate.some((entry) => entry.id === item.id)) issues.push({ code: "missing", itemId: item.id });
  const violations = analyzeLayout({ ...flat, height: input.ceilingHeight }, candidate, input.ceilingHeight);
  const preExisting = violations.filter((violation) => !issueItemIds(violation).some((id) => changed.has(id)));
  for (const violation of violations) {
    const itemId = issueItemIds(violation).find((id) => changed.has(id));
    if (itemId) issues.push({ code: "layout", itemId, violation });
  }
  for (const change of changes) {
    if (locks.position.includes(change.id) && change.displacement > GEOMETRY_EPSILON_CM) issues.push({ code: "lock", itemId: change.id, violation: { code: "lock.position", lockId: `position-${change.id}`, itemId: change.id, displacement: change.displacement } });
    const item = candidate.find((entry) => entry.id === change.id)!;
    if (!insideRoom(shape, rectanglePolygon(item), item) || containingRoom(flat, item.position)?.id !== shape.room.id) issues.push({ code: "room", itemId: change.id });
  }
  const related = locks.distance.filter((lock) => changed.has(lock.firstId) || changed.has(lock.secondId));
  for (const violation of related.length > 0 ? distanceLockViolations(candidate, related) : []) {
    if (violation.code === "lock.distance") issues.push({ code: "lock", itemId: changed.has(violation.firstId) ? violation.firstId : violation.secondId, violation });
  }
  let keptItems = 0;
  for (const preference of input.preferences) {
    if (preference.type !== "keep-in-place") continue;
    const item = candidate.find((entry) => entry.id === preference.itemId);
    const previous = before.get(preference.itemId);
    if (!item || !previous) continue;
    keptItems++;
    const target = preference.pose ?? { position: previous.position, orientation: previous.orientation };
    const moved = Math.hypot(item.position.x - target.position.x, item.position.z - target.position.z) > CHANGE_TOLERANCE.cm;
    const turned = angleDifference(item.orientation, target.orientation) > CHANGE_TOLERANCE.deg;
    if (moved || (turned && !(preference.allowRotation && !preference.pose))) issues.push({ code: "keep", itemId: item.id });
  }
  const roomIds = new Set(candidate.filter((item) => item.roomId === shape.room.id).map((item) => item.id));
  return {
    feasible: issues.length === 0,
    issues,
    preExisting,
    checkedLocks: { position: locks.position.filter((id) => roomIds.has(id)).length, distance: locks.distance.filter((lock) => roomIds.has(lock.firstId) || roomIds.has(lock.secondId)).length },
    keptItems,
  };
}
