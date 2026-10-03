import type { Flat, FlatRoom, RoomKind, Wall } from "../../types/domain";

/** Test fixtures only: small hand-built flats in centimetres. */

function room(id: string, kind: RoomKind, minX: number, minZ: number, maxX: number, maxZ: number): FlatRoom {
  return { id, kind, name: { en: id, "zh-Hant": id }, position: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, width: maxX - minX, depth: maxZ - minZ, orientation: 0 };
}

function wall(id: string, start: [number, number], end: [number, number], outer: boolean, thickness = 10): Wall {
  return { id, name: { en: id, "zh-Hant": id }, start: { x: start[0], z: start[1] }, end: { x: end[0], z: end[1] }, thickness, outer };
}

/**
 * An L-shaped flat: living room and kitchen across the front, one bedroom behind the living room,
 * and an empty 210 × 310 cm notch behind the kitchen (x 420–630, z 320–630) that is not part of the flat.
 */
export const L_FLAT: Flat = {
  id: "test-l-flat",
  name: { en: "L-shaped test flat", "zh-Hant": "L 形測試單位" },
  width: 630,
  depth: 630,
  height: 260,
  minimumHeight: 220,
  maximumHeight: 350,
  dimensionSource: "user-traced",
  wallThickness: 10,
  rooms: [room("living", "living", 10, 10, 410, 310), room("bedroom", "bedroom", 10, 320, 410, 620), room("kitchen", "kitchen", 420, 10, 620, 310)],
  walls: [
    wall("front", [0, 5], [630, 5], true),
    wall("left", [5, 0], [5, 630], true),
    wall("kitchen-right", [625, 0], [625, 320], true),
    wall("middle", [10, 315], [410, 315], false),
    wall("kitchen-back", [410, 315], [630, 315], true),
    wall("living-kitchen", [415, 10], [415, 310], false),
    wall("bedroom-right", [415, 320], [415, 630], true),
    wall("back", [0, 625], [420, 625], true),
  ],
  doors: [
    { id: "entrance", name: { en: "Entrance", "zh-Hant": "大門" }, wallId: "front", position: { x: 200, z: 5 }, width: 90, swingRoomId: "living", connects: ["outside", "living"] },
    { id: "bedroom-door", name: { en: "Bedroom door", "zh-Hant": "睡房門" }, wallId: "middle", position: { x: 300, z: 315 }, width: 80, swingRoomId: "bedroom", connects: ["living", "bedroom"] },
    { id: "kitchen-door", name: { en: "Kitchen door", "zh-Hant": "廚房門" }, wallId: "living-kitchen", position: { x: 415, z: 200 }, width: 80, swingRoomId: "kitchen", connects: ["living", "kitchen"] },
  ],
  windows: [{ id: "bedroom-window", name: { en: "Bedroom window", "zh-Hant": "睡房窗" }, wallId: "back", roomId: "bedroom", position: { x: 210, z: 625 }, width: 150, sillHeight: 100, height: 90 }],
  trace: { sourceName: "test-plan.pdf", scaleMethod: "scale-bar", cmPerUnit: 7.138, readBy: "ai", model: "test-model", uncheckedEdges: 2 },
};
