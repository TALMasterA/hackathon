import { FURNITURE_LIBRARY } from "../../data/flat-preset";
import { examplesForFlat } from "../../data/flat-scenarios";
import { rectangleBox, type Box } from "../../lib/geometry/architecture";
import { analyzeLayout, issueItemIds } from "../../lib/geometry/layout";
import type { Flat, FlatFurniture, FlatRoom, FurnitureKind, FurnitureTemplate, LocalizedName, Position2D, RoomKind } from "../../types/domain";

/** One planned suggestion on a traced flat: a library template for one room, under a stable item ID. */
export interface SuggestionSlot {
  id: string;
  roomId: string;
  template: FurnitureTemplate;
  name: LocalizedName;
  againstWall: boolean;
}

type WallSide = "top" | "bottom" | "left" | "right";

/** Furniture fronts face local -Z at 0°, so an item backed against a wall turns to face into the room. */
const SIDE_ORIENTATION: Record<WallSide, number> = { top: 180, bottom: 0, left: 90, right: 270 };
const OPPOSITE_SIDE: Record<WallSide, WallSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const ORIENTATION_SIDE = new Map(Object.entries(SIDE_ORIENTATION).map(([side, angle]) => [angle, side as WallSide]));
const WALL_CLEARANCE_CM = 1;
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
  const largest = bedrooms.reduce<FlatRoom | null>((best, room) => !best || room.width * room.depth > best.width * best.depth ? room : best, null);
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

/** Positions along one wall, middle first, with the item's back against the room edge. */
function wallPositions(room: Box, footprint: { width: number; depth: number }, side: WallSide): Position2D[] {
  const horizontal = side === "top" || side === "bottom";
  const [low, high] = horizontal ? [room.minX, room.maxX] : [room.minZ, room.maxZ];
  const from = low + footprint.width / 2 + WALL_CLEARANCE_CM;
  const to = high - footprint.width / 2 - WALL_CLEARANCE_CM;
  if (from > to) return [];
  const across = side === "top" ? room.minZ + footprint.depth / 2 + WALL_CLEARANCE_CM
    : side === "bottom" ? room.maxZ - footprint.depth / 2 - WALL_CLEARANCE_CM
    : side === "left" ? room.minX + footprint.depth / 2 + WALL_CLEARANCE_CM
    : room.maxX - footprint.depth / 2 - WALL_CLEARANCE_CM;
  const middle = (from + to) / 2;
  const along = [middle];
  for (let offset = WALL_STEP_CM; middle - offset >= from || middle + offset <= to; offset += WALL_STEP_CM) {
    if (middle - offset >= from) along.push(middle - offset);
    if (middle + offset <= to) along.push(middle + offset);
  }
  along.push(from, to);
  return along.map((value) => horizontal ? { x: value, z: across } : { x: across, z: value });
}

/**
 * Wall-first probe: tries the room's walls longest first (or a preferred wall first), placing the item
 * with its back against the wall and its front into the room, and keeps the first spot with no issue.
 */
export function placeAgainstWall(flat: Flat, furniture: readonly FlatFurniture[], entry: FurnitureTemplate, room: FlatRoom, id: string, preferred?: WallSide): FlatFurniture | null {
  const box = rectangleBox(room);
  const sides: WallSide[] = (["top", "bottom", "left", "right"] as const).map((side, index) => ({ side, index, length: side === "top" || side === "bottom" ? room.width : room.depth }))
    .sort((first, second) => Number(second.side === preferred) - Number(first.side === preferred) || second.length - first.length || first.index - second.index)
    .map(({ side }) => side);
  for (const side of sides) {
    for (const position of wallPositions(box, entry, side)) {
      const item: FlatFurniture = { ...entry, id, roomId: room.id, position, orientation: SIDE_ORIENTATION[side], name: { ...entry.name } };
      if (!analyzeLayout(flat, [...furniture, item], flat.height).some((issue) => issueItemIds(issue).includes(id))) return item;
    }
  }
  return null;
}

/** The wall a TV console should try first: the one facing the room's suggested sofa, when there is one. */
export function preferredWall(slot: SuggestionSlot, furniture: readonly FlatFurniture[]): WallSide | undefined {
  if (slot.template.kind !== "tv-console") return undefined;
  const sofa = furniture.find((item) => item.id === `${slot.roomId}-sofa`);
  const side = sofa && ORIENTATION_SIDE.get(sofa.orientation);
  return side ? OPPOSITE_SIDE[side] : undefined;
}
