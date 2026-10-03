import type { RoomKind } from "../../types/domain";
import { FLOORPLAN_LIMITS, type AiDoor, type AiPlan, type AiRoom, type AiWindow } from "./ai-contract";
import { ROOM_KINDS } from "./names";

export type AiParseResult = { ok: true; plan: AiPlan; dropped: number } | { ok: false; errors: string[] };

const MAX_ERRORS = 10;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const coordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000;

/** The JSON object in a model's reply: code fences and any prose around the outermost braces are ignored. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(unfenced.slice(start, end + 1));
}

/**
 * Checks a model's reading strictly for rooms (a wrong room would mislead the whole trace) and
 * leniently for doors and windows (a bad one is dropped and counted). The error messages are written
 * for the model, so a corrective request can quote them.
 */
export function validateAiPlan(value: unknown): AiParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["The answer must be one JSON object."] };
  const rawRooms: unknown[] = Array.isArray(value.rooms) ? value.rooms : [];
  if (!Array.isArray(value.rooms) || rawRooms.length === 0) errors.push("\"rooms\" must be a non-empty array.");
  else if (rawRooms.length > FLOORPLAN_LIMITS.rooms) errors.push(`At most ${FLOORPLAN_LIMITS.rooms} rooms are allowed.`);
  const rooms: AiRoom[] = [];
  rawRooms.slice(0, FLOORPLAN_LIMITS.rooms).forEach((raw, index) => {
    const path = `rooms[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    if (!ROOM_KINDS.includes(raw.kind as RoomKind)) errors.push(`${path}.kind must be one of ${ROOM_KINDS.join(", ")}.`);
    const box = raw.box_2d;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(coordinate)) {
      errors.push(`${path}.box_2d must be [ymin, xmin, ymax, xmax] with numbers from 0 to 1000.`);
      return;
    }
    const [ymin, xmin, ymax, xmax] = box as number[];
    if (ymin >= ymax || xmin >= xmax) errors.push(`${path}.box_2d must have ymin < ymax and xmin < xmax.`);
    else if (ymax - ymin < FLOORPLAN_LIMITS.minimumSide || xmax - xmin < FLOORPLAN_LIMITS.minimumSide) errors.push(`${path}.box_2d is too small to be a room.`);
    const openTo = Array.isArray(raw.open_to) ? raw.open_to.filter((entry): entry is number => Number.isInteger(entry) && entry !== index && entry >= 0 && entry < rawRooms.length) : [];
    rooms.push({ kind: raw.kind as RoomKind, box_2d: [ymin, xmin, ymax, xmax], open_to: [...new Set(openTo)] });
  });
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  let dropped = 0;
  const doors: AiDoor[] = [];
  for (const raw of Array.isArray(value.doors) ? value.doors.slice(0, FLOORPLAN_LIMITS.doors) : []) {
    const center = isRecord(raw) ? raw.center : null;
    if (!Array.isArray(center) || center.length !== 2 || !center.every(coordinate)) {
      dropped++;
      continue;
    }
    const between = isRecord(raw) && Array.isArray(raw.between) && raw.between.length === 2 && raw.between.every((entry) => Number.isInteger(entry) && entry >= -1 && entry < rooms.length) ? raw.between as [number, number] : null;
    doors.push({ center: [center[0], center[1]], between });
  }
  const windows: AiWindow[] = [];
  for (const raw of Array.isArray(value.windows) ? value.windows.slice(0, FLOORPLAN_LIMITS.windows) : []) {
    const center = isRecord(raw) ? raw.center : null;
    const room = isRecord(raw) ? raw.room : null;
    if (!Array.isArray(center) || center.length !== 2 || !center.every(coordinate) || !Number.isInteger(room) || (room as number) < 0 || (room as number) >= rooms.length) {
      dropped++;
      continue;
    }
    windows.push({ center: [center[0], center[1]], room: room as number });
  }
  dropped += Math.max(0, (Array.isArray(value.doors) ? value.doors.length : 0) - FLOORPLAN_LIMITS.doors) + Math.max(0, (Array.isArray(value.windows) ? value.windows.length : 0) - FLOORPLAN_LIMITS.windows);
  const label = typeof value.flat_label === "string" && value.flat_label.trim().length > 0 ? value.flat_label.trim().slice(0, 20) : null;
  return { ok: true, plan: { flat_label: label, has_diagonal_walls: value.has_diagonal_walls === true, rooms, doors, windows }, dropped };
}

/** Parses a model's text reply into a checked plan. */
export function parseAiReply(text: string): AiParseResult {
  let value: unknown;
  try {
    value = extractJson(text);
  } catch {
    return { ok: false, errors: ["The answer did not contain a valid JSON object."] };
  }
  return validateAiPlan(value);
}
