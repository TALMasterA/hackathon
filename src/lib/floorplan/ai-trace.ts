import type { Box } from "../geometry/architecture";
import type { Position2D } from "../../types/domain";
import type { AiPlan } from "./ai-contract";
import { normalisedBox, normalisedPoint } from "./frames";
import type { SnapContext } from "./snap";
import type { TraceDoor, TracePlan, TraceWindow } from "./trace";
import { drawnWindows, nearestFace, roomAcross, scanOpenings, snapTraceRooms, type FaceHit, type ScannedOpening } from "./trace-snap";

/** Door default when the drawing shows no measurable gap: flagged for the user to check. */
export const AI_DEFAULT_DOOR_CM = 80;
export const AI_DEFAULT_WINDOW_CM = 120;
/** A model's door within this distance of a drawn opening is that opening. */
const AI_DOOR_MATCH_CM = 120;
/** A model door this close to one already placed is the same door. */
const DUPLICATE_DOOR_CM = 30;

const BOX_KEY = { top: "minZ", bottom: "maxZ", left: "minX", right: "maxX" } as const;

export interface AiTrace {
  plan: TracePlan;
  /** Rooms the model placed outside the user's box, left out. */
  outside: number;
  /** Doors the model placed where no fitting room face is, left out. */
  strayDoors: number;
  diagonal: boolean;
  label: string | null;
}

const distance = (first: Position2D, second: Position2D) => Math.hypot(first.x - second.x, first.z - second.z);
const doorFrom = (opening: ScannedOpening): Omit<TraceDoor, "id"> => ({ at: opening.at, width: opening.width, ...(opening.swingInto ? { swingInto: opening.swingInto } : {}) });

/**
 * Turns a model's reading of the analysed raster into a trace in centimetres. The model decides
 * which rooms there are and their kinds; the drawing decides everything measurable: rooms outside the
 * user's box are dropped, every room edge is snapped to the drawn walls, each model door becomes the
 * drawn opening nearest it, drawn doors between two rooms the model missed are added, and windows come
 * from the window walls and glazed gaps drawn (the model's windows only when the drawing shows none).
 */
export function traceFromAi(context: SnapContext, ai: AiPlan, raster: { width: number; height: number }, userBox?: Box): AiTrace {
  const cm = (value: number) => value * context.cmPerPx;
  const kept = ai.rooms.map((room, index) => ({ room, index, box: normalisedBox(room.box_2d, raster) })).filter(({ box }) => {
    if (!userBox) return true;
    const [x, y] = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
    return x >= userBox.minX && x <= userBox.maxX && y >= userBox.minZ && y <= userBox.maxZ;
  });
  const idOf = new Map(kept.map((entry, position) => [entry.index, `room-${position + 1}`]));
  const openPairs: [string, string][] = [];
  for (const entry of kept) {
    for (const other of entry.room.open_to) {
      const [first, second] = [idOf.get(entry.index), idOf.get(other)];
      if (first && second && !openPairs.some((pair) => pair.includes(first) && pair.includes(second))) openPairs.push([first, second]);
    }
  }
  const rooms = snapTraceRooms(context, kept.map(({ room, index, box }) => ({ id: idOf.get(index)!, kind: room.kind, box: { minX: cm(box.minX), maxX: cm(box.maxX), minZ: cm(box.minZ), maxZ: cm(box.maxZ) } })), openPairs);
  const plan: TracePlan = { rooms, openPairs, doors: [], windows: [] };
  let next = rooms.length + 1;
  const toCm = (point: readonly [number, number]): Position2D => {
    const pixel = normalisedPoint(point, raster);
    return { x: cm(pixel.x), z: cm(pixel.y) };
  };

  const scanned = scanOpenings(context, plan);
  const drawnDoors = scanned.filter((opening) => opening.kind === "door");
  // Each model door takes the nearest drawn opening that fits its hint (an entrance leads outside, an
  // inner door has a room on both sides), closest pairs first, so no door steals another's opening.
  const pairs = ai.doors.flatMap((door, index) => {
    const at = toCm(door.center);
    const outside = door.between ? door.between.includes(-1) : null;
    return drawnDoors.filter((opening) => outside === null || outside === !opening.acrossRoomId).map((opening) => ({ index, opening, distance: distance(opening.at, at) }));
  }).filter((pair) => pair.distance <= AI_DOOR_MATCH_CM).sort((first, second) => first.distance - second.distance);
  const matched = new Map<number, ScannedOpening>();
  const used = new Set<ScannedOpening>();
  for (const pair of pairs) {
    if (matched.has(pair.index) || used.has(pair.opening)) continue;
    matched.set(pair.index, pair.opening);
    used.add(pair.opening);
  }
  const doors: TraceDoor[] = [];
  ai.doors.forEach((_, index) => {
    const match = matched.get(index);
    if (match) doors.push({ ...doorFrom(match), id: `door-${next++}` });
  });
  // Model doors with no drawn opening keep their place on the nearest face, flagged, unless they
  // repeat a door already placed.
  let strayDoors = 0;
  ai.doors.forEach((door, index) => {
    if (matched.has(index)) return;
    const at = toCm(door.center);
    // Only a face that fits the model's hint: an outer wall for an entrance, a wall between the two named rooms otherwise.
    const between = door.between?.map((room) => room === -1 ? null : idOf.get(room) ?? undefined);
    const fits = (hit: FaceHit) => {
      if (!between) return true;
      const across = roomAcross(plan, hit.room, hit.side, hit.side === "top" || hit.side === "bottom" ? at.x : at.z)?.id ?? null;
      return between.includes(hit.room.id) && between.includes(across);
    };
    const face = nearestFace(plan, at, undefined, fits);
    if (!face) {
      strayDoors++;
      return;
    }
    const value = face.room.box[BOX_KEY[face.side]];
    const onFace = face.side === "top" || face.side === "bottom" ? { x: at.x, z: value } : { x: value, z: at.z };
    if (!doors.some((entry) => distance(entry.at, onFace) < DUPLICATE_DOOR_CM)) doors.push({ at: onFace, width: AI_DEFAULT_DOOR_CM, flagged: true, id: `door-${next++}` });
  });
  // Doors the model missed: only drawn openings between two traced rooms with a drawn swing or both
  // jambs. An opening to the outside is added only where the model put a door (one entrance).
  for (const opening of drawnDoors) {
    if (used.has(opening) || !opening.acrossRoomId || !(opening.swings || opening.jambs === 2)) continue;
    if (!doors.some((entry) => distance(entry.at, opening.at) < DUPLICATE_DOOR_CM)) doors.push({ ...doorFrom(opening), id: `door-${next++}` });
  }

  const found = drawnWindows(plan, scanned);
  const windows: TraceWindow[] = found.length > 0
    ? found.map((window) => ({ ...window, id: `window-${next++}` }))
    : ai.windows.flatMap((window) => {
      const roomId = idOf.get(window.room);
      const face = roomId ? nearestFace(plan, toCm(window.center)) : null;
      if (!roomId || !face) return [];
      const at = toCm(window.center);
      const value = face.room.box[BOX_KEY[face.side]];
      return [{ at: face.side === "top" || face.side === "bottom" ? { x: at.x, z: value } : { x: value, z: at.z }, width: AI_DEFAULT_WINDOW_CM, roomId, id: `window-${next++}` }];
    });
  return { plan: { ...plan, doors, windows }, outside: ai.rooms.length - kept.length, strayDoors, diagonal: ai.has_diagonal_walls, label: ai.flat_label };
}
