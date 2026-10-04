import { containingRoom, wallDirection } from "../../lib/geometry/architecture";
import { analyzeLayout } from "../../lib/geometry/layout";
import { clipPolygon, polygonArea, polygonBounds, polygonTriangles, rectanglePolygon } from "../../lib/geometry/oriented";
import type { Door, Flat, FlatFurniture, FlatRoom, LayoutLocks, LayoutSnapshot, LayoutViolation, Position2D } from "../../types/domain";
import { layoutRevision } from "../flat-editor/revision";
import type { DesignSession, PreferenceEntry, ZoneDepth, ZoneRef } from "./types";

/** An item may poke outside its room by this much per cm of its edges (rounding), as for suggestions. */
export const INSIDE_SLACK_CM = 0.01;

export interface RoomShape {
  room: FlatRoom;
  polygon: Position2D[];
  bounds: ReturnType<typeof polygonBounds>;
  /** Triangles of a shaped room, for measuring how much of a footprint lies outside it; null for a box room. */
  triangles: Position2D[][] | null;
}

export interface LayoutContext {
  flat: Flat;
  shape: RoomShape;
  /** The layout proposals start from: the session's baseline, or the committed layout before a session. */
  furniture: readonly FlatFurniture[];
  ceilingHeight: number;
  roomItems: FlatFurniture[];
  /** Items that may move and turn. */
  movable: string[];
  /** Position-locked items: they may only turn, as the existing lock allows. */
  rotationOnly: string[];
  /** Items whose room is unclear; never moved automatically. */
  excluded: { id: string; reason: "membership" }[];
  doors: Door[];
  locks: LayoutLocks;
  revision: string;
  baselineIssues: LayoutViolation[];
  preferences: PreferenceEntry[];
}

export function roomShape(room: FlatRoom): RoomShape {
  const polygon = room.outline ? [...room.outline] : rectanglePolygon(room);
  return { room, polygon, bounds: polygonBounds(polygon), triangles: room.outline ? polygonTriangles(room.outline) : null };
}

/** Floor area of a convex footprint outside the room, in cm². */
export function outsideRoomArea(shape: RoomShape, footprint: readonly Position2D[]): number {
  if (!shape.triangles) {
    const room = rectanglePolygon(shape.room);
    return Math.max(0, polygonArea(footprint) - polygonArea(clipPolygon(footprint, room)));
  }
  const inside = shape.triangles.reduce((area, triangle) => area + polygonArea(clipPolygon(footprint, triangle)), 0);
  return Math.max(0, polygonArea(footprint) - inside);
}

/** True when a footprint lies inside the room, with the same rounding slack the suggestions use. */
export function insideRoom(shape: RoomShape, footprint: readonly Position2D[], item: { width: number; depth: number }): boolean {
  const bounds = polygonBounds(footprint);
  const slack = INSIDE_SLACK_CM * (item.width + item.depth) * 2;
  if (!shape.triangles && shape.room.orientation === 0) {
    return bounds.minX >= shape.bounds.minX - slack && bounds.maxX <= shape.bounds.maxX + slack && bounds.minZ >= shape.bounds.minZ - slack && bounds.maxZ <= shape.bounds.maxZ + slack;
  }
  return outsideRoomArea(shape, footprint) <= slack;
}

/**
 * The room's side of a door: +1 or -1 along the wall's left normal, or null when the door does not
 * open onto this room. The door is projected onto its wall's centre line first.
 */
function doorSide(flat: Flat, door: Door, shape: RoomShape): { centre: Position2D; direction: Position2D; normal: Position2D; offset: number } | null {
  const wall = flat.walls.find((entry) => entry.id === door.wallId);
  if (!wall) return null;
  const direction = wallDirection(wall);
  const along = (door.position.x - wall.start.x) * direction.x + (door.position.z - wall.start.z) * direction.z;
  const centre = { x: wall.start.x + direction.x * along, z: wall.start.z + direction.z * along };
  const normal = { x: -direction.z, z: direction.x };
  const probe = wall.thickness / 2 + 2;
  for (const sign of [1, -1]) {
    const point = { x: centre.x + normal.x * probe * sign, z: centre.z + normal.z * probe * sign };
    if (containingRoom(flat, point)?.id === shape.room.id) return { centre, direction, normal: { x: normal.x * sign, z: normal.z * sign }, offset: wall.thickness / 2 };
  }
  return null;
}

/** Doors with an approach on this room's side, in the flat's order. */
export function roomDoors(flat: Flat, shape: RoomShape): Door[] {
  return flat.doors.filter((door) => doorSide(flat, door, shape) !== null);
}

/** The door's width by the chosen depth, on this room's side of the wall. */
export function doorApproachZone(flat: Flat, door: Door, shape: RoomShape, depth: ZoneDepth | number): Position2D[] | null {
  const side = doorSide(flat, door, shape);
  if (!side) return null;
  const distance = side.offset + depth / 2;
  return rectanglePolygon({ width: door.width, depth, position: { x: side.centre.x + side.normal.x * distance, z: side.centre.z + side.normal.z * distance }, orientation: Math.atan2(side.direction.z, side.direction.x) * 180 / Math.PI });
}

/** The item's width by the chosen depth, in front of its front face (local -Z), wherever the item stands. */
export function itemFrontZone(item: FlatFurniture, depth: ZoneDepth | number): Position2D[] {
  const radians = item.orientation * Math.PI / 180;
  const distance = item.depth / 2 + depth / 2;
  return rectanglePolygon({ width: item.width, depth, position: { x: item.position.x + Math.sin(radians) * distance, z: item.position.z - Math.cos(radians) * distance }, orientation: item.orientation });
}

export function zonePolygon(flat: Flat, shape: RoomShape, zone: ZoneRef, furniture: readonly FlatFurniture[]): Position2D[] | null {
  if (zone.kind === "door") {
    const door = flat.doors.find((entry) => entry.id === zone.doorId);
    return door ? doorApproachZone(flat, door, shape, zone.depth) : null;
  }
  const item = furniture.find((entry) => entry.id === zone.itemId);
  return item ? itemFrontZone(item, zone.depth) : null;
}

/** Room membership as stored on the item and as its centre says; items where the two disagree are ambiguous. */
function membership(flat: Flat, item: FlatFurniture): string | null {
  const contained = containingRoom(flat, item.position)?.id ?? null;
  return contained === item.roomId ? item.roomId : null;
}

/**
 * getLayoutContext: what a design round works from. The room and its items, which items may move
 * (position locks allow turning only; unclear room membership excludes an item), the doors with an
 * approach in this room, current constraints and revision, and warnings already in the layout.
 */
export function getLayoutContext(editor: { flat: Flat; current: LayoutSnapshot; locks: LayoutLocks }, roomId: string, session?: DesignSession | null): LayoutContext | null {
  const room = editor.flat.rooms.find((entry) => entry.id === roomId);
  if (!room) return null;
  const layout = session ? session.baseline : editor.current;
  const locks = session ? session.locks : editor.locks;
  const flat = { ...editor.flat, height: layout.ceilingHeight };
  const shape = roomShape(room);
  const roomItems = layout.furniture.filter((item) => item.roomId === room.id || containingRoom(flat, item.position)?.id === room.id);
  const excluded = roomItems.filter((item) => membership(flat, item) !== room.id).map((item) => ({ id: item.id, reason: "membership" as const }));
  const usable = roomItems.filter((item) => !excluded.some((entry) => entry.id === item.id));
  return {
    flat,
    shape,
    furniture: layout.furniture,
    ceilingHeight: layout.ceilingHeight,
    roomItems: usable,
    movable: usable.filter((item) => !locks.position.includes(item.id)).map((item) => item.id),
    rotationOnly: usable.filter((item) => locks.position.includes(item.id)).map((item) => item.id),
    excluded,
    doors: roomDoors(flat, shape),
    locks,
    revision: layoutRevision(editor.flat.id, editor.current, editor.locks),
    baselineIssues: analyzeLayout(flat, layout.furniture, layout.ceilingHeight),
    preferences: session?.preferences ?? [],
  };
}
