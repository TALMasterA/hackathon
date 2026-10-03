import { WALL_GAP_MAX_CM } from "../geometry/architecture";
import { dot, edgeAngle, frameForAngle, type EdgeFrame } from "../geometry/polygon";
import type { Position2D, Wall } from "../../types/domain";
import { wallName } from "./names";
import { roomEdges, roundFace, type TraceEdge } from "./trace";

/** Facing faces closer than this have no wall between them: the rooms are one open space. */
export const OPEN_GAP_CM = 5;
export const DEFAULT_OUTER_THICKNESS_CM = 20;
const MIN_OVERLAP_CM = 1;
const CORNER_TOLERANCE_CM = 2;
const MIN_WALL_CM = 5;
const SPAN_EPSILON_CM = 1e-9;
/** Edges this close in direction count as parallel, so hand-drawn angled walls still pair up. */
const PARALLEL_DEGREES = 0.5;

export interface WallRoom {
  id: string;
  /** Corners clockwise on screen. */
  points: readonly Position2D[];
  /** Per edge: edges[i] runs from points[i] to points[i + 1]. */
  edges?: readonly (TraceEdge | undefined)[];
}

export interface WallOptions {
  /** Room pairs joined without a wall, e.g. an L-shaped living room traced as two rectangles. */
  openPairs?: readonly (readonly [string, string])[];
  /** Outer-wall thickness when nothing was measured; the median measured outer wall wins over it. */
  defaultOuter?: number;
}

/**
 * One room edge measured in its direction family's frame: `face` across (along m), `from`–`to` along u.
 * For horizontal and vertical edges these are exactly the plan coordinates the axis-aligned code used.
 */
export interface FrameEdge {
  room: WallRoom;
  index: number;
  edgeIndex: number;
  frame: EdgeFrame;
  face: number;
  from: number;
  to: number;
  /** +1 when the room lies on the lower side of the face along m (the wall goes towards +m). */
  outward: 1 | -1;
}

interface Piece {
  frame: EdgeFrame;
  centre: number;
  from: number;
  to: number;
  thickness: number;
  outer: boolean;
  /** An outer wall's face on the room side, across its frame (the room edge it was built on). */
  inner?: number;
}

const angleGap = (first: number, second: number) => {
  const gap = Math.abs(first - second) % 180;
  return Math.min(gap, 180 - gap);
};

/** Every edge of every room in its family frame; nearly parallel edges share one frame. */
export function frameEdges(rooms: readonly WallRoom[]): FrameEdge[] {
  const raw = rooms.flatMap((room, index) => roomEdges(room).filter((edge) => edge.length > 0).map((edge) => ({ room, index, edge, angle: edgeAngle(edge.start, edge.end) })));
  const frames: EdgeFrame[] = [];
  const frameOf = new Map<(typeof raw)[number], EdgeFrame>();
  // Exact horizontals and verticals first, then the longest edges, so each family takes the steadiest direction.
  for (const entry of [...raw].sort((first, second) => Number(second.edge.axis !== null) - Number(first.edge.axis !== null) || second.edge.length - first.edge.length)) {
    let frame = frames.find((candidate) => angleGap(candidate.angle, entry.angle) <= PARALLEL_DEGREES);
    if (!frame) {
      frame = frameForAngle(entry.edge.axis === "x" ? 0 : entry.edge.axis === "z" ? 90 : entry.angle);
      frames.push(frame);
    }
    frameOf.set(entry, frame);
  }
  return raw.map((entry) => {
    const frame = frameOf.get(entry)!;
    const { start, end, inward, axis } = entry.edge;
    const reference = axis ? start : { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
    const [a, b] = [dot(frame.u, start), dot(frame.u, end)];
    return { room: entry.room, index: entry.index, edgeIndex: entry.edge.index, frame, face: dot(frame.m, reference), from: Math.min(a, b), to: Math.max(a, b), outward: dot(inward, frame.m) > 0 ? -1 : 1 };
  });
}

/** The gap from an edge's face to a parallel edge's face, measured outward from the first room. */
export const gapBetween = (edge: FrameEdge, other: FrameEdge) => edge.outward === 1 ? other.face - edge.face : edge.face - other.face;

/** Facing edges of other rooms across a gap of at most `maxGap`, with their shared span. */
export function facingEdges(edge: FrameEdge, all: readonly FrameEdge[], maxGap = WALL_GAP_MAX_CM) {
  return all.filter((other) => other.frame === edge.frame && other.outward === -edge.outward && other.room !== edge.room)
    .map((other) => ({ other, gap: gapBetween(edge, other), from: Math.max(edge.from, other.from), to: Math.min(edge.to, other.to) }))
    .filter((entry) => entry.gap >= 0 && entry.gap <= maxGap && entry.to - entry.from > MIN_OVERLAP_CM);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Splits an edge into stretches, each facing its nearest room across a wall-sized gap, or nothing. */
function edgeSegments(edge: FrameEdge, all: readonly FrameEdge[]) {
  const partners = facingEdges(edge, all);
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

/** A point given along (u) and across (m) a frame. */
export const framePoint = (frame: EdgeFrame, along: number, across: number): Position2D => ({ x: frame.u.x * along + frame.m.x * across, z: frame.u.z * along + frame.m.z * across });
const tidy = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Generates wall centre lines from rooms traced on the walls' inner faces, at any angle.
 *
 * Facing parallel edges up to 35 cm apart share one partition wall centred in the gap, as thick as
 * the gap (under 5 cm, or an open pair, they share no wall). The rest of each edge is an outer wall of
 * its measured thickness. Collinear pieces up to 35 cm apart are joined across junctions with crossing
 * walls, and outer walls are extended over the corners they meet.
 */
export function wallsFromRooms(rooms: readonly WallRoom[], options: WallOptions = {}): Wall[] {
  const all = frameEdges(rooms);
  const open = new Set((options.openPairs ?? []).flatMap(([first, second]) => [`${first}|${second}`, `${second}|${first}`]));
  const isOpen = (edge: FrameEdge, other: FrameEdge) => open.has(`${edge.room.id}|${other.room.id}`) || edge.room.edges?.[edge.edgeIndex]?.status === "open" || other.room.edges?.[other.edgeIndex]?.status === "open";
  const segmented = all.map((edge) => ({ edge, segments: edgeSegments(edge, all) }));

  const measured = (edge: FrameEdge) => {
    const info = edge.room.edges?.[edge.edgeIndex];
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
        // Each shared wall is emitted once, from the pair's edge on the lower side along m.
        if (edge.outward !== 1 || segment.partner.gap < OPEN_GAP_CM || isOpen(edge, segment.partner.other)) return;
        const wall: Piece = { frame: edge.frame, centre: edge.face + segment.partner.gap / 2, from: segment.from, to: segment.to, thickness: segment.partner.gap, outer: false };
        pieces.push(wall);
        previousWall = wall;
        return;
      }
      const before = segments[index - 1]?.partner;
      const after = segments[index + 1]?.partner;
      // A short stretch between two shared walls is where a crossing wall meets them, not the outside.
      if (before && after && segment.to - segment.from <= WALL_GAP_MAX_CM) {
        const fill: Piece | null = previousWall;
        if (fill) pieces.push({ ...fill, from: segment.from, to: segment.to });
        return;
      }
      previousWall = null;
      pieces.push({ frame: edge.frame, centre: edge.face + edge.outward * outerThickness / 2, from: segment.from, to: segment.to, thickness: outerThickness, outer: true, inner: edge.face });
    });
  }

  const joined = joinCollinear(pieces);
  extendOuterCorners(joined);
  const walls = joined.filter((piece) => piece.to - piece.from >= MIN_WALL_CM)
    .sort((first, second) => Number(second.outer) - Number(first.outer) || first.frame.angle - second.frame.angle || first.centre - second.centre || first.from - second.from);
  const counters = { outer: 0, inner: 0 };
  return walls.map((piece) => {
    const number = piece.outer ? ++counters.outer : ++counters.inner;
    const [start, end] = [framePoint(piece.frame, piece.from, piece.centre), framePoint(piece.frame, piece.to, piece.centre)];
    return {
      id: piece.outer ? `outer-wall-${number}` : `partition-${number}`,
      name: wallName(piece.outer, number),
      start: { x: tidy(start.x), z: tidy(start.z) },
      end: { x: tidy(end.x), z: tidy(end.z) },
      thickness: piece.thickness,
      outer: piece.outer,
    };
  });
}

/** Joins pieces on the same centre line with the same thickness and kind when they overlap or nearly touch. */
function joinCollinear(pieces: readonly Piece[]): Piece[] {
  const groups = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const key = `${piece.frame.angle}|${piece.centre.toFixed(6)}|${piece.thickness}|${piece.outer}`;
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

/**
 * Closes the corners where outer walls meet. A wall whose room-side face ends on another outer wall's
 * room-side face (the room's corner) is extended along its centre line to that wall's outside face.
 * At a right angle both walls then cover exactly the corner square; at other angles the pieces overlap
 * the corner instead of leaving a gap.
 */
function extendOuterCorners(pieces: Piece[]): void {
  const outer = pieces.filter((piece) => piece.outer && piece.inner !== undefined);
  const snapshot = outer.map((piece) => ({ ...piece }));
  for (const wall of outer) {
    for (const other of snapshot) {
      if (other.frame === wall.frame) continue;
      const crossing = dot(other.frame.m, wall.frame.u);
      if (Math.abs(crossing) < 1e-6) continue;
      const outside = 2 * other.centre - other.inner!;
      for (const end of ["from", "to"] as const) {
        const corner = framePoint(wall.frame, wall[end], wall.inner!);
        const along = dot(other.frame.u, corner);
        if (along < other.from - wall.thickness / 2 - CORNER_TOLERANCE_CM || along > other.to + wall.thickness / 2 + CORNER_TOLERANCE_CM) continue;
        if (Math.abs(dot(other.frame.m, corner) - other.inner!) > CORNER_TOLERANCE_CM) continue;
        const reach = (outside - wall.centre * dot(other.frame.m, wall.frame.m)) / crossing;
        if (end === "from") wall.from = Math.min(wall.from, reach);
        else wall.to = Math.max(wall.to, reach);
      }
    }
  }
}
