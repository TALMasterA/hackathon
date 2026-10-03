import { describe, expect, it } from "vitest";
import { edges, type TracePlan } from "../../lib/floorplan/trace";
import { canEnter, createTraceState, positiveNumber, scaleOf, traceReducer, type TraceAction, type TraceState } from "./trace-state";

const run = (state: TraceState, ...actions: TraceAction[]) => actions.reduce(traceReducer, state);
const SOURCE = { name: "02-Harmony1.pdf", kind: "pdf" as const, page: 1, pageCount: 10 };
const PLAN: TracePlan = {
  rooms: [{ id: "room-1", kind: "living", box: { minX: 0, maxX: 300, minZ: 0, maxZ: 200 }, edges: edges("verified", 20) }, { id: "room-2", kind: "bedroom", box: { minX: 310, maxX: 500, minZ: 0, maxZ: 200 }, edges: edges("unverified") }],
  openPairs: [["room-1", "room-2"]],
  doors: [{ id: "door-3", at: { x: 305, z: 100 }, width: 80, swingInto: "room-2" }],
  windows: [{ id: "window-4", at: { x: 400, z: 205 }, width: 120, roomId: "room-2" }],
};

function calibrated(): TraceState {
  return run(createTraceState(), { type: "source", source: SOURCE }, { type: "scale-found", points: [{ x: 996.48, y: 760 }, { x: 1108.44, y: 760 }], lengthCm: 800 });
}

describe("trace screen state", () => {
  it("opens the steps in order: picture, scale, unit, then review once a plan exists", () => {
    const fresh = createTraceState();
    expect(["picture", "scale", "unit", "detect", "review", "check"].map((step) => canEnter(fresh, step as never))).toEqual([true, false, false, false, false, false]);
    const withSource = traceReducer(fresh, { type: "source", source: SOURCE });
    expect(withSource.step).toBe("scale");
    expect(canEnter(withSource, "unit")).toBe(false);
    const scaled = calibrated();
    expect(canEnter(scaled, "unit")).toBe(true);
    expect(canEnter(scaled, "detect")).toBe(false);
    const boxed = traceReducer(scaled, { type: "unit-box", box: { minX: 480, maxX: 590, minZ: 150, maxZ: 270 }, flatType: "2B" });
    expect(canEnter(boxed, "detect")).toBe(true);
    expect(traceReducer(boxed, { type: "step", step: "review" })).toBe(boxed);
    const started = traceReducer(boxed, { type: "start", plan: PLAN, readBy: "manual" });
    expect(started.step).toBe("review");
    expect(canEnter(started, "check")).toBe(true);
  });

  it("calibrates from two points and a typed length", () => {
    expect(scaleOf(calibrated().scale)).toBeCloseTo(7.1454, 3);
    const typed = run(calibrated(), { type: "scale-length", value: "8 m" });
    expect(scaleOf(typed.scale)).toBeNull();
    expect(positiveNumber(" 800 ")).toBe(800);
    expect([positiveNumber("0"), positiveNumber("-5"), positiveNumber("1e3"), positiveNumber("")]).toEqual([null, null, null, null]);
  });

  it("starts over when another picture or page is chosen", () => {
    const started = run(calibrated(), { type: "unit-box", box: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, flatType: null }, { type: "start", plan: PLAN, readBy: "ai", model: "m" });
    const reset = traceReducer(started, { type: "source", source: { ...SOURCE, page: 2 } });
    expect(reset).toMatchObject({ step: "scale", readBy: null, unit: { box: null }, scale: { points: [null, null] } });
    expect(reset.plan.rooms).toEqual([]);
  });

  it("keeps the flat type when a new box finds no label", () => {
    const typed = run(calibrated(), { type: "unit-box", box: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, flatType: "2B" }, { type: "unit-box", box: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, flatType: null });
    expect(typed.unit.flatType).toBe("2B");
  });

  it("numbers new parts after the highest ID in a started plan and selects them", () => {
    const started = traceReducer(calibrated(), { type: "start", plan: PLAN, readBy: "ai" });
    expect(started.nextId).toBe(5);
    const added = traceReducer(started, { type: "edit", edit: { type: "room-add", room: { kind: "kitchen", box: { minX: 0, maxX: 100, minZ: 210, maxZ: 300 }, edges: edges("manual") } } });
    expect(added.plan.rooms.at(-1)?.id).toBe("room-5");
    expect(added.selection).toEqual({ kind: "room", id: "room-5" });
  });

  it("removes a deleted room's windows, open pairs and swing references, and undoes it all", () => {
    const started = run(calibrated(), { type: "start", plan: PLAN, readBy: "ai" }, { type: "select", selection: { kind: "room", id: "room-2" } });
    const deleted = traceReducer(started, { type: "edit", edit: { type: "room-delete", id: "room-2" } });
    expect(deleted.plan).toMatchObject({ openPairs: [], windows: [], doors: [{ id: "door-3", swingInto: undefined }] });
    expect(deleted.selection).toBeNull();
    const undone = traceReducer(deleted, { type: "undo" });
    expect(undone.plan).toBe(started.plan);
    expect(traceReducer(undone, { type: "redo" }).plan).toBe(deleted.plan);
  });

  it("marks an unverified edge as checked by the user, but never a verified one", () => {
    const started = traceReducer(calibrated(), { type: "start", plan: PLAN, readBy: "ai" });
    const checked = traceReducer(started, { type: "edit", edit: { type: "edge-checked", id: "room-2", side: "left" } });
    expect(checked.plan.rooms[1].edges.left.status).toBe("manual");
    const verified = traceReducer(started, { type: "edit", edit: { type: "edge-checked", id: "room-1", side: "left" } });
    expect(verified.plan.rooms[0].edges.left).toEqual({ status: "verified", thickness: 20 });
  });

  it("opens and closes walls between rooms in either order", () => {
    const started = traceReducer(calibrated(), { type: "start", plan: PLAN, readBy: "ai" });
    const closed = traceReducer(started, { type: "edit", edit: { type: "open-pair", rooms: ["room-2", "room-1"], open: false } });
    expect(closed.plan.openPairs).toEqual([]);
    expect(traceReducer(closed, { type: "edit", edit: { type: "open-pair", rooms: ["room-2", "room-1"], open: true } }).plan.openPairs).toEqual([["room-2", "room-1"]]);
  });

  it("updates doors and windows in place", () => {
    const started = traceReducer(calibrated(), { type: "start", plan: PLAN, readBy: "ai" });
    const door = traceReducer(started, { type: "edit", edit: { type: "door-update", id: "door-3", patch: { width: 90, swingInto: "room-1" } } });
    expect(door.plan.doors[0]).toMatchObject({ width: 90, swingInto: "room-1" });
    const window = traceReducer(door, { type: "edit", edit: { type: "window-delete", id: "window-4" } });
    expect(window.plan.windows).toEqual([]);
    expect(window.past).toHaveLength(2);
  });
});
