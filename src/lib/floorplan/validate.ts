import { wallPolygon } from "../geometry/architecture";
import { polygonArea, polygonBounds, rectanglePolygon } from "../geometry/oriented";
import { isSimplePolygon, overlapOf } from "../geometry/polygon";
import type { Door, FlatRoom, Wall } from "../../types/domain";
import type { OpeningProblem } from "./attach";
import { FLAT_MAX_SIZE_CM } from "./flat-file";
import { EXPECTED_BEDROOMS, roomBounds, type FlatType, type TracePlan } from "./trace";
import { facingEdges, frameEdges, OPEN_GAP_CM } from "./walls";

export type TraceIssueCode =
  | "no-rooms" | "room-shape" | "rooms-overlap" | "room-too-narrow" | "too-large" | "door-off-wall" | "door-too-wide" | "door-nowhere" | "no-entrance" | "many-entrances" | "inconsistent"
  | "unreachable" | "unchecked-edges" | "bedroom-count" | "area-mismatch" | "window-off-wall";

const ERRORS: ReadonlySet<TraceIssueCode> = new Set(["no-rooms", "room-shape", "rooms-overlap", "room-too-narrow", "too-large", "door-off-wall", "door-too-wide", "door-nowhere", "no-entrance", "many-entrances", "inconsistent"]);

export interface TraceIssue {
  code: TraceIssueCode;
  severity: "error" | "warning";
  /** Trace IDs of the rooms, doors or windows involved, for highlighting. */
  ids: string[];
  count?: number;
  expected?: number;
  actual?: number;
  percent?: number;
  detail?: string;
}

export function traceIssue(code: TraceIssueCode, ids: string[] = [], extra: Partial<TraceIssue> = {}): TraceIssue {
  return { code, severity: ERRORS.has(code) ? "error" : "warning", ids, ...extra };
}

/** Rooms narrower than this are tracing slips, not usable space. */
export const MIN_ROOM_CM = 40;
/** Rooms smaller than a 40 cm square are slips too, whatever their shape. */
const MIN_ROOM_AREA_CM2 = MIN_ROOM_CM * MIN_ROOM_CM;
/** Rooms overlapping by more than this (mean thickness of the shared floor) overlap; less is rounding along a shared edge. */
const OVERLAP_TOLERANCE_CM = 0.5;
export const AREA_TOLERANCE = 0.05;

export interface ValidationInput {
  plan: TracePlan;
  /** Flat rooms in plan order, i.e. rooms[i] was built from plan.rooms[i]. */
  rooms: readonly FlatRoom[];
  walls: readonly Wall[];
  doors: readonly Door[];
  problems: readonly OpeningProblem[];
  flatType?: FlatType | null;
  declaredAreaM2?: number | null;
}

export const roomPolygon = (room: FlatRoom) => room.outline ?? rectanglePolygon(room);

/**
 * Internal floor area as the Housing Authority measures it: to the inner faces of the enclosing
 * walls, so partitions inside the flat count but outer walls do not.
 */
export function internalAreaM2(rooms: readonly FlatRoom[], walls: readonly Wall[]): number {
  const roomArea = rooms.reduce((sum, room) => sum + polygonArea(roomPolygon(room)), 0);
  const partitionArea = walls.filter((wall) => !wall.outer).reduce((sum, wall) => sum + Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) * wall.thickness, 0);
  return (roomArea + partitionArea) / 10_000;
}

const boxesOverlap = (first: ReturnType<typeof roomBounds>, second: ReturnType<typeof roomBounds>) => first.minX < second.maxX && second.minX < first.maxX && first.minZ < second.maxZ && second.minZ < first.maxZ;

/** Errors block "Use this flat"; warnings are shown but do not. */
export function validateTrace(input: ValidationInput): TraceIssue[] {
  const { plan, rooms, walls, doors } = input;
  const issues: TraceIssue[] = [];
  if (plan.rooms.length === 0) return [traceIssue("no-rooms")];
  const traceId = new Map(rooms.map((room, index) => [room.id, plan.rooms[index].id]));

  const simple = new Set(plan.rooms.filter((room) => isSimplePolygon(room.points)).map((room) => room.id));
  plan.rooms.forEach((room, index) => {
    if (!simple.has(room.id)) {
      issues.push(traceIssue("room-shape", [room.id]));
      return;
    }
    const bounds = roomBounds(room);
    if (Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) < MIN_ROOM_CM || polygonArea(room.points) < MIN_ROOM_AREA_CM2) issues.push(traceIssue("room-too-narrow", [room.id]));
    for (const other of plan.rooms.slice(index + 1)) {
      if (!simple.has(other.id) || !boxesOverlap(bounds, roomBounds(other))) continue;
      const overlap = overlapOf(room.points, other.points);
      if (overlap.area > OVERLAP_TOLERANCE_CM * overlap.length + 1e-6) issues.push(traceIssue("rooms-overlap", [room.id, other.id]));
    }
  });

  const extents = [...plan.rooms.flatMap((room) => room.points), ...walls.flatMap(wallPolygon)];
  const bounds = polygonBounds(extents);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width > FLAT_MAX_SIZE_CM || depth > FLAT_MAX_SIZE_CM) issues.push(traceIssue("too-large", [], { actual: Math.round(Math.max(width, depth)) }));

  for (const problem of input.problems) issues.push(traceIssue(problem.code, [problem.id]));
  const entrances = doors.filter((door) => door.connects.includes("outside"));
  if (entrances.length === 0) issues.push(traceIssue("no-entrance"));
  if (entrances.length > 1) issues.push(traceIssue("many-entrances", entrances.map((door) => door.id)));

  if (entrances.length > 0) {
    const links = new Map<string, Set<string>>();
    const link = (first: string, second: string) => {
      links.set(first, (links.get(first) ?? new Set()).add(second));
      links.set(second, (links.get(second) ?? new Set()).add(first));
    };
    // One graph in trace IDs: doors name flat rooms, so translate them back.
    const toTrace = (id: string) => traceId.get(id) ?? id;
    for (const door of doors) link(toTrace(door.connects[0]), toTrace(door.connects[1]));
    for (const [first, second] of plan.openPairs) link(first, second);
    // Rooms whose faces (nearly) touch, at any angle, are one space.
    const all = frameEdges(plan.rooms);
    for (const edge of all) {
      for (const facing of facingEdges(edge, all, OPEN_GAP_CM)) if (facing.gap < OPEN_GAP_CM) link(edge.room.id, facing.other.room.id);
    }
    const reached = new Set<string>(["outside"]);
    const queue = ["outside"];
    while (queue.length > 0) {
      for (const next of links.get(queue.shift()!) ?? []) if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
    const unreachable = plan.rooms.filter((room) => !reached.has(room.id)).map((room) => room.id);
    if (unreachable.length > 0) issues.push(traceIssue("unreachable", unreachable));
  }

  const unchecked = plan.rooms.flatMap((room) => room.edges.filter((edge) => edge.status === "unverified").map(() => room.id));
  if (unchecked.length > 0) issues.push(traceIssue("unchecked-edges", [...new Set(unchecked)], { count: unchecked.length }));

  if (input.flatType) {
    const bedrooms = plan.rooms.filter((room) => room.kind === "bedroom").length;
    if (bedrooms !== EXPECTED_BEDROOMS[input.flatType]) issues.push(traceIssue("bedroom-count", [], { expected: EXPECTED_BEDROOMS[input.flatType], actual: bedrooms }));
  }
  if (input.declaredAreaM2 && input.declaredAreaM2 > 0) {
    const area = internalAreaM2(rooms, walls);
    const difference = (area - input.declaredAreaM2) / input.declaredAreaM2;
    if (Math.abs(difference) > AREA_TOLERANCE) issues.push(traceIssue("area-mismatch", [], { actual: Math.round(area * 10) / 10, expected: input.declaredAreaM2, percent: Math.round(difference * 1000) / 10 }));
  }
  return issues;
}
