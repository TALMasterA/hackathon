import { isInk } from "./image";
import type { SnapContext } from "./snap";

/** Wall openings as the drawing shows them, measured along a snapped room face. */
export interface OpeningFinding {
  kind: "door" | "window";
  /** Centre along the face, in pixels. */
  centre: number;
  /** Clear width between the wall ends (or of the door leaf, in a wider opening), in pixels. */
  width: number;
  /** +1: the door swings into the face's room; -1: away from it; 0: the drawing does not say. */
  swing: 1 | -1 | 0;
  /** How many of the gap's ends are closed by a drawn jamb (0–2): strong evidence of a real opening. */
  jambs: number;
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

/** A single door or window opening; wider gaps hold a door beside a fixed panel (as at Housing Authority entrances). */
export const OPENING_CM = { min: 50, max: 130, maxWithPanel: 260 };
/** An AI door this far from any measured gap keeps its own position and a default width, flagged. */
export const MATCH_DISTANCE_CM = 60;
const BOTH_FACES_SHARE = 0.8;
const GLAZING_SHARE = 0.7;
const SWING_RATIO = 2;
const MIN_SWING_INK = 4;
/** Ink this much thicker than the thinnest pen, across the face, is the wall stroke itself. */
const WALL_PEN_RATIO = 1.4;
const LEAF_CM = { min: 45, max: 130 };
/** A leaf this share of a gap's measured width is that gap's door. */
const LEAF_SHARE = { min: 0.7, max: 1.1 };
/** The leaf's tip may stop a little short of where the arc meets the wall. */
const SPAN_SLACK_CM = 6;

interface Run {
  start: number;
  end: number;
}

/**
 * Finds the wall opening nearest to an approximate position on a face. An opening is where the wall
 * stroke itself is missing along the face (thin frame or threshold lines drawn across the gap do not
 * close it), measured between the centres of the jamb strokes closing the wall on either side. A gap
 * of 50–130 cm is one door or window; a wider one (up to 260 cm) counts only when a door leaf is drawn in it, and the door is then
 * the leaf's width and position. With the far face known, glazing strokes inside the wall mark a
 * window; the ink of a door leaf and arc beside the opening tells which side it swings to.
 */
export function measureOpening(context: SnapContext, line: FaceLine, near: number): OpeningFinding | null {
  const { image, strokes } = context;
  const px = (cm: number) => cm / context.cmPerPx;
  const ink = (along: number, across: number) => line.orientation === "h" ? isInk(image, along, across) : isInk(image, across, along);
  const limit = line.orientation === "h" ? image.width : image.height;
  const minimumStroke = strokes.distinct ? strokes.thin * WALL_PEN_RATIO : 1;
  const reachAcross = Math.ceil(strokes.heavy * 1.5);
  const faceRow = Math.round(line.face - 0.5);

  /**
   * Ink thickness of the stroke centred on the face at one point along it. A wall stroke is centred on
   * the face; a door leaf or panel touching a frame line only reaches out on one side, so the shorter
   * side's reach, doubled, is what counts.
   */
  const thickness = (along: number) => {
    const centre = [faceRow, faceRow - 1, faceRow + 1].find((row) => ink(along, row));
    if (centre === undefined) return 0;
    let low = 0;
    let high = 0;
    while (low < reachAcross && ink(along, centre - low - 1)) low++;
    while (high < reachAcross && ink(along, centre + high + 1)) high++;
    return 2 * Math.min(low, high) + 1;
  };
  const wallAt = (along: number) => thickness(along) >= minimumStroke;

  const from = Math.max(0, Math.floor(near - px(MATCH_DISTANCE_CM + OPENING_CM.maxWithPanel)));
  const to = Math.min(limit, Math.ceil(near + px(MATCH_DISTANCE_CM + OPENING_CM.maxWithPanel)));
  const runs: Run[] = [];
  for (let along = from; along < to; along++) {
    if (wallAt(along)) continue;
    let end = along;
    while (end + 1 < to && !wallAt(end + 1)) end++;
    // Runs touching the scanned window's ends may continue beyond it, so their length is unknown.
    if (along > from && end < to - 1) runs.push({ start: along, end: end + 1 });
    along = end;
  }

  // The band between the two face strokes is solid only at a jamb (the stroke closing a wall end).
  const band = line.farFace === undefined ? null : [Math.ceil(Math.min(line.face, line.farFace) + 2), Math.floor(Math.max(line.face, line.farFace) - 2)];
  const fullBand = (along: number) => {
    if (!band || band[1] < band[0]) return false;
    for (let across = band[0]; across <= band[1]; across++) if (!ink(along, across)) return false;
    return true;
  };
  /**
   * Centre of the jamb stroke at one end of a gap, searched outward from just inside the gap, past a
   * door leaf or the corner of a wall outline; null when no jamb (or a solid wall) is there.
   */
  const jambCentre = (inside: number, direction: -1 | 1) => {
    let first: number | null = null;
    let last = 0;
    for (let step = 0; step < strokes.heavy * 3; step++) {
      const along = inside + direction * step;
      if (fullBand(along)) {
        first ??= along;
        last = along;
        if (Math.abs(last - first) > strokes.heavy * 1.5) return null;
      } else if (first !== null) break;
    }
    return first === null ? null : (first + last) / 2 + 0.5;
  };
  // Measured jamb centre to jamb centre; without a jamb, half a wall pen beyond the gap's end.
  const candidates = runs.map((run) => {
    const jambs = [jambCentre(Math.round(run.start + strokes.heavy), -1), jambCentre(Math.round(run.end - 1 - strokes.heavy), 1)];
    const low = jambs[0] ?? run.start - strokes.heavy / 2;
    const high = jambs[1] ?? run.end + strokes.heavy / 2;
    return { ...run, width: high - low, centre: (low + high) / 2, jambs: jambs.filter((jamb) => jamb !== null).length };
  }).filter((run) => run.width >= px(OPENING_CM.min) && run.width <= px(OPENING_CM.maxWithPanel) && Math.abs(run.centre - near) <= px(MATCH_DISTANCE_CM) + Math.max(0, run.width / 2 - px(OPENING_CM.max) / 2))
    .sort((first, second) => Math.abs(first.centre - near) - Math.abs(second.centre - near));

  for (const run of candidates) {
    let kind: OpeningFinding["kind"] = "door";
    let outerEdge = line.face - line.interior * minimumStroke;
    if (line.farFace !== undefined) {
      const farRow = Math.round(line.farFace - 0.5);
      let farOpen = 0;
      for (let along = run.start; along < run.end; along++) if (![farRow - 1, farRow, farRow + 1].some((row) => ink(along, row))) farOpen++;
      // Glazing: columns of the opening with ink strictly between the two face strokes.
      const inside = [line.face, line.farFace].sort((first, second) => first - second);
      let glazed = 0;
      for (let along = run.start; along < run.end; along++) {
        for (let across = Math.round(inside[0] + minimumStroke); across <= Math.round(inside[1] - minimumStroke); across++) if (ink(along, across)) {
          glazed++;
          break;
        }
      }
      if (farOpen / (run.end - run.start) >= BOTH_FACES_SHARE && glazed / (run.end - run.start) >= GLAZING_SHARE) kind = "window";
      outerEdge = line.farFace - line.interior * minimumStroke;
    }
    if (kind === "window") {
      if (run.width <= px(OPENING_CM.max)) return { kind, centre: run.centre, width: run.width, swing: 0, jambs: run.jambs };
      continue;
    }
    const swingSize = Math.min(run.width, px(OPENING_CM.max));
    const innerEdge = line.face + line.interior * minimumStroke;
    const inkCount = (acrossFrom: number, acrossTo: number) => {
      const [low, high] = [Math.round(Math.min(acrossFrom, acrossTo)), Math.round(Math.max(acrossFrom, acrossTo))];
      let count = 0;
      for (let along = run.start; along < run.end; along++) for (let across = low; across <= high; across++) if (ink(along, across)) count++;
      return count;
    };
    const inward = inkCount(innerEdge, innerEdge + line.interior * swingSize);
    const outward = inkCount(outerEdge, outerEdge - line.interior * swingSize);
    const swing: OpeningFinding["swing"] = inward >= MIN_SWING_INK && inward >= outward * SWING_RATIO ? 1 : outward >= MIN_SWING_INK && outward >= inward * SWING_RATIO ? -1 : 0;
    // Two drawn jambs measure a door best. Otherwise its drawn leaf (a stroke from the hinge into the
    // swing side) is the door: in a wide opening it is the only door there is, and beside a fixed panel
    // the gap's far end is no jamb at all.
    if (run.jambs === 2 && run.width <= px(OPENING_CM.max)) return { kind, centre: run.centre, width: run.width, swing, jambs: run.jambs };
    const leaf = swing === 0 ? null : doorLeaf(run, swing === 1 ? innerEdge : outerEdge, swing === 1 ? line.interior : -line.interior);
    const leafFits = leaf !== null && (run.width > px(OPENING_CM.max) || (leaf.width >= run.width * LEAF_SHARE.min && leaf.width <= run.width * LEAF_SHARE.max));
    if (leaf && leafFits) return { kind, centre: leaf.centre, width: leaf.width, swing, jambs: run.jambs };
    if (run.width <= px(OPENING_CM.max)) return { kind, centre: run.centre, width: run.width, swing, jambs: run.jambs };
  }
  return null;

  function doorLeaf(run: Run, edge: number, direction: number): { centre: number; width: number } | null {
    // The longest stroke of leaf length; anything longer (a wall running into the room) is no leaf.
    let best: { hinge: number; length: number } | null = null;
    const slack = Math.round(strokes.heavy);
    for (let along = run.start - slack; along < run.end + slack; along++) {
      let length = 0;
      let across = Math.round(edge);
      while (length < px(LEAF_CM.max) + 2 && (ink(along, across) || ink(along, across + direction))) {
        length++;
        across += direction;
      }
      if (length >= px(LEAF_CM.min) && length <= px(LEAF_CM.max) && (!best || length > best.length)) best = { hinge: along, length };
    }
    if (!best) return null;
    // The leaf runs from the face's centre line to its tip, where the arc's stroke adds half a thin pen;
    // the door spans from the hinge to where the arc meets the wall.
    const width = best.length + Math.abs(edge - line.face) - strokes.thin / 2;
    const slackPx = px(SPAN_SLACK_CM);
    const fitsBefore = best.hinge - width >= run.start - slackPx - slack;
    const fitsAfter = best.hinge + width <= run.end + slackPx + slack;
    if (fitsBefore === fitsAfter) return null;
    return { centre: fitsBefore ? best.hinge - width / 2 : best.hinge + width / 2, width };
  }
}
