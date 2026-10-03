import type { Door, Flat, FlatRoom, FlatTrace, FlatWindow, LocalizedName, Position2D, RoomKind, Wall } from "../../types/domain";

export const FLAT_FILE_FORMAT = "fitin-flat";
export const FLAT_FILE_VERSION = 1;
export const FLAT_FILE_MAX_BYTES = 1_000_000;
/** No Hong Kong flat comes close; anything larger is a scale mistake, not a home. */
export const FLAT_MAX_SIZE_CM = 3000;
const MAX_WALL_THICKNESS_CM = 80;
const MAX_ENTRIES = 200;
const NAME_MAX = 80;
const POSITION_TOLERANCE_CM = 0.01;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ROOM_KINDS: readonly RoomKind[] = ["living", "bedroom", "kitchen", "bathroom", "other"];

export type FlatFileError = "too-large" | "not-json" | "format" | "invalid";
export type FlatFileResult = { ok: true; flat: Flat } | { ok: false; error: FlatFileError; detail?: string };

/** The flat's geometry and names only; the floor-plan picture it was traced from is never included. */
export function serializeFlat(flat: Flat): string {
  return JSON.stringify({ format: FLAT_FILE_FORMAT, version: FLAT_FILE_VERSION, flat: readFlat(flat) }, null, 2);
}

export function flatFileName(flat: Flat): string {
  const slug = flat.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "flat";
  return `${slug}.fitin-flat.json`;
}

class FlatFileProblem extends Error {
  constructor(readonly path: string) {
    super(path);
  }
}

type Json = Record<string, unknown>;

function record(value: unknown, path: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new FlatFileProblem(path);
  return value as Json;
}

function list(value: unknown, path: string, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_ENTRIES) throw new FlatFileProblem(path);
  return value;
}

function number(value: unknown, path: string, minimum = -Infinity, maximum = Infinity, exclusiveMinimum = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value > maximum || (exclusiveMinimum ? value <= minimum : value < minimum)) throw new FlatFileProblem(path);
  return value;
}

function text(value: unknown, path: string, maximum = NAME_MAX): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new FlatFileProblem(path);
  return value;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value) || value === "outside") throw new FlatFileProblem(path);
  return value;
}

function localized(value: unknown, path: string): LocalizedName {
  const entry = record(value, path);
  return { en: text(entry.en, `${path}.en`), "zh-Hant": text(entry["zh-Hant"], `${path}.zh-Hant`) };
}

function point(value: unknown, path: string): Position2D {
  const entry = record(value, path);
  return { x: number(entry.x, `${path}.x`, -FLAT_MAX_SIZE_CM, FLAT_MAX_SIZE_CM * 2), z: number(entry.z, `${path}.z`, -FLAT_MAX_SIZE_CM, FLAT_MAX_SIZE_CM * 2) };
}

function unique<T extends { id: string }>(entries: T[], path: string): T[] {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.id)) throw new FlatFileProblem(`${path}[${index}].id`);
    seen.add(entry.id);
  });
  return entries;
}

/** Position of an opening along its wall, or a problem when it is off the wall's line or overhangs it. */
function onWall(wall: Wall, position: Position2D, width: number, path: string): void {
  const alongX = wall.start.z === wall.end.z;
  const across = alongX ? position.z - wall.start.z : position.x - wall.start.x;
  const along = alongX ? position.x : position.z;
  const [from, to] = alongX ? [wall.start.x, wall.end.x] : [wall.start.z, wall.end.z];
  if (Math.abs(across) > POSITION_TOLERANCE_CM) throw new FlatFileProblem(`${path}.position`);
  if (along - width / 2 < from - POSITION_TOLERANCE_CM || along + width / 2 > to + POSITION_TOLERANCE_CM) throw new FlatFileProblem(`${path}.width`);
}

function readTrace(value: unknown): FlatTrace | undefined {
  if (value === undefined) return undefined;
  const entry = record(value, "flat.trace");
  const scaleMethod = entry.scaleMethod;
  const readBy = entry.readBy;
  if (scaleMethod !== "scale-bar" && scaleMethod !== "known-length") throw new FlatFileProblem("flat.trace.scaleMethod");
  if (readBy !== "ai" && readBy !== "manual") throw new FlatFileProblem("flat.trace.readBy");
  const uncheckedEdges = number(entry.uncheckedEdges, "flat.trace.uncheckedEdges", 0, 10_000);
  if (!Number.isInteger(uncheckedEdges)) throw new FlatFileProblem("flat.trace.uncheckedEdges");
  return {
    sourceName: text(entry.sourceName, "flat.trace.sourceName", 200),
    scaleMethod,
    cmPerUnit: number(entry.cmPerUnit, "flat.trace.cmPerUnit", 0, 1000, true),
    readBy,
    ...(entry.model === undefined ? {} : { model: text(entry.model, "flat.trace.model", 120) }),
    uncheckedEdges,
  };
}

/**
 * Rebuilds a flat from untrusted JSON, keeping only known fields and checking that every reference,
 * wall and opening is consistent, so a file can never put the editor into a state it cannot draw.
 */
export function readFlat(value: unknown): Flat {
  const entry = record(value, "flat");
  const width = number(entry.width, "flat.width", 0, FLAT_MAX_SIZE_CM, true);
  const depth = number(entry.depth, "flat.depth", 0, FLAT_MAX_SIZE_CM, true);
  const minimumHeight = number(entry.minimumHeight, "flat.minimumHeight", 0, 1000, true);
  const maximumHeight = number(entry.maximumHeight, "flat.maximumHeight", minimumHeight, 1000);
  const height = number(entry.height, "flat.height", minimumHeight, maximumHeight);
  const dimensionSource = entry.dimensionSource;
  if (dimensionSource !== "team-demo-assumptions" && dimensionSource !== "user-traced") throw new FlatFileProblem("flat.dimensionSource");
  const inside = (box: { minX: number; maxX: number; minZ: number; maxZ: number }, path: string, margin = 0) => {
    if (box.minX < -margin - POSITION_TOLERANCE_CM || box.minZ < -margin - POSITION_TOLERANCE_CM || box.maxX > width + margin + POSITION_TOLERANCE_CM || box.maxZ > depth + margin + POSITION_TOLERANCE_CM) throw new FlatFileProblem(path);
  };

  const rooms = unique(list(entry.rooms, "flat.rooms", 1).map((raw, index): FlatRoom => {
    const path = `flat.rooms[${index}]`;
    const room = record(raw, path);
    if (room.orientation !== 0) throw new FlatFileProblem(`${path}.orientation`);
    if (room.kind !== undefined && !ROOM_KINDS.includes(room.kind as RoomKind)) throw new FlatFileProblem(`${path}.kind`);
    const parsed: FlatRoom = { id: id(room.id, `${path}.id`), name: localized(room.name, `${path}.name`), ...(room.kind === undefined ? {} : { kind: room.kind as RoomKind }), position: point(room.position, `${path}.position`), width: number(room.width, `${path}.width`, 0, FLAT_MAX_SIZE_CM, true), depth: number(room.depth, `${path}.depth`, 0, FLAT_MAX_SIZE_CM, true), orientation: 0 };
    inside({ minX: parsed.position.x - parsed.width / 2, maxX: parsed.position.x + parsed.width / 2, minZ: parsed.position.z - parsed.depth / 2, maxZ: parsed.position.z + parsed.depth / 2 }, `${path}.position`);
    return parsed;
  }), "flat.rooms");

  const walls = unique(list(entry.walls, "flat.walls").map((raw, index): Wall => {
    const path = `flat.walls[${index}]`;
    const wall = record(raw, path);
    if (typeof wall.outer !== "boolean") throw new FlatFileProblem(`${path}.outer`);
    const parsed: Wall = { id: id(wall.id, `${path}.id`), name: localized(wall.name, `${path}.name`), start: point(wall.start, `${path}.start`), end: point(wall.end, `${path}.end`), thickness: number(wall.thickness, `${path}.thickness`, 0, MAX_WALL_THICKNESS_CM, true), outer: wall.outer };
    const alongX = parsed.start.z === parsed.end.z;
    const alongZ = parsed.start.x === parsed.end.x;
    // wallParts walks from start to end, so a wall must be axis-aligned and run in the positive direction.
    if (alongX === alongZ || (alongX ? parsed.start.x >= parsed.end.x : parsed.start.z >= parsed.end.z)) throw new FlatFileProblem(`${path}.end`);
    const half = parsed.thickness / 2;
    inside(alongX ? { minX: parsed.start.x, maxX: parsed.end.x, minZ: parsed.start.z - half, maxZ: parsed.start.z + half } : { minX: parsed.start.x - half, maxX: parsed.start.x + half, minZ: parsed.start.z, maxZ: parsed.end.z }, path);
    return parsed;
  }), "flat.walls");

  const roomIds = new Set(rooms.map((room) => room.id));
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const wallFor = (value: unknown, path: string) => {
    const wall = wallById.get(id(value, path));
    if (!wall) throw new FlatFileProblem(path);
    return wall;
  };
  const roomRef = (value: unknown, path: string, allowOutside = false) => {
    if (allowOutside && value === "outside") return "outside";
    const roomId = id(value, path);
    if (!roomIds.has(roomId)) throw new FlatFileProblem(path);
    return roomId;
  };

  const doors = unique(list(entry.doors, "flat.doors").map((raw, index): Door => {
    const path = `flat.doors[${index}]`;
    const door = record(raw, path);
    const wall = wallFor(door.wallId, `${path}.wallId`);
    const connects = list(door.connects, `${path}.connects`, 2);
    if (connects.length !== 2) throw new FlatFileProblem(`${path}.connects`);
    const parsed: Door = { id: id(door.id, `${path}.id`), name: localized(door.name, `${path}.name`), wallId: wall.id, position: point(door.position, `${path}.position`), width: number(door.width, `${path}.width`, 0, 300, true), swingRoomId: roomRef(door.swingRoomId, `${path}.swingRoomId`), connects: [roomRef(connects[0], `${path}.connects[0]`, true), roomRef(connects[1], `${path}.connects[1]`, true)] };
    onWall(wall, parsed.position, parsed.width, path);
    return parsed;
  }), "flat.doors");

  const windows = unique(list(entry.windows, "flat.windows").map((raw, index): FlatWindow => {
    const path = `flat.windows[${index}]`;
    const window = record(raw, path);
    const wall = wallFor(window.wallId, `${path}.wallId`);
    const parsed: FlatWindow = { id: id(window.id, `${path}.id`), name: localized(window.name, `${path}.name`), wallId: wall.id, roomId: roomRef(window.roomId, `${path}.roomId`), position: point(window.position, `${path}.position`), width: number(window.width, `${path}.width`, 0, FLAT_MAX_SIZE_CM, true), sillHeight: number(window.sillHeight, `${path}.sillHeight`, 0, 1000), height: number(window.height, `${path}.height`, 0, 1000, true) };
    onWall(wall, parsed.position, parsed.width, path);
    return parsed;
  }), "flat.windows");

  const trace = readTrace(entry.trace);
  return {
    id: id(entry.id, "flat.id"),
    name: localized(entry.name, "flat.name"),
    width,
    depth,
    height,
    minimumHeight,
    maximumHeight,
    dimensionSource,
    wallThickness: number(entry.wallThickness, "flat.wallThickness", 0, MAX_WALL_THICKNESS_CM, true),
    rooms,
    walls,
    doors,
    windows,
    ...(trace ? { trace } : {}),
  };
}

export function parseFlatFile(content: string): FlatFileResult {
  if (content.length > FLAT_FILE_MAX_BYTES) return { ok: false, error: "too-large" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "not-json" };
  }
  if (typeof parsed !== "object" || parsed === null || (parsed as Json).format !== FLAT_FILE_FORMAT || (parsed as Json).version !== FLAT_FILE_VERSION) return { ok: false, error: "format" };
  try {
    return { ok: true, flat: readFlat((parsed as Json).flat) };
  } catch (error) {
    if (error instanceof FlatFileProblem) return { ok: false, error: "invalid", detail: error.path };
    throw error;
  }
}
