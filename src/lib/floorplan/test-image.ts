import { createGrayImage, type GrayImage } from "./image";

/**
 * Test fixtures only: synthetic floor-plan drawings with exact, anti-aliased geometry, so tests can
 * check sub-pixel results. Coordinates are continuous: pixel (x, y) covers [x, x + 1) × [y, y + 1).
 */

export function blankPlan(width: number, height: number): GrayImage {
  return createGrayImage(width, height);
}

/** Darkens an axis-aligned rectangle, shading edge pixels by the fraction of them it covers. */
export function fillRect(image: GrayImage, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(image.height, Math.ceil(y1)); y++) {
    const coverY = Math.min(y + 1, y1) - Math.max(y, y0);
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(image.width, Math.ceil(x1)); x++) {
      const cover = coverY * (Math.min(x + 1, x1) - Math.max(x, x0));
      const index = y * image.width + x;
      image.data[index] = Math.round(Math.max(0, image.data[index] - 255 * cover));
    }
  }
}

/** A horizontal stroke centred on y. */
export function hLine(image: GrayImage, y: number, x0: number, x1: number, width: number): void {
  fillRect(image, x0, y - width / 2, x1, y + width / 2);
}

/** A vertical stroke centred on x. */
export function vLine(image: GrayImage, x: number, y0: number, y1: number, width: number): void {
  fillRect(image, x - width / 2, y0, x + width / 2, y1);
}

export interface WallDrawing {
  /** "h" runs along x at y = centre; "v" runs along y at x = centre. */
  orientation: "h" | "v";
  centre: number;
  from: number;
  to: number;
  /** Distance between the two face lines' centres. */
  thickness: number;
  line: number;
  /** Door or window openings along the wall, closed by jamb lines. */
  gaps?: readonly (readonly [number, number])[];
  /** Openings that hold a window: thin glazing lines inside the wall. */
  glazing?: readonly (readonly [number, number])[];
  thinLine?: number;
}

/** A CAD-style wall: two face strokes, broken at openings with jamb lines, glazing inside windows. */
export function drawWall(image: GrayImage, wall: WallDrawing): void {
  const faces = [wall.centre - wall.thickness / 2, wall.centre + wall.thickness / 2];
  const pieces: [number, number][] = [];
  let cursor = wall.from;
  for (const [start, end] of [...(wall.gaps ?? [])].sort((first, second) => first[0] - second[0])) {
    if (start > cursor) pieces.push([cursor, start]);
    cursor = end;
  }
  if (cursor < wall.to) pieces.push([cursor, wall.to]);
  const stroke = (across: number, from: number, to: number, width: number) => wall.orientation === "h" ? hLine(image, across, from, to, width) : vLine(image, across, from, to, width);
  const jamb = (along: number) => wall.orientation === "h" ? vLine(image, along, faces[0], faces[1], wall.line) : hLine(image, along, faces[0], faces[1], wall.line);
  for (const face of faces) for (const [from, to] of pieces) stroke(face, from, to, wall.line);
  // Jamb strokes are centred on the wall ends, as CAD draws the boundary line of each wall end.
  for (const [start, end] of wall.gaps ?? []) {
    jamb(start);
    jamb(end);
  }
  const thin = wall.thinLine ?? Math.max(1, wall.line / 4);
  for (const [start, end] of wall.glazing ?? []) for (const offset of [-wall.thickness / 6, 0, wall.thickness / 6]) stroke(wall.centre + offset, start, end, thin);
}

/** A door leaf and quarter-circle swing drawn on one side of a wall opening, as thin strokes. */
export function drawDoorSwing(image: GrayImage, orientation: "h" | "v", face: number, from: number, to: number, side: 1 | -1, line: number): void {
  const width = to - from;
  const steps = Math.ceil(width * 2);
  for (let step = 0; step <= steps; step++) {
    const angle = (step / steps) * Math.PI / 2;
    const along = from + width * Math.cos(angle);
    const across = face + side * width * Math.sin(angle);
    if (orientation === "h") fillRect(image, along - line / 2, across - line / 2, along + line / 2, across + line / 2);
    else fillRect(image, across - line / 2, along - line / 2, across + line / 2, along + line / 2);
  }
  if (orientation === "h") vLine(image, from, Math.min(face, face + side * width), Math.max(face, face + side * width), line);
  else hLine(image, from, Math.min(face, face + side * width), Math.max(face, face + side * width), line);
}

/** A line segment of any angle, supersampled 4 × 4 per pixel. */
export function drawSegment(image: GrayImage, x0: number, y0: number, x1: number, y1: number, width: number): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const [ux, uy] = [(x1 - x0) / length, (y1 - y0) / length];
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - width));
  const maxX = Math.min(image.width, Math.ceil(Math.max(x0, x1) + width));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - width));
  const maxY = Math.min(image.height, Math.ceil(Math.max(y0, y1) + width));
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      let inside = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const [px, py] = [x + (sx + 0.5) / 4 - x0, y + (sy + 0.5) / 4 - y0];
        const along = px * ux + py * uy;
        if (along >= 0 && along <= length && Math.abs(px * -uy + py * ux) <= width / 2) inside++;
      }
      const index = y * image.width + x;
      image.data[index] = Math.round(Math.max(0, image.data[index] - 255 * inside / 16));
    }
  }
}
