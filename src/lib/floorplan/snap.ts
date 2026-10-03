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
const WALL_CM = { min: 5, max: 35, pairedMin: 7 };
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
const HEAVY_SHARE = 0.7;
const SOLID_SHARE = 1.6;
const WEIGHTS = { band: 1, face: 0.5, paired: 0.4, heavy: 0.3, clear: 0.2, distance: 0.6, shadow: 0.8 };

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
    for (let index = 0; index < rows.length; index++) {
      if (rows[index].coverage < LINE_COVERAGE) continue;
      let end = index;
      while (end + 1 < rows.length && rows[end + 1].coverage >= LINE_COVERAGE) end++;
      const around = rows.slice(Math.max(0, index - 1), Math.min(rows.length, end + 2));
      const total = around.reduce((sum, entry) => sum + entry.dark, 0);
      const plateau = [...rows.slice(index, end + 1).map((entry) => entry.dark)].sort((first, second) => first - second)[Math.floor((end - index) / 2)];
      lines.push({
        start: rows[index].row,
        end: rows[end].row,
        centre: around.reduce((sum, entry) => sum + entry.dark * (entry.row + 0.5), 0) / total,
        width: plateau > 0 ? total / plateau : end - index + 1,
        coverage: this.coverage(rows[index].row, rows[end].row),
      });
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
  const isHeavy = (line: Line) => strokes.distinct ? line.width >= strokes.heavy * HEAVY_SHARE : true;

  const candidates: Candidate[] = [];
  for (const line of lines) {
    const solid = line.width > strokes.heavy * SOLID_SHARE && line.width > px(WALL_CM.min);
    // A wide solid band is two merged face strokes (or a filled wall): its face is half a stroke inside the band's edge.
    const face = solid ? line.centre + probe.interior * (line.width / 2 - strokes.heavy / 2) : line.centre;
    if (Math.abs(face - probe.position) > radius) continue;
    const beyond = (other: Line, direction: number) => {
      const distance = (other.centre - line.centre) * direction;
      return distance >= Math.max(px(WALL_CM.min), (line.width + other.width) / 2) && distance <= px(WALL_CM.max);
    };
    // A wall's far face is the strongest stroke beyond it within a wall's width; a thin fixture stroke
    // (a bath rim, a counter) never pairs with a wall stroke when the plan's pens tell them apart.
    const partner = solid || !isHeavy(line) ? null : lines.filter((other) => other !== line && beyond(other, exterior) && isHeavy(other))
      .sort((first, second) => second.coverage - first.coverage || Math.abs(first.centre - line.centre) - Math.abs(second.centre - line.centre))[0] ?? null;
    const thicknessCm = solid ? (line.width - strokes.heavy) * context.cmPerPx : partner ? Math.abs(partner.centre - line.centre) * context.cmPerPx : null;
    const paired = thicknessCm !== null && thicknessCm >= WALL_CM.pairedMin && thicknessCm <= WALL_CM.max;
    const bandCoverage = partner ? profile.coverage(Math.min(line.start, partner.start), Math.max(line.end, partner.end)) : line.coverage;
    const stripStart = face + probe.interior * (line.width / 2 + px(CLEAR_STRIP_CM[0]));
    const stripEnd = face + probe.interior * (line.width / 2 + px(CLEAR_STRIP_CM[1]));
    const clear = profile.clear(Math.round(stripStart), Math.round(stripEnd));
    // A wall stroke on the room's side within a wall's width means this line is the far face, not the near one.
    const shadowed = !solid && lines.some((other) => other !== line && beyond(other, probe.interior) && other.coverage >= line.coverage * SHADOW_COVERAGE && isHeavy(other));
    const score = WEIGHTS.band * bandCoverage + WEIGHTS.face * line.coverage + WEIGHTS.paired * Number(paired) + WEIGHTS.heavy * Number(strokes.distinct && isHeavy(line))
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
          const middle = (near.face + far.face) / 2;
          setFace(room, lowSide, middle);
          setFace(other, highSide, middle);
          room.edges[lowSide] = { ...room.edges[lowSide], status: "open" };
          other.edges[highSide] = { ...other.edges[highSide], status: "open" };
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
