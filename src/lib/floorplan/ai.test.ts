import { describe, expect, it } from "vitest";
import { boxPoints } from "./trace";
import { extractJson, parseAiReply, validateAiPlan } from "./ai-parse";
import { traceFromAi } from "./ai-trace";
import { repairPrompt, userPrompt } from "./prompt";
import type { SnapContext } from "./snap";
import { blankPlan, drawDoorSwing, drawWall, type WallDrawing } from "./test-image";

const GOOD = { flat_label: "2B", has_diagonal_walls: false, rooms: [{ kind: "living", box_2d: [100, 100, 600, 700], open_to: [1] }, { kind: "bedroom", box_2d: [610, 100, 900, 700], open_to: [] }], doors: [{ center: [100, 400], between: [-1, 0] }], windows: [{ center: [900, 300], room: 1 }] };

describe("reading the model's answer", () => {
  it("finds the JSON inside code fences or prose", () => {
    expect(extractJson("```json\n{\"a\": 1}\n```")).toEqual({ a: 1 });
    expect(extractJson("Here is the plan: {\"a\": {\"b\": 2}} Hope this helps.")).toEqual({ a: { b: 2 } });
    expect(parseAiReply("I cannot see a plan.")).toEqual({ ok: false, errors: ["The answer did not contain a valid JSON object."] });
  });

  it("accepts a well-formed plan", () => {
    expect(parseAiReply(JSON.stringify(GOOD))).toEqual({ ok: true, dropped: 0, plan: { ...GOOD, rooms: GOOD.rooms.map((room) => ({ ...room, box_2d: room.box_2d })) } });
  });

  it.each([
    ["no rooms", { ...GOOD, rooms: [] }, "\"rooms\" must be a non-empty array."],
    ["an unknown kind", { ...GOOD, rooms: [{ ...GOOD.rooms[0], kind: "garage" }] }, "rooms[0].kind must be one of living, bedroom, kitchen, bathroom, other."],
    ["coordinates past 1000", { ...GOOD, rooms: [{ ...GOOD.rooms[0], box_2d: [100, 100, 1200, 700] }] }, "rooms[0].box_2d must be [ymin, xmin, ymax, xmax] with numbers from 0 to 1000."],
    ["swapped corners", { ...GOOD, rooms: [{ ...GOOD.rooms[0], box_2d: [600, 100, 100, 700] }] }, "rooms[0].box_2d must have ymin < ymax and xmin < xmax."],
    ["a sliver", { ...GOOD, rooms: [{ ...GOOD.rooms[0], box_2d: [100, 100, 105, 700] }] }, "rooms[0].box_2d is too small to be a room."],
    ["too many rooms", { ...GOOD, rooms: Array.from({ length: 16 }, () => GOOD.rooms[0]) }, "At most 15 rooms are allowed."],
  ])("rejects %s with a message for the model", (_, value, error) => {
    expect(validateAiPlan(value)).toEqual({ ok: false, errors: [error] });
  });

  it("drops bad doors and windows but keeps the rooms, and cleans up open_to", () => {
    const result = validateAiPlan({ ...GOOD, rooms: [{ ...GOOD.rooms[0], open_to: [0, 1, 7, "x", 1] }, GOOD.rooms[1]], doors: [GOOD.doors[0], { center: [2000, 1] }, { between: [0, 1] }], windows: [GOOD.windows[0], { center: [1, 1], room: 9 }] });
    expect(result).toMatchObject({ ok: true, dropped: 3 });
    expect(result.ok && result.plan.rooms[0].open_to).toEqual([1]);
    expect(result.ok && result.plan.doors).toEqual([GOOD.doors[0]]);
  });
});

describe("prompts", () => {
  it("tells the model the flat type as context, never as a count to reach", () => {
    expect(userPrompt("2B")).toContain("Its label is 2B, a type meant for 2 bedrooms; but describe only the rooms actually drawn");
    expect(userPrompt("1B")).toContain("meant for 1 bedroom;");
    expect(userPrompt("1P")).toContain("one or two persons");
    expect(userPrompt(null)).not.toContain("Its label is");
    expect(userPrompt(null)).toContain("[ymin, xmin, ymax, xmax]");
  });

  it("quotes the problems and the previous answer when asking again", () => {
    const prompt = repairPrompt("2B", "{broken", ["rooms[0].kind must be one of living."]);
    expect(prompt).toContain("- rooms[0].kind must be one of living.");
    expect(prompt).toContain("{broken");
  });
});

describe("turning a reading into a trace", () => {
  /** At 0.5 cm/px: inner faces 50–300 × 50–150 cm in 20 cm walls, a 50 cm door in the top wall swinging in. */
  function drawing() {
    const image = blankPlan(720, 420);
    const wall = (overrides: Partial<WallDrawing> & Pick<WallDrawing, "orientation" | "centre">): WallDrawing => ({ from: 60, to: 640, thickness: 40, line: 8, ...overrides });
    drawWall(image, wall({ orientation: "h", centre: 80, gaps: [[300, 400]] }));
    drawDoorSwing(image, "h", 104, 300, 400, 1, 2);
    drawWall(image, wall({ orientation: "h", centre: 320 }));
    drawWall(image, wall({ orientation: "v", centre: 80, to: 340 }));
    drawWall(image, wall({ orientation: "v", centre: 620, to: 340 }));
    return image;
  }
  const raster = { width: 720, height: 420 };
  const context = (): SnapContext => ({ image: drawing(), cmPerPx: 0.5, strokes: { thin: 2, heavy: 8, pens: [2, 8], distinct: true } });
  const at = (x: number, y: number): [number, number] => [(y / raster.height) * 1000, (x / raster.width) * 1000];
  const box = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [(y0 / raster.height) * 1000, (x0 / raster.width) * 1000, (y1 / raster.height) * 1000, (x1 / raster.width) * 1000];

  it("snaps the rooms, measures the door and leaves out rooms outside the user's box", () => {
    const ai = { flat_label: "2B", has_diagonal_walls: true, rooms: [{ kind: "living" as const, box_2d: box(112, 90, 588, 312), open_to: [] }, { kind: "other" as const, box_2d: box(0, 0, 50, 30), open_to: [] }], doors: [{ center: at(350, 80), between: [-1, 0] as [number, number] }], windows: [{ center: at(450, 320), room: 0 }] };
    const trace = traceFromAi(context(), ai, raster, { minX: 60, maxX: 660, minZ: 40, maxZ: 380 });
    expect(trace).toMatchObject({ outside: 1, diagonal: true, label: "2B" });
    expect(trace.plan.rooms).toHaveLength(1);
    expect(trace.plan.rooms[0]).toMatchObject({ id: "room-1", kind: "living", points: boxPoints({ minX: 50, maxX: 300, minZ: 50, maxZ: 150 }) });
    // Box rooms list their edges top, right, bottom, left.
    expect(trace.plan.rooms[0].edges[1]).toEqual({ status: "verified", thickness: 20 });
    const [door] = trace.plan.doors;
    expect(door).toMatchObject({ id: "door-2", at: { x: 175, z: 50 }, swingInto: "room-1" });
    expect(Math.abs(door.width - 50)).toBeLessThanOrEqual(1);
    // No window is drawn there, so it keeps a default width on the room's face.
    expect(trace.plan.windows).toEqual([{ id: "window-3", at: { x: 225, z: 150 }, width: 120, roomId: "room-1" }]);
  });

  it("adds no outside door the model did not ask for, and drops a model door far from any room", () => {
    const ai = { flat_label: null, has_diagonal_walls: false, rooms: [{ kind: "living" as const, box_2d: box(112, 90, 588, 312), open_to: [] }], doors: [{ center: at(700, 400), between: null }], windows: [] };
    const trace = traceFromAi(context(), ai, raster);
    expect(trace.strayDoors).toBe(1);
    expect(trace.plan.doors).toEqual([]);
  });

  it("adds a drawn door between two rooms that the model missed", () => {
    // Two 2 m deep rooms either side of a partition (faces x 380/420 px) with a 50 cm door swinging right.
    const image = blankPlan(820, 620);
    const wall = (overrides: Partial<WallDrawing> & Pick<WallDrawing, "orientation" | "centre">): WallDrawing => ({ from: 60, to: 760, thickness: 40, line: 8, ...overrides });
    drawWall(image, wall({ orientation: "h", centre: 80 }));
    drawWall(image, wall({ orientation: "h", centre: 520 }));
    drawWall(image, wall({ orientation: "v", centre: 80, to: 540 }));
    drawWall(image, wall({ orientation: "v", centre: 720, to: 540 }));
    drawWall(image, wall({ orientation: "v", centre: 400, from: 100, to: 500, gaps: [[150, 250]] }));
    drawDoorSwing(image, "v", 422, 150, 250, 1, 2);
    const wide = { width: 820, height: 620 };
    const scaled = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [(y0 / 620) * 1000, (x0 / 820) * 1000, (y1 / 620) * 1000, (x1 / 820) * 1000];
    const ai = { flat_label: null, has_diagonal_walls: false, rooms: [{ kind: "living" as const, box_2d: scaled(110, 90, 372, 510), open_to: [] }, { kind: "bedroom" as const, box_2d: scaled(430, 92, 690, 506), open_to: [] }], doors: [], windows: [] };
    const trace = traceFromAi({ image, cmPerPx: 0.5, strokes: { thin: 2, heavy: 8, pens: [2, 8], distinct: true } }, ai, wide);
    expect(trace.plan.doors).toHaveLength(1);
    expect(trace.plan.doors[0]).toMatchObject({ at: { z: 100 }, swingInto: "room-2" });
    expect(Math.abs(trace.plan.doors[0].width - 50)).toBeLessThanOrEqual(1);
  });

  it("maps open_to between the rooms that are kept and merges duplicate doors", () => {
    const ai = { flat_label: null, has_diagonal_walls: false, rooms: [{ kind: "living" as const, box_2d: box(112, 90, 330, 312), open_to: [1] }, { kind: "living" as const, box_2d: box(330, 90, 588, 312), open_to: [0] }], doors: [{ center: at(350, 80), between: null }, { center: at(352, 84), between: null }], windows: [] };
    const trace = traceFromAi(context(), ai, raster);
    expect(trace.plan.openPairs).toEqual([["room-1", "room-2"]]);
    expect(trace.plan.doors).toHaveLength(1);
  });
});
