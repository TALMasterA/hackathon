import { WALL_GAP_MAX_CM, type Box } from "../geometry/architecture";
import type { Wall } from "../../types/domain";
import { wallName } from "./names";
import { roundFace, type EdgeSide, type TraceEdge } from "./trace";

/** Facing faces closer than this have no wall between them: the rooms are one open space. */
export const OPEN_GAP_CM = 5;
export const DEFAULT_OUTER_THICKNESS_CM = 20;
const MIN_OVERLAP_CM = 1;
const CORNER_TOLERANCE_CM = 2;
const MIN_WALL_CM = 5;
const SPAN_EPSILON_CM = 1e-9;

export interface WallRoom {
  id: string;
  box: Box;
  edges?: Partial<Record<EdgeSide, TraceEdge>>;
}

export interface WallOptions {
  /** Room pairs joined without a wall, e.g. an L-shaped living room traced as two rectangles. */
  openPairs?: readonly (readonly [string, string])[];
  /** Outer-wall thickness when nothing was measured; the median measured outer wall wins over it. */
  defaultOuter?: number;
}

type Axis = "x" | "z";

interface Edge {
  room: WallRoom;
  index: number;
  side: EdgeSide;
  /** The axis the edge (and any wall built on it) runs along. */
  axis: Axis;
  face: number;
  from: number;
  to: number;
  /** +1 when the room lies on the lower side of the face (bottom and right edges). */
  outward: 1 | -1;
}

interface Piece {
  axis: Axis;
  centre: number;
  from: number;
  to: number;
  thickness: number;
  outer: boolean;
}

function roomEdges(room: WallRoom, index: number): Edge[] {
  const { minX, maxX, minZ, maxZ } = room.box;
  return [
    { room, index, side: "top", axis: "x", face: minZ, from: minX, to: maxX, outward: -1 },
    { room, index, side: "bottom", axis: "x", face: maxZ, from: minX, to: maxX, outward: 1 },
    { room, index, side: "left", axis: "z", face: minX, from: minZ, to: maxZ, outward: -1 },
    { room, index, side: "right", axis: "z", face: maxX, from: minZ, to: maxZ, outward: 1 },
  ];
}

const gapBetween = (edge: Edge, other: Edge) => edge.outward === 1 ? other.face - edge.face : edge.face - other.face;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Splits an edge into stretches, each facing its nearest room across a wall-sized gap, or nothing. */
function edgeSegments(edge: Edge, all: readonly Edge[]) {
  const partners = all.filter((other) => other.axis === edge.axis && other.outward === -edge.outward && other.room !== edge.room)
    .map((other) => ({ other, gap: gapBetween(edge, other), from: Math.max(edge.from, other.from), to: Math.min(edge.to, other.to) }))
    .filter((entry) => entry.gap >= 0 && entry.gap <= WALL_GAP_MAX_CM && entry.to - entry.from > MIN_OVERLAP_CM);
  const cuts = [...new Set([edge.from, edge.to, ...partners.flatMap((entry) => [entry.from, entry.to])])].sort((first, second) => first - second);
  const segments: { from: number; to: number; partner: (typeof partners)[number] | null }[] = [];
  for (let index = 0; index < cuts.length - 1; index++) {
    const [from, to] = [cuts[index], cuts[index + 1]];
    if (to - from <= SPAN_EPSILON_CM) continue;
    const covering = partners.filter((entry) => entry.from <= from && entry.to >= to).sort((first, second) => first.gap - second.gap || first.other.index - second.other.index);
    segments.push({ from, to, partner: covering[0] ?? null });
  }
  return segments;
}

/**
 * Generates wall centre lines from room rectangles traced on the walls' inner faces.
 *
 * Facing edges up to 35 cm apart share one partition wall centred in the gap, as thick as the gap
 * (under 5 cm, or an open pair, they share no wall). The rest of each edge is an outer wall of its
 * measured thickness. Collinear pieces up to 35 cm apart are joined across junctions with
 * perpendicular walls, and outer walls are extended over the corners they meet.
 */
export function wallsFromRooms(rooms: readonly WallRoom[], options: WallOptions = {}): Wall[] {
  const all = rooms.flatMap(roomEdges);
  const open = new Set((options.openPairs ?? []).flatMap(([first, second]) => [`${first}|${second}`, `${second}|${first}`]));
  const isOpen = (edge: Edge, other: Edge) => open.has(`${edge.room.id}|${other.room.id}`) || edge.room.edges?.[edge.side]?.status === "open" || other.room.edges?.[other.side]?.status === "open";
  const segmented = all.map((edge) => ({ edge, segments: edgeSegments(edge, all) }));

  const measured = (edge: Edge) => {
    const info = edge.room.edges?.[edge.side];
    return info?.status === "verified" && info.thickness !== undefined ? roundFace(info.thickness) : null;
  };
  const outerMeasured = segmented.filter(({ segments }) => segments.some((segment) => !segment.partner)).map(({ edge }) => measured(edge)).filter((value): value is number => value !== null);
  const fallbackOuter = roundFace(median(outerMeasured) ?? options.defaultOuter ?? DEFAULT_OUTER_THICKNESS_CM);

  const pieces: Piece[] = [];
  for (const { edge, segments } of segmented) {
    const outerThickness = measured(edge) ?? fallbackOuter;
    let previousWall: Piece | null = null;
    segments.forEach((segment, index) => {
      if (segment.partner) {
        previousWall = null;
        // Each shared wall is emitted once, from the bottom or right edge of the pair.
        if (edge.outward !== 1 || segment.partner.gap < OPEN_GAP_CM || isOpen(edge, segment.partner.other)) return;
        const wall: Piece = { axis: edge.axis, centre: edge.face + segment.partner.gap / 2, from: segment.from, to: segment.to, thickness: segment.partner.gap, outer: false };
        pieces.push(wall);
        previousWall = wall;
        return;
      }
      const before = segments[index - 1]?.partner;
      const after = segments[index + 1]?.partner;
      // A short stretch between two shared walls is where a perpendicular wall meets them, not the outside.
      if (before && after && segment.to - segment.from <= WALL_GAP_MAX_CM) {
        const fill: Piece | null = previousWall;
        if (fill) pieces.push({ ...fill, from: segment.from, to: segment.to });
        return;
      }
      previousWall = null;
      pieces.push({ axis: edge.axis, centre: edge.face + edge.outward * outerThickness / 2, from: segment.from, to: segment.to, thickness: outerThickness, outer: true });
    });
  }

  const joined = joinCollinear(pieces);
  extendOuterCorners(joined);
  const walls = joined.filter((piece) => piece.to - piece.from >= MIN_WALL_CM)
    .sort((first, second) => Number(second.outer) - Number(first.outer) || first.axis.localeCompare(second.axis) || first.centre - second.centre || first.from - second.from);
  const counters = { outer: 0, inner: 0 };
  return walls.map((piece) => {
    const number = piece.outer ? ++counters.outer : ++counters.inner;
    return {
      id: piece.outer ? `outer-wall-${number}` : `partition-${number}`,
      name: wallName(piece.outer, number),
      start: piece.axis === "x" ? { x: piece.from, z: piece.centre } : { x: piece.centre, z: piece.from },
      end: piece.axis === "x" ? { x: piece.to, z: piece.centre } : { x: piece.centre, z: piece.to },
      thickness: piece.thickness,
      outer: piece.outer,
    };
  });
}

/** Joins pieces on the same centre line with the same thickness and kind when they overlap or nearly touch. */
function joinCollinear(pieces: readonly Piece[]): Piece[] {
  const groups = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const key = `${piece.axis}|${piece.centre}|${piece.thickness}|${piece.outer}`;
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }
  const joined: Piece[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((first, second) => first.from - second.from);
    let current = { ...sorted[0] };
    for (const piece of sorted.slice(1)) {
      if (piece.from <= current.to + WALL_GAP_MAX_CM) current.to = Math.max(current.to, piece.to);
      else {
        joined.push(current);
        current = { ...piece };
      }
    }
    joined.push(current);
  }
  return joined;
}

/** Extends each outer wall that stops at a perpendicular outer wall's inner face over to its outer face. */
function extendOuterCorners(pieces: Piece[]): void {
  const outer = pieces.filter((piece) => piece.outer);
  const snapshot = outer.map((piece) => ({ ...piece }));
  for (const wall of outer) {
    for (const other of snapshot) {
      if (other.axis === wall.axis) continue;
      const reachFrom = other.from - wall.thickness / 2 - CORNER_TOLERANCE_CM;
      const reachTo = other.to + wall.thickness / 2 + CORNER_TOLERANCE_CM;
      if (wall.centre < reachFrom || wall.centre > reachTo) continue;
      const half = other.thickness / 2;
      if (Math.abs(wall.from - (other.centre + half)) <= CORNER_TOLERANCE_CM) wall.from = Math.min(wall.from, other.centre - half);
      if (Math.abs(wall.to - (other.centre - half)) <= CORNER_TOLERANCE_CM) wall.to = Math.max(wall.to, other.centre + half);
    }
  }
}
