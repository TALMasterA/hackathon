import { isInk } from "./image";
import type { SnapContext } from "./snap";

/** Wall openings as the drawing shows them, measured along a snapped room face. */
export interface OpeningFinding {
  kind: "door" | "window";
  /** Centre along the face, in pixels. */
  centre: number;
  /** Clear width between the wall ends, in pixels. */
  width: number;
  /** +1: the door swings into the face's room; -1: away from it; 0: the drawing does not say. */
  swing: 1 | -1 | 0;
}

export interface FaceLine {
  orientation: "h" | "v";
  /** Centre of the face stroke across the wall, in pixels. */
  face: number;
  /** The wall's other face, when the snap found it. */
  farFace?: number;
  /** Direction across the wall, +1 or -1, that points into the face's room. */
  interior: 1 | -1;
}

export const OPENING_CM = { min: 50, max: 130 };
/** An AI door this far from any measured gap keeps its own position and a default width, flagged. */
export const MATCH_DISTANCE_CM = 60;
const BOTH_FACES_SHARE = 0.8;
const GLAZING_SHARE = 0.7;
const SWING_RATIO = 2;
const MIN_SWING_INK = 4;

function inkAt(context: SnapContext, line: FaceLine, along: number, across: number): boolean {
  return line.orientation === "h" ? isInk(context.image, along, across) : isInk(context.image, across, along);
}

/** Paper columns along a face stroke: no ink in either of the two rows nearest its centre. */
function paperAlong(context: SnapContext, line: FaceLine, face: number, from: number, to: number): boolean[] {
  const rows = [Math.floor(face - 0.5), Math.floor(face)];
  const paper: boolean[] = [];
  for (let along = from; along < to; along++) paper.push(!rows.some((row) => inkAt(context, line, along, row)));
  return paper;
}

function inkShare(context: SnapContext, line: FaceLine, alongFrom: number, alongTo: number, acrossFrom: number, acrossTo: number): number {
  const [low, high] = [Math.round(Math.min(acrossFrom, acrossTo)), Math.round(Math.max(acrossFrom, acrossTo))];
  let total = 0;
  let ink = 0;
  for (let along = alongFrom; along < alongTo; along++) for (let across = low; across <= high; across++) {
    total++;
    if (inkAt(context, line, along, across)) ink++;
  }
  return total === 0 ? 0 : ink / total;
}

function inkCount(context: SnapContext, line: FaceLine, alongFrom: number, alongTo: number, acrossFrom: number, acrossTo: number): number {
  return inkShare(context, line, alongFrom, alongTo, acrossFrom, acrossTo) * (alongTo - alongFrom) * (Math.abs(acrossTo - acrossFrom) + 1);
}

/**
 * Finds the wall opening nearest to an approximate position on a face: a paper run 50–130 cm long in
 * the face stroke, widened by one stroke width because jamb strokes are centred on the wall ends.
 * With the far face known, glazing strokes inside the wall mark a window, and the ink of a door
 * leaf and arc beside the opening tells which side it swings to.
 */
export function measureOpening(context: SnapContext, line: FaceLine, near: number): OpeningFinding | null {
  const px = (cm: number) => cm / context.cmPerPx;
  const limit = line.orientation === "h" ? context.image.width : context.image.height;
  const from = Math.max(0, Math.floor(near - px(MATCH_DISTANCE_CM + OPENING_CM.max)));
  const to = Math.min(limit, Math.ceil(near + px(MATCH_DISTANCE_CM + OPENING_CM.max)));
  const paper = paperAlong(context, line, line.face, from, to);
  const runs: { start: number; end: number }[] = [];
  for (let index = 0; index < paper.length; index++) {
    if (!paper[index]) continue;
    let end = index;
    while (end + 1 < paper.length && paper[end + 1]) end++;
    // Runs touching the scanned window's ends may continue beyond it, so their length is unknown.
    if (index > 0 && end < paper.length - 1) runs.push({ start: from + index, end: from + end + 1 });
    index = end;
  }
  const stroke = context.strokes.heavy;
  const openings = runs.map((run) => ({ ...run, centre: (run.start + run.end) / 2, width: run.end - run.start + stroke }))
    .filter((run) => run.width >= px(OPENING_CM.min) && run.width <= px(OPENING_CM.max) && Math.abs(run.centre - near) <= px(MATCH_DISTANCE_CM))
    .sort((first, second) => Math.abs(first.centre - near) - Math.abs(second.centre - near));
  const run = openings[0];
  if (!run) return null;

  let kind: OpeningFinding["kind"] = "door";
  let outerEdge = line.face - line.interior * stroke / 2;
  if (line.farFace !== undefined) {
    const far = paperAlong(context, line, line.farFace, run.start, run.end);
    const bothOpen = far.filter(Boolean).length / far.length >= BOTH_FACES_SHARE;
    // Glazing: columns of the opening with ink strictly between the two face strokes.
    const inside = [line.face, line.farFace].sort((first, second) => first - second);
    let glazedColumns = 0;
    for (let along = run.start; along < run.end; along++) {
      for (let across = Math.round(inside[0] + stroke); across <= Math.round(inside[1] - stroke); across++) if (inkAt(context, line, along, across)) {
        glazedColumns++;
        break;
      }
    }
    if (bothOpen && glazedColumns / (run.end - run.start) >= GLAZING_SHARE) kind = "window";
    outerEdge = line.farFace - line.interior * stroke / 2;
  }
  let swing: OpeningFinding["swing"] = 0;
  if (kind === "door") {
    const innerEdge = line.face + line.interior * stroke;
    const inward = inkCount(context, line, run.start, run.end, innerEdge, innerEdge + line.interior * run.width);
    const outward = inkCount(context, line, run.start, run.end, outerEdge - line.interior * stroke / 2, outerEdge - line.interior * (run.width + stroke / 2));
    if (inward >= MIN_SWING_INK && inward >= outward * SWING_RATIO) swing = 1;
    else if (outward >= MIN_SWING_INK && outward >= inward * SWING_RATIO) swing = -1;
  }
  return { kind, centre: run.centre, width: run.width, swing };
}
