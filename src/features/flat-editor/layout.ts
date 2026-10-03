import type { Flat, FlatFurniture, FurnitureTemplate, ItemChange, LayoutLocks, LayoutSnapshot, Position2D, SuggestionSkipReason } from "../../types/domain";
import { SUGGESTED_FURNITURE } from "../../data/flat-preset";
import { analyzeLayout, issueItemIds } from "../../lib/geometry/layout";
import { GEOMETRY_EPSILON_CM } from "../../lib/geometry/footprint";
import { distanceLockViolations } from "../../lib/geometry/locks";
import { normalizeAngle } from "../../lib/geometry/oriented";
import { isDemoFlat, placeAgainstWall, preferredWall, suggestionSlots } from "./suggestions";

export interface SuggestionResult {
  added: FlatFurniture[];
  skipped: { item: FlatFurniture; reason: SuggestionSkipReason }[];
}

/**
 * Adds example furniture to a room (or all rooms) without moving any existing furniture: the team's
 * fixed placements on the demo flat, or per-room-kind sets probed wall-first on a traced flat.
 */
export function suggestFurniture(flat: Flat, furniture: readonly FlatFurniture[], locks: LayoutLocks, roomId: string): SuggestionResult {
  const result: SuggestionResult = { added: [], skipped: [] };
  let layout = [...furniture];
  const add = (item: FlatFurniture) => {
    const next = [...layout, item];
    const issue = analyzeLayout(flat, next, flat.height).find((entry) => issueItemIds(entry).includes(item.id));
    const related = locks.distance.filter((lock) => (lock.firstId === item.id || lock.secondId === item.id) && [lock.firstId, lock.secondId].every((id) => next.some((entry) => entry.id === id)));
    const reason: SuggestionSkipReason | null = issue ? issue.code : distanceLockViolations(next, related).length > 0 ? "lock" : null;
    if (reason) result.skipped.push({ item, reason });
    else {
      result.added.push(item);
      layout = next;
    }
  };
  if (isDemoFlat(flat)) {
    for (const suggestion of SUGGESTED_FURNITURE.filter((entry) => roomId === "all" || entry.roomId === roomId)) {
      if (layout.some((entry) => entry.id === suggestion.id)) result.skipped.push({ item: suggestion, reason: "present" });
      else add({ ...suggestion, name: { ...suggestion.name }, position: { ...suggestion.position } });
    }
    return result;
  }
  for (const slot of suggestionSlots(flat).filter((entry) => roomId === "all" || entry.roomId === roomId)) {
    const room = flat.rooms.find((entry) => entry.id === slot.roomId)!;
    const nominal: FlatFurniture = { ...slot.template, id: slot.id, roomId: room.id, position: { ...room.position }, orientation: 0, name: slot.name };
    if (layout.some((entry) => entry.id === slot.id)) {
      result.skipped.push({ item: nominal, reason: "present" });
      continue;
    }
    const placed = (slot.againstWall ? placeAgainstWall(flat, layout, slot.template, room, slot.id, preferredWall(slot, layout)) : null) ?? placeLibraryItem(flat, layout, slot.template, room.id, slot.id);
    if (placed) add({ ...placed, name: slot.name });
    else add(nominal);
  }
  return result;
}

export function placeLibraryItem(flat: Flat, furniture: readonly FlatFurniture[], template: FurnitureTemplate, roomId: string, id: string): FlatFurniture | null {
  const room = flat.rooms.find((entry) => entry.id === roomId);
  if (!room || template.width > room.width || template.depth > room.depth) return null;
  const minX = room.position.x - room.width / 2 + template.width / 2;
  const maxX = room.position.x + room.width / 2 - template.width / 2;
  const minZ = room.position.z - room.depth / 2 + template.depth / 2;
  const maxZ = room.position.z + room.depth / 2 - template.depth / 2;
  const positions: Position2D[] = [{ ...room.position }];
  const horizontal: number[] = [];
  const vertical: number[] = [];
  for (let x = minX; x <= maxX; x += 20) horizontal.push(x);
  for (let z = minZ; z <= maxZ; z += 20) vertical.push(z);
  horizontal.push(maxX);
  vertical.push(maxZ);
  for (const x of horizontal) for (const z of vertical) positions.push({ x, z });
  positions.sort((first, second) => Math.hypot(first.x - room.position.x, first.z - room.position.z) - Math.hypot(second.x - room.position.x, second.z - room.position.z));

  for (const position of positions) {
    const item: FlatFurniture = { ...template, id, roomId, position, orientation: 0, name: { ...template.name } };
    const issues = analyzeLayout(flat, [...furniture, item], flat.height);
    if (!issues.some((issue) => issueItemIds(issue).includes(id))) return item;
  }
  return null;
}

export function itemChanges(baseline: LayoutSnapshot, current: LayoutSnapshot): Record<string, ItemChange[]> {
  const changes: Record<string, ItemChange[]> = {};
  for (const item of current.furniture) {
    const previous = baseline.furniture.find((entry) => entry.id === item.id);
    if (!previous) {
      changes[item.id] = ["added"];
      continue;
    }
    const flags: ItemChange[] = [];
    if (Math.hypot(item.position.x - previous.position.x, item.position.z - previous.position.z) > GEOMETRY_EPSILON_CM) flags.push("moved");
    const angle = Math.abs(normalizeAngle(item.orientation) - normalizeAngle(previous.orientation));
    if (Math.min(angle, 360 - angle) > GEOMETRY_EPSILON_CM) flags.push("rotated");
    if ((["width", "depth", "height"] as const).some((field) => Math.abs(item[field] - previous[field]) > GEOMETRY_EPSILON_CM)) flags.push("resized");
    if (item.kind !== previous.kind || item.name.en !== previous.name.en || item.name["zh-Hant"] !== previous.name["zh-Hant"]) flags.push("replaced");
    if (flags.length > 0) changes[item.id] = flags;
  }
  for (const previous of baseline.furniture) if (!current.furniture.some((item) => item.id === previous.id)) changes[previous.id] = ["removed"];
  return changes;
}