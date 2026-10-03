import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { rectangleBox } from "../geometry/architecture";
import type { Position2D } from "../../types/domain";
import { buildFlat } from "./build";
import { roomIdentities } from "./names";
import { edges, type TracePlan } from "./trace";

const OFFSET = { x: 1000, z: 500 };
const moved = (point: Position2D): Position2D => ({ x: point.x + OFFSET.x, z: point.z + OFFSET.z });
const META = { name: { en: "Traced", "zh-Hant": "描畫" }, ceilingHeight: 260, trace: { sourceName: "plan.pdf", scaleMethod: "scale-bar" as const, cmPerUnit: 7.1, readBy: "manual" as const }, defaultOuter: 10 };

/** The demo flat re-traced 10 m right and 5 m back: rooms, doors and windows only, walls left to the builder. */
function demoTrace(): TracePlan {
  return {
    rooms: DEMO_FLAT.rooms.map((room) => {
      const box = rectangleBox(room);
      return { id: `t-${room.id}`, kind: room.kind!, box: { minX: box.minX + OFFSET.x, maxX: box.maxX + OFFSET.x, minZ: box.minZ + OFFSET.z, maxZ: box.maxZ + OFFSET.z }, edges: edges("verified", 10) };
    }),
    openPairs: [],
    doors: DEMO_FLAT.doors.map((door) => ({ id: door.id, at: moved(door.position), width: door.width, swingInto: `t-${door.swingRoomId}` })),
    windows: DEMO_FLAT.windows.map((window) => ({ id: window.id, at: moved(window.position), width: window.width, roomId: `t-${window.roomId}` })),
  };
}

const issueCodes = (plan: TracePlan, meta = {}) => buildFlat(plan, { ...META, ...meta }).issues.map((issue) => [issue.code, issue.severity]);

describe("building a flat from a trace", () => {
  it("rebuilds the demo flat's geometry at the origin with traced names", () => {
    const { flat, issues } = buildFlat(demoTrace(), META);
    expect(issues).toEqual([]);
    expect(flat).not.toBeNull();
    expect([flat!.width, flat!.depth]).toEqual([660, 640]);
    expect(flat!.rooms.map((room) => [room.id, room.name.en, room.position])).toEqual([
      ["living", "Living / dining room", { x: 215, z: 170 }],
      ["bedroom-1", "Bedroom 1", { x: 167.5, z: 485 }],
      ["bedroom-2", "Bedroom 2", { x: 492.5, z: 485 }],
      ["kitchen", "Kitchen", { x: 540, z: 97.5 }],
      ["bathroom", "Bathroom", { x: 540, z: 262.5 }],
    ]);
    const walls = (list: typeof DEMO_FLAT.walls) => list.map(({ start, end, thickness, outer }) => JSON.stringify({ start, end, thickness, outer })).sort();
    expect(walls(flat!.walls)).toEqual(walls(DEMO_FLAT.walls));
    expect(flat!.doors.map((door) => [door.id, door.position, door.connects, door.swingRoomId, door.name.en])).toEqual([
      ["front-door", { x: 365, z: 5 }, ["outside", "living"], "living", "Entrance door"],
      ["kitchen-door", { x: 425, z: 110 }, ["living", "kitchen"], "kitchen", "Kitchen door"],
      ["bathroom-door", { x: 425, z: 260 }, ["living", "bathroom"], "bathroom", "Bathroom door"],
      ["master-door", { x: 245, z: 335 }, ["living", "bedroom-1"], "bedroom-1", "Bedroom 1 door"],
      ["second-door", { x: 377.5, z: 335 }, ["living", "bedroom-2"], "bedroom-2", "Bedroom 2 door"],
    ]);
    expect(flat!.windows.map((window) => [window.position, window.roomId, window.sillHeight])).toEqual(DEMO_FLAT.windows.map((window) => [window.position, ({ master: "bedroom-1", second: "bedroom-2" } as Record<string, string>)[window.roomId] ?? window.roomId, window.sillHeight]));
    expect(flat).toMatchObject({ dimensionSource: "user-traced", minimumHeight: 220, maximumHeight: 350, wallThickness: 10, trace: { readBy: "manual", uncheckedEdges: 0 } });
  });

  it("numbers repeated room kinds in both languages", () => {
    expect(roomIdentities([{ kind: "bedroom" }, { kind: "living" }, { kind: "bedroom" }])).toEqual([
      { id: "bedroom-1", name: { en: "Bedroom 1", "zh-Hant": "睡房 1" } },
      { id: "living", name: { en: "Living / dining room", "zh-Hant": "客飯廳" } },
      { id: "bedroom-2", name: { en: "Bedroom 2", "zh-Hant": "睡房 2" } },
    ]);
  });

  it("swings a door into the room asked for, else away from the living room", () => {
    const plan = demoTrace();
    plan.doors = plan.doors.map((door) => door.id === "kitchen-door" ? { ...door, swingInto: undefined } : door.id === "bathroom-door" ? { ...door, swingInto: "t-living" } : door);
    const doors = buildFlat(plan, META).flat!.doors;
    expect(doors.find((door) => door.id === "kitchen-door")?.swingRoomId).toBe("kitchen");
    expect(doors.find((door) => door.id === "bathroom-door")?.swingRoomId).toBe("living");
  });

  it("moves a door that overhangs its wall end back onto the wall", () => {
    const plan = demoTrace();
    plan.doors[1] = { ...plan.doors[1], at: moved({ x: 425, z: 25 }) };
    expect(buildFlat(plan, META).flat!.doors[1].position).toEqual({ x: 425, z: 50 });
  });

  describe("errors block the flat", () => {
    it.each([
      ["no rooms", (plan: TracePlan) => { plan.rooms = []; }, "no-rooms"],
      ["overlapping rooms", (plan: TracePlan) => { plan.rooms[1].box = { ...plan.rooms[1].box, minX: plan.rooms[1].box.minX - 30 }; }, "rooms-overlap"],
      ["a sliver of a room", (plan: TracePlan) => { plan.rooms[2].box = { ...plan.rooms[2].box, maxZ: plan.rooms[2].box.minZ + 30 }; }, "room-too-narrow"],
      ["a door far from any wall", (plan: TracePlan) => { plan.doors[1].at = moved({ x: 200, z: 150 }); }, "door-off-wall"],
      ["a door wider than its wall", (plan: TracePlan) => { plan.doors[3].width = 400; }, "door-too-wide"],
      ["no entrance", (plan: TracePlan) => { plan.doors.shift(); }, "no-entrance"],
      ["two entrances", (plan: TracePlan) => { plan.doors.push({ id: "back-door", at: moved({ x: 500, z: 635 }), width: 80 }); }, "many-entrances"],
    ])("%s", (_, breakIt, code) => {
      const plan = demoTrace();
      breakIt(plan);
      const result = buildFlat(plan, META);
      expect(result.flat).toBeNull();
      expect(result.issues).toContainEqual(expect.objectContaining({ code, severity: "error" }));
    });
  });

  describe("warnings do not block the flat", () => {
    it("flags a room that cannot be reached through doors", () => {
      const plan = demoTrace();
      plan.doors = plan.doors.filter((door) => door.id !== "second-door");
      const result = buildFlat(plan, META);
      expect(result.flat).not.toBeNull();
      expect(result.issues).toEqual([expect.objectContaining({ code: "unreachable", severity: "warning", ids: ["t-second"] })]);
    });

    it("treats rooms joined as an open pair as reachable", () => {
      const plan = demoTrace();
      plan.doors = plan.doors.filter((door) => door.id !== "second-door");
      plan.openPairs = [["t-living", "t-second"]];
      expect(issueCodes(plan)).toEqual([]);
    });

    it("counts edges not matched to a drawn wall and records them on the flat", () => {
      const plan = demoTrace();
      plan.rooms[0].edges.top = { status: "unverified" };
      plan.rooms[3].edges.left = { status: "unverified" };
      const result = buildFlat(plan, META);
      expect(result.issues).toEqual([expect.objectContaining({ code: "unchecked-edges", count: 2, ids: ["t-living", "t-master"] })]);
      expect(result.flat?.trace?.uncheckedEdges).toBe(2);
    });

    it("compares the bedroom count with the flat type", () => {
      expect(issueCodes(demoTrace(), { flatType: "2B" })).toEqual([]);
      expect(buildFlat(demoTrace(), { ...META, flatType: "3B" }).issues).toEqual([expect.objectContaining({ code: "bedroom-count", expected: 3, actual: 2 })]);
    });

    it("compares the internal floor area, partitions included, with the tenancy figure", () => {
      const result = buildFlat(demoTrace(), META);
      // 38.21 m² of rooms plus 1.47 m² of partitions.
      expect(result.areaM2).toBeCloseTo(39.68, 6);
      expect(issueCodes(demoTrace(), { declaredAreaM2: 41 })).toEqual([]);
      expect(buildFlat(demoTrace(), { ...META, declaredAreaM2: 45 }).issues).toEqual([expect.objectContaining({ code: "area-mismatch", percent: -11.8 })]);
    });

    it("drops a window that is not on an outer wall of its room", () => {
      const plan = demoTrace();
      plan.windows[0] = { ...plan.windows[0], roomId: "t-kitchen" };
      const result = buildFlat(plan, META);
      expect(result.issues).toEqual([expect.objectContaining({ code: "window-off-wall", ids: ["living-front-window"] })]);
      expect(result.flat?.windows).toHaveLength(5);
    });
  });
});
