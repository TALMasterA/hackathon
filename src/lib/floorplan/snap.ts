import type { Box } from "../geometry/architecture";
import { darkness, isInk, type GrayImage } from "./image";
import type { Strokes } from "./strokes";
import { EDGE_SIDES, type EdgeSide, type EdgeStatus } from "./trace";

/**
 * Snaps approximate room edges (from the AI or a finger) onto the wall lines actually drawn in the
 * plan. A CAD wall is a band of one or more parallel strokes; its face is the centre of the stroke on
 * the room's side. Each candidate face is scored on evidence from the image only, and an edge counts
 * as verified only when one wall band clearly wins.
 */

export interface SnapContext {
  image: GrayImage;
  cmPerPx: number;
  strokes: Strokes;
}

/** One room edge as a probe: a stroke along x at y = position ("h") or along y at x = position ("v"). */
export interface EdgeProbe {
  orientation: "h" | "v";
  position: number;
  from: number;
  to: number;
  /** Direction across the edge, +1 or -1, that points into the room. */
  interior: 1 | -1;
  /** The room's size across the edge, in pixels; the search never reaches past 40 % of it. */
  roomSize: number;
}

export interface EdgeSnap {
  face: number;
  status: Extract<EdgeStatus, "verified" | "unverified">;
  /** Wall thickness in centimetres, from the centre of one face stroke to the other. */
  thickness?: number;
  confidence: number;
  /** Other plausible faces, best first, for "next candidate" in the review step. */
  alternatives: number[];
}

const LINE_COVERAGE = 0.25;
const STROKE_CORE = 0.5;
const WEAK_STROKE_SHARE = 0.6;
/** Face-to-face spacing of a wall: Housing Authority partitions are about 7 cm, structural walls 20–30 cm. */
const WALL_CM = { min: 4, max: 35, pairedMin: 5 };
const SEARCH_CM = { min: 25, base: 40, max: 80 };
const SEARCH_IMAGE_SHARE = 0.04;
const SEARCH_ROOM_SHARE = 0.4;
const CORE_TRIM = 0.15;
const CORE_MIN_CM = 30;
const CLEAR_STRIP_CM = [2, 12] as const;
const VERIFIED_COVERAGE = 0.5;
const KEPT_COVERAGE = 0.35;
const VERIFIED_MARGIN = 0.15;
const SHADOW_COVERAGE = 0.6;
/** A wall stroke cut by a door still marks the face beyond it as a far face. */
const WALL_SHADOW_COVERAGE = 0.35;
const HEAVY_SHARE = 0.7;
const SOLID_SHARE = 1.6;
/** Strokes this much wider than the thinnest pen are wall pens (partitions or structure), not fixtures. */
const WALL_PEN_RATIO = 1.6;
/**
 * A stroke within 15 % (or 1.2 px) of a pen width is one stroke; anything else is several merged
 * strokes. Tight enough that merged glazing (17 px in Harmony 1 at 0.5 cm/px) is not a 21 px wall pen.
 */
const PEN_MATCH = 0.15;
const PEN_MATCH_PX = 1.2;
/** A window wall is drawn as a group of at least this many parallel strokes (frame and glazing). */
const GLAZING_LINES = 3;
const MERGED_SHARE = 1.5;
const GROUP_COVERAGE = 0.6;
const WEIGHTS = { band: 1, face: 0.5, paired: 0.4, pen: 0.15, heavy: 0.15, clear: 0.2, distance: 0.6, shadow: 0.8 };

interface Line {
  start: number;
  end: number;
  centre: number;
  /** Continuous stroke width, from total darkness over the plateau darkness. */
  width: number;
  coverage: number;
}

interface Candidate {
  line: Line;
  face: number;
  partner: Line | null;
  thicknessCm: number | null;
  bandCoverage: number;
  score: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/** Search radius in pixels around an approximate edge. */
export function searchRadius(context: SnapContext, roomSize: number): number {
  const imageCm = Math.max(context.image.width, context.image.height) * context.cmPerPx;
  return Math.min(clamp(Math.max(SEARCH_CM.base, imageCm * SEARCH_IMAGE_SHARE), SEARCH_CM.min, SEARCH_CM.max) / context.cmPerPx, roomSize * SEARCH_ROOM_SHARE);
}

class Profile {
  readonly columns: number[] = [];

  constructor(private readonly context: SnapContext, private readonly probe: EdgeProbe, from: number, to: number) {
    for (let column = Math.max(0, Math.ceil(from)); column < Math.min(this.alongLimit, Math.floor(to)); column++) this.columns.push(column);
  }

  private get alongLimit() {
    return this.probe.orientation === "h" ? this.context.image.width : this.context.image.height;
  }

  ink(column: number, row: number): boolean {
    return this.probe.orientation === "h" ? isInk(this.context.image, column, row) : isInk(this.context.image, row, column);
  }

  dark(column: number, row: number): number {
    return this.probe.orientation === "h" ? darkness(this.context.image, column, row) : darkness(this.context.image, row, column);
  }

  /** Fraction of columns with ink in at least one of the rows [first, last]. */
  coverage(first: number, last: number): number {
    if (this.columns.length === 0) return 0;
    let covered = 0;
    for (const column of this.columns) {
      for (let row = first; row <= last; row++) if (this.ink(column, row)) {
        covered++;
        break;
      }
    }
    return covered / this.columns.length;
  }

  /** Fraction of pixels in the rows [first, last] that are paper. */
  clear(first: number, last: number): number {
    const [low, high] = [Math.min(first, last), Math.max(first, last)];
    let paper = 0;
    let total = 0;
    for (const column of this.columns) for (let row = low; row <= high; row++) {
      total++;
      if (!this.ink(column, row)) paper++;
    }
    return total === 0 ? 1 : paper / total;
  }

  /** Strokes parallel to the edge between rows [first, last]: runs of rows where enough columns have ink. */
  lines(first: number, last: number): Line[] {
    const rows: { row: number; coverage: number; dark: number }[] = [];
    for (let row = first; row <= last; row++) {
      let ink = 0;
      let dark = 0;
      for (const column of this.columns) {
        if (this.ink(column, row)) ink++;
        dark += this.dark(column, row);
      }
      const count = Math.max(1, this.columns.length);
      rows.push({ row, coverage: ink / count, dark: dark / count });
    }
    const lines: Line[] = [];
    const line = (from: number, to: number): Line => {
      const around = rows.slice(Math.max(0, from - 1), Math.min(rows.length, to + 2));
      const total = around.reduce((sum, entry) => sum + entry.dark, 0);
      const plateau = rows.slice(from, to + 1).map((entry) => entry.dark).sort((first, second) => first - second)[Math.floor((to - from) / 2)];
      return {
        start: rows[from].row,
        end: rows[to].row,
        centre: around.reduce((sum, entry) => sum + entry.dark * (entry.row + 0.5), 0) / total,
        width: plateau > 0 ? total / plateau : to - from + 1,
        coverage: this.coverage(rows[from].row, rows[to].row),
      };
    };
    for (let index = 0; index < rows.length; index++) {
      if (rows[index].coverage < LINE_COVERAGE) continue;
      let end = index;
      while (end + 1 < rows.length && rows[end + 1].coverage >= LINE_COVERAGE) end++;
      // A stroke is the rows with at least half the run's best coverage, so a weaker neighbour (glazing
      // in a window gap right beside a wall stroke) becomes its own line instead of dragging the centre.
      const peak = Math.max(...rows.slice(index, end + 1).map((entry) => entry.coverage));
      for (let cursor = index; cursor <= end; cursor++) {
        const strong = (row: number) => rows[row].coverage >= Math.max(LINE_COVERAGE, peak * STROKE_CORE);
        if (!strong(cursor)) {
          let weakEnd = cursor;
          while (weakEnd + 1 <= end && !strong(weakEnd + 1)) weakEnd++;
          // Only a weak run as thick as a real stroke is one; a row or two is a stroke's anti-aliased fringe.
          if (weakEnd - cursor + 1 >= Math.max(2, this.context.strokes.thin * WEAK_STROKE_SHARE)) lines.push(line(cursor, weakEnd));
          cursor = weakEnd;
          continue;
        }
        let strongEnd = cursor;
        while (strongEnd + 1 <= end && strong(strongEnd + 1)) strongEnd++;
        lines.push(line(cursor, strongEnd));
        cursor = strongEnd;
      }
      index = end;
    }
    return lines;
  }
}

/** Snaps one edge: finds candidate faces near the probe and keeps the best only if it clearly wins. */
export function snapEdge(context: SnapContext, probe: EdgeProbe): EdgeSnap {
  const px = (cm: number) => cm / context.cmPerPx;
  const length = probe.to - probe.from;
  const trim = clamp(Math.min(CORE_TRIM * length, (length - px(CORE_MIN_CM)) / 2), 0, length / 2);
  const profile = new Profile(context, probe, probe.from + trim, probe.to - trim);
  const radius = searchRadius(context, probe.roomSize);
  const reach = radius + px(WALL_CM.max) + context.strokes.heavy;
  const lines = profile.lines(Math.floor(probe.position - reach), Math.ceil(probe.position + reach));
  const exterior = -probe.interior;
  const { strokes } = context;
  const isWallPen = (line: Line) => !strokes.distinct || line.width >= strokes.thin * WALL_PEN_RATIO;
  const isHeavy = (line: Line) => strokes.distinct && line.width >= strokes.heavy * HEAVY_SHARE;
  const singlePen = (line: Line) => strokes.pens.some((pen) => Math.abs(line.width - pen) <= Math.max(PEN_MATCH_PX, pen * PEN_MATCH));
  /** Thin strokes a line holds: one when it matches a pen, more for a band of merged thin strokes. */
  const thinStrokes = (line: Line) => strokes.distinct && !singlePen(line) && line.width >= strokes.thin * MERGED_SHARE ? Math.round((line.width - strokes.thin) / strokes.thin) + 1 : 1;

  const candidates: Candidate[] = [];
  for (const line of lines) {
    const beyond = (other: Line, direction: number) => {
      const distance = (other.centre - line.centre) * direction;
      return distance >= Math.max(px(WALL_CM.min), (line.width + other.width) / 2) && distance <= px(WALL_CM.max);
    };
    const strongest = (options: Line[]) => options.sort((first, second) => second.coverage - first.coverage || Math.abs(first.centre - line.centre) - Math.abs(second.centre - line.centre))[0] ?? null;
    const solid = !singlePen(line) && line.width > strokes.heavy * SOLID_SHARE && line.width > px(WALL_CM.min);
    // The far face: the strongest wall stroke within a wall's width beyond this one, so a thin fixture
    // stroke (a bath rim, a counter) never pairs with a wall stroke when the pens tell them apart.
    let partner = solid || !isWallPen(line) ? null : strongest(lines.filter((other) => other !== line && beyond(other, exterior) && isWallPen(other)));
    let glazing = false;
    if (!solid && !partner) {
      // A window wall: frame and glazing strokes in any pen, three or more counting merged ones.
      const group = lines.filter((other) => other !== line && beyond(other, exterior) && other.coverage >= line.coverage * GROUP_COVERAGE);
      if (group.length + thinStrokes(line) >= GLAZING_LINES) {
        partner = group.length > 0 ? group.reduce((far, other) => (other.centre - far.centre) * exterior > 0 ? other : far) : null;
        glazing = true;
      }
    }
    // One stroke (or a paired wall stroke): its centre. Merged wall strokes or a filled wall: half a wall
    // pen inside the band's edge. Merged glazing: half a thin pen inside, the innermost stroke's centre.
    const inset = solid ? strokes.heavy / 2 : glazing && thinStrokes(line) > 1 ? strokes.thin / 2 : line.width / 2;
    const face = line.centre + probe.interior * (line.width / 2 - inset);
    if (Math.abs(face - probe.position) > radius) continue;
    const farEdge = partner && glazing ? partner.centre + exterior * (partner.width / 2 - strokes.thin / 2) : partner?.centre;
    const thicknessCm = solid ? (line.width - strokes.heavy) * context.cmPerPx : farEdge !== undefined ? Math.abs(farEdge - face) * context.cmPerPx : glazing ? (line.width - strokes.thin) * context.cmPerPx : null;
    const paired = thicknessCm !== null && thicknessCm >= WALL_CM.pairedMin && thicknessCm <= WALL_CM.max;
    const bandCoverage = partner ? profile.coverage(Math.min(line.start, partner.start), Math.max(line.end, partner.end)) : line.coverage;
    const stripStart = face + probe.interior * (inset + px(CLEAR_STRIP_CM[0]));
    const stripEnd = face + probe.interior * (inset + px(CLEAR_STRIP_CM[1]));
    const clear = profile.clear(Math.round(stripStart), Math.round(stripEnd));
    // A stroke on the room's side within a wall's width means this line is a far face, not the near one.
    // Only wall pens can hide a wall-pen stroke (even one cut by a door); any stroke can hide glazing.
    const shadowed = !solid && lines.some((other) => other !== line && beyond(other, probe.interior)
      && (isWallPen(line) && !glazing ? isWallPen(other) && other.coverage >= line.coverage * WALL_SHADOW_COVERAGE : other.coverage >= line.coverage * SHADOW_COVERAGE));
    const score = WEIGHTS.band * bandCoverage + WEIGHTS.face * line.coverage + WEIGHTS.paired * Number(paired) + WEIGHTS.pen * Number(strokes.distinct && isWallPen(line)) + WEIGHTS.heavy * Number(isHeavy(line))
      + WEIGHTS.clear * clear - WEIGHTS.distance * Math.abs(face - probe.position) / radius - WEIGHTS.shadow * Number(shadowed);
    candidates.push({ line, face, partner, thicknessCm: paired ? thicknessCm : null, bandCoverage, score });
  }
  candidates.sort((first, second) => second.score - first.score);
  const best = candidates[0];
  if (!best) return { face: probe.position, status: "unverified", confidence: 0, alternatives: [] };
  const low = Math.min(best.line.start, best.partner?.start ?? best.line.start);
  const high = Math.max(best.line.end, best.partner?.end ?? best.line.end);
  const rival = candidates.find((candidate) => candidate !== best && candidate.partner !== best.line && !(candidate.line.centre >= low && candidate.line.centre <= high + 1));
  const margin = rival ? best.score - rival.score : Infinity;
  const verified = best.bandCoverage >= VERIFIED_COVERAGE && best.thicknessCm !== null && margin >= VERIFIED_MARGIN;
  const confidence = clamp(Math.min(best.bandCoverage / 0.8, margin / 0.3), 0, 1);
  const alternatives = candidates.slice(1, 4).map((candidate) => candidate.face);
  if (verified) return { face: best.face, status: "verified", thickness: best.thicknessCm!, confidence, alternatives };
  if (best.bandCoverage >= KEPT_COVERAGE) return { face: best.face, status: "unverified", ...(best.thicknessCm ? { thickness: best.thicknessCm } : {}), confidence, alternatives };
  return { face: probe.position, status: "unverified", confidence: 0, alternatives: candidates.slice(0, 3).map((candidate) => candidate.face) };
}

export function edgeProbe(box: Box, side: EdgeSide): EdgeProbe {
  switch (side) {
    case "top": return { orientation: "h", position: box.minZ, from: box.minX, to: box.maxX, interior: 1, roomSize: box.maxZ - box.minZ };
    case "bottom": return { orientation: "h", position: box.maxZ, from: box.minX, to: box.maxX, interior: -1, roomSize: box.maxZ - box.minZ };
    case "left": return { orientation: "v", position: box.minX, from: box.minZ, to: box.maxZ, interior: 1, roomSize: box.maxX - box.minX };
    case "right": return { orientation: "v", position: box.maxX, from: box.minZ, to: box.maxZ, interior: -1, roomSize: box.maxX - box.minX };
  }
}

const BOX_KEY: Record<EdgeSide, keyof Box> = { top: "minZ", bottom: "maxZ", left: "minX", right: "maxX" };

/** A room in pixel coordinates of the analysed image: x right, z down (image rows). */
export interface PixelRoom {
  id: string;
  box: Box;
}

export interface SnappedRoom {
  id: string;
  box: Box;
  edges: Record<EdgeSide, Omit<EdgeSnap, "status"> & { status: Extract<EdgeStatus, "verified" | "unverified" | "open"> }>;
}

const FACING: [EdgeSide, EdgeSide][] = [["bottom", "top"], ["right", "left"]];
const FACING_GAP_CM = 40;
const WALL_GAP_CM = 35;
const COLLINEAR_CM = 2;

function overlaps(first: Box, second: Box, side: EdgeSide): boolean {
  return side === "bottom" || side === "top" ? Math.min(first.maxX, second.maxX) > Math.max(first.minX, second.minX) : Math.min(first.maxZ, second.maxZ) > Math.max(first.minZ, second.minZ);
}

/**
 * Snaps every edge of every room in two passes (the second measures each edge between the first
 * pass's perpendicular faces), then makes neighbours agree: rooms joined as an open pair share one
 * face, a verified wall's far face fixes its neighbour's edge, and collinear faces within 2 cm merge.
 */
export function snapRooms(context: SnapContext, rooms: readonly PixelRoom[], openPairs: readonly (readonly [string, string])[] = []): SnappedRoom[] {
  const snapAll = (boxes: readonly Box[]) => boxes.map((box) => Object.fromEntries(EDGE_SIDES.map((side) => [side, snapEdge(context, edgeProbe(box, side))])) as Record<EdgeSide, EdgeSnap>);
  const boxOf = (snaps: Record<EdgeSide, EdgeSnap>, fallback: Box): Box => ({ minX: snaps.left.face, maxX: snaps.right.face, minZ: snaps.top.face, maxZ: snaps.bottom.face, ...(snaps.left.face >= snaps.right.face || snaps.top.face >= snaps.bottom.face ? fallback : {}) });
  const first = snapAll(rooms.map((room) => room.box));
  const second = snapAll(first.map((snaps, index) => boxOf(snaps, rooms[index].box)));
  const result: SnappedRoom[] = rooms.map((room, index) => ({ id: room.id, box: boxOf(second[index], rooms[index].box), edges: { ...second[index] } }));
  const px = (cm: number) => cm / context.cmPerPx;
  const setFace = (room: SnappedRoom, side: EdgeSide, face: number) => {
    room.edges[side] = { ...room.edges[side], face };
    room.box = { ...room.box, [BOX_KEY[side]]: face };
  };
  const open = new Set(openPairs.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

  for (const room of result) {
    for (const other of result) {
      if (room === other) continue;
      for (const [lowSide, highSide] of FACING) {
        if (!overlaps(room.box, other.box, lowSide)) continue;
        const gap = other.edges[highSide].face - room.edges[lowSide].face;
        if (gap < -px(COLLINEAR_CM) || gap > px(FACING_GAP_CM)) continue;
        const [near, far] = [room.edges[lowSide], other.edges[highSide]];
        if (open.has(`${room.id}|${other.id}`)) {
          // One space traced as two rectangles: the shared edges meet. A verified face (a wall along part
          // of the edge) wins; the other edge is marked open, since no wall separates the two parts.
          if (near.status === "verified" && far.status === "verified") continue;
          const face = near.status === "verified" ? near.face : far.status === "verified" ? far.face : (near.face + far.face) / 2;
          setFace(room, lowSide, face);
          setFace(other, highSide, face);
          if (near.status !== "verified") room.edges[lowSide] = { ...room.edges[lowSide], status: "open" };
          if (far.status !== "verified") other.edges[highSide] = { ...other.edges[highSide], status: "open" };
        } else if (near.status === "verified" && far.status !== "verified" && near.thickness) {
          setFace(other, highSide, near.face + px(near.thickness));
          other.edges[highSide] = { ...other.edges[highSide], status: "verified", thickness: near.thickness };
        } else if (far.status === "verified" && near.status !== "verified" && far.thickness) {
          setFace(room, lowSide, far.face - px(far.thickness));
          room.edges[lowSide] = { ...room.edges[lowSide], status: "verified", thickness: far.thickness };
        }
      }
    }
  }

  // An edge with no evidence of its own (e.g. a wide window or duct opening in an outer wall) moves
  // onto the collinear verified face of a room beside it on the same wall line, but stays flagged.
  const spans: Record<EdgeSide, [keyof Box, keyof Box]> = { top: ["minX", "maxX"], bottom: ["minX", "maxX"], left: ["minZ", "maxZ"], right: ["minZ", "maxZ"] };
  for (const room of result) {
    for (const side of EDGE_SIDES) {
      const edge = room.edges[side];
      if (edge.status !== "unverified" || edge.confidence > 0) continue;
      const [low, high] = spans[side];
      const reach = searchRadius(context, side === "top" || side === "bottom" ? room.box.maxZ - room.box.minZ : room.box.maxX - room.box.minX);
      const neighbour = result.filter((other) => other !== room && other.edges[side].status === "verified" && Math.abs(other.edges[side].face - edge.face) <= reach
        && Math.max(other.box[low], room.box[low]) - Math.min(other.box[high], room.box[high]) <= px(WALL_GAP_CM))
        .sort((first, second) => Math.abs(first.edges[side].face - edge.face) - Math.abs(second.edges[side].face - edge.face))[0];
      if (neighbour) setFace(room, side, neighbour.edges[side].face);
    }
  }

  for (const side of EDGE_SIDES) {
    const along = result.filter((room) => room.edges[side].status !== "open").sort((a, b) => a.edges[side].face - b.edges[side].face);
    for (let index = 0; index < along.length; index++) {
      const group = [along[index]];
      while (index + 1 < along.length && along[index + 1].edges[side].face - group[0].edges[side].face <= px(COLLINEAR_CM)) group.push(along[++index]);
      if (group.length < 2) continue;
      const weights = group.map((room) => Math.max(0.05, room.edges[side].confidence));
      const face = group.reduce((sum, room, position) => sum + room.edges[side].face * weights[position], 0) / weights.reduce((sum, weight) => sum + weight, 0);
      for (const room of group) setFace(room, side, face);
    }
  }
  return result;
}
