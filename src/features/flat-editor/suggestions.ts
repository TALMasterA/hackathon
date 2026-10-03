import { FURNITURE_LIBRARY } from "../../data/flat-preset";
import { examplesForFlat } from "../../data/flat-scenarios";
import { analyzeLayout, issueItemIds } from "../../lib/geometry/layout";
import { normalizeAngle, polygonArea, polygonOutsideArea, rectanglePolygon } from "../../lib/geometry/oriented";
import { clockwise } from "../../lib/geometry/polygon";
import type { Flat, FlatFurniture, FlatRoom, FurnitureKind, FurnitureTemplate, LocalizedName, Position2D, RoomKind } from "../../types/domain";

/** One planned suggestion on a traced flat: a library template for one room, under a stable item ID. */
export interface SuggestionSlot {
  id: string;
  roomId: string;
  template: FurnitureTemplate;
  name: LocalizedName;
  againstWall: boolean;
}

/** One wall of a room: where it starts, which way it runs and which way is into the room. */
interface RoomWall {
  start: Position2D;
  direction: Position2D;
  inward: Position2D;
  length: number;
}

const WALL_CLEARANCE_CM = 1;
/** How much of an item may poke outside a shaped room through rounding, per cm of its edges. */
const INSIDE_SLACK_CM = 0.01;
const WALL_STEP_CM = 10;
const AGAINST_WALL = new Set<FurnitureKind>(["sofa", "tv-console", "bed", "wardrobe", "desk", "kitchen-counter", "fridge", "toilet", "vanity"]);

const ROOM_SETS: Record<RoomKind, readonly (readonly [templateId: string, count: number])[]> = {
  living: [["sofa", 1], ["coffee-table", 1], ["tv-console", 1], ["dining-table", 1], ["chair", 2]],
  bedroom: [["single-bed", 1], ["wardrobe", 1], ["desk", 1]],
  kitchen: [["kitchen-counter", 1], ["fridge", 1]],
  bathroom: [["toilet", 1], ["vanity", 1]],
  other: [],
};

/** A built-in flat (the demo or Harmony) offers the team's fixed placements instead of per-room-kind sets. */
export function isPresetFlat(flat: Pick<Flat, "id" | "dimensionSource">): boolean {
  return examplesForFlat(flat) !== undefined;
}

function template(id: string): FurnitureTemplate {
  const entry = FURNITURE_LIBRARY.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown furniture template: ${id}`);
  return entry;
}

/**
 * The per-room-kind sets offered on a traced flat: a double bed only in the largest bedroom, and a
 * single bed in the living room of a flat without any bedroom.
 */
export function suggestionSlots(flat: Pick<Flat, "rooms">): SuggestionSlot[] {
  const bedrooms = flat.rooms.filter((room) => room.kind === "bedroom");
  const area = (room: FlatRoom) => polygonArea(room.outline ?? rectanglePolygon(room));
  const largest = bedrooms.reduce<FlatRoom | null>((best, room) => !best || area(room) > area(best) ? room : best, null);
  return flat.rooms.flatMap((room) => {
    const set = [...ROOM_SETS[room.kind ?? "other"]].map(([id, count]) => [room === largest && id === "single-bed" ? "double-bed" : id, count] as const);
    if (room.kind === "living" && bedrooms.length === 0 && !flat.rooms.slice(0, flat.rooms.indexOf(room)).some((entry) => entry.kind === "living")) set.push(["single-bed", 1]);
    return set.flatMap(([templateId, count]) => Array.from({ length: count }, (_, index) => {
      const entry = template(templateId);
      const number = count > 1 ? index + 1 : null;
      return {
        id: number ? `${room.id}-${templateId}-${number}` : `${room.id}-${templateId}`,
        roomId: room.id,
        template: entry,
        name: number ? { en: `${entry.name.en} ${number}`, "zh-Hant": `${entry.name["zh-Hant"]} ${number}` } : { ...entry.name },
        againstWall: AGAINST_WALL.has(entry.kind),
      };
    }));
  });
}

/** IDs of every suggestion the flat offers, used to tell when all of them are already placed. */
export function suggestionIds(flat: Flat): string[] {
  return examplesForFlat(flat)?.map((item) => item.id) ?? suggestionSlots(flat).map((slot) => slot.id);
}

/**
 * A room's walls: a box room's in the order top, bottom, left, right (so equal walls keep that order);
 * a shaped room's along its outline.
 */
function roomWalls(room: FlatRoom): RoomWall[] {
  if (!room.outline) {
    const [minX, minZ, maxX, maxZ] = [room.position.x - room.width / 2, room.position.z - room.depth / 2, room.position.x + room.width / 2, room.position.z + room.depth / 2];
    return [
      { start: { x: minX, z: minZ }, direction: { x: 1, z: 0 }, inward: { x: 0, z: 1 }, length: room.width },
      { start: { x: minX, z: maxZ }, direction: { x: 1, z: 0 }, inward: { x: 0, z: -1 }, length: room.width },
      { start: { x: minX, z: minZ }, direction: { x: 0, z: 1 }, inward: { x: 1, z: 0 }, length: room.depth },
      { start: { x: maxX, z: minZ }, direction: { x: 0, z: 1 }, inward: { x: -1, z: 0 }, length: room.depth },
    ];
  }
  const outline = clockwise(room.outline);
  return outline.map((start, index) => {
    const end = outline[(index + 1) % outline.length];
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const direction = { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
    return { start, direction, inward: { x: -direction.z, z: direction.x }, length };
  });
}

/** Furniture fronts face local -Z at 0°, so an item backed against a wall turns its front to the wall's inward side. */
function facingInto(inward: Position2D): number {
  return Math.round(normalizeAngle(Math.atan2(inward.x, -inward.z) * 180 / Math.PI) * 1e6) / 1e6 % 360;
}

/** The direction an item's front faces at an orientation (0° faces -Z). */
const frontOf = (orientation: number): Position2D => {
  const radians = orientation * Math.PI / 180;
  return { x: Math.sin(radians), z: -Math.cos(radians) };
};

/** Positions along one wall, middle first, with the item's back against it. */
function wallPositions(wall: RoomWall, footprint: { width: number; depth: number }): Position2D[] {
  const from = footprint.width / 2 + WALL_CLEARANCE_CM;
  const to = wall.length - footprint.width / 2 - WALL_CLEARANCE_CM;
  if (from > to) return [];
  const across = footprint.depth / 2 + WALL_CLEARANCE_CM;
  const middle = (from + to) / 2;
  const along = [middle];
  for (let offset = WALL_STEP_CM; middle - offset >= from || middle + offset <= to; offset += WALL_STEP_CM) {
    if (middle - offset >= from) along.push(middle - offset);
    if (middle + offset <= to) along.push(middle + offset);
  }
  along.push(from, to);
  return along.map((value) => ({ x: wall.start.x + wall.direction.x * value + wall.inward.x * across, z: wall.start.z + wall.direction.z * value + wall.inward.z * across }));
}

/**
 * Wall-first probe: tries the room's walls longest first (or the wall facing a preferred way first),
 * placing the item with its back against the wall and its front into the room, and keeps the first
 * spot inside the room with no issue.
 */
export function placeAgainstWall(flat: Flat, furniture: readonly FlatFurniture[], entry: FurnitureTemplate, room: FlatRoom, id: string, preferred?: Position2D): FlatFurniture | null {
  const prefers = (wall: RoomWall) => preferred !== undefined && wall.inward.x * preferred.x + wall.inward.z * preferred.z > 0.99;
  const walls = roomWalls(room).map((wall, index) => ({ wall, index }))
    .sort((first, second) => Number(prefers(second.wall)) - Number(prefers(first.wall)) || second.wall.length - first.wall.length || first.index - second.index);
  for (const { wall } of walls) {
    for (const position of wallPositions(wall, entry)) {
      const item: FlatFurniture = { ...entry, id, roomId: room.id, position, orientation: facingInto(wall.inward), name: { ...entry.name } };
      if (room.outline && polygonOutsideArea(rectanglePolygon(item), room.outline) > INSIDE_SLACK_CM * (item.width + item.depth) * 2) continue;
      if (!analyzeLayout(flat, [...furniture, item], flat.height).some((issue) => issueItemIds(issue).includes(id))) return item;
    }
  }
  return null;
}

/** Which way the wall a TV console should try first faces: towards the room's suggested sofa, when there is one. */
export function preferredWall(slot: SuggestionSlot, furniture: readonly FlatFurniture[]): Position2D | undefined {
  if (slot.template.kind !== "tv-console") return undefined;
  const sofa = furniture.find((item) => item.id === `${slot.roomId}-sofa`);
  if (!sofa) return undefined;
  const front = frontOf(sofa.orientation);
  return { x: -front.x, z: -front.z };
}
