import type { Box } from "@/lib/geometry/architecture";
import { scaleFromTaps, type PlanPoint } from "@/lib/floorplan/scale";
import type { EdgeSide, FlatType, TraceDoor, TraceEdge, TracePlan, TraceRoom, TraceWindow } from "@/lib/floorplan/trace";
import { TRACED_CEILING } from "@/lib/floorplan/build";
import type { RoomKind } from "@/types/domain";

export type TraceStep = "picture" | "scale" | "unit" | "detect" | "review" | "check";
export const TRACE_STEPS: readonly TraceStep[] = ["picture", "scale", "unit", "detect", "review", "check"];

export interface TraceSourceInfo {
  name: string;
  kind: "pdf" | "image";
  page: number;
  pageCount: number;
}

export interface ScaleState {
  method: "scale-bar" | "known-length";
  /** The two calibration points in source units, already snapped to ticks where that applies. */
  points: readonly [PlanPoint | null, PlanPoint | null];
  /** The real distance between them in centimetres, as typed. */
  length: string;
  /** True when the points and length came from the plan's own scale-bar labels. */
  found: boolean;
}

export interface UnitState {
  /** The user's box around their flat, in source units. */
  box: Box | null;
  flatType: FlatType | null;
  /** Degrees the crop is turned to straighten the flat's walls. */
  rotation: number;
  /** The angle measured in the box, offered as the straightening rotation. */
  measuredAngle: number | null;
}

/** What the AI reading left out or approximated, shown in the review. */
export interface AiNotes {
  /** Rooms placed outside the user's box, left out. */
  outside: number;
  /** Doors and windows dropped as malformed. */
  dropped: number;
  diagonal: boolean;
  repaired: boolean;
}

export type Selection = { kind: "room" | "door" | "window"; id: string } | { kind: "wall"; id: string; rooms: readonly [string, string] | null } | null;

interface TraceDocument {
  plan: TracePlan;
  nextId: number;
}

export interface TraceState extends TraceDocument {
  step: TraceStep;
  source: TraceSourceInfo | null;
  scale: ScaleState;
  unit: UnitState;
  /** Set once the review has a plan to edit: read by the AI, or traced by hand. */
  readBy: "ai" | "manual" | null;
  model: string | null;
  aiNotes: AiNotes | null;
  past: TraceDocument[];
  future: TraceDocument[];
  selection: Selection;
  ceiling: string;
  declaredArea: string;
  checkedEdges: boolean;
}

export type PlanEdit =
  | { type: "room-add"; room: Omit<TraceRoom, "id"> }
  | { type: "room-update"; id: string; box?: Box; kind?: RoomKind; edges?: Partial<Record<EdgeSide, TraceEdge>> }
  | { type: "room-delete"; id: string }
  | { type: "edge-checked"; id: string; side: EdgeSide }
  | { type: "door-add"; door: Omit<TraceDoor, "id"> }
  | { type: "door-update"; id: string; patch: Partial<Omit<TraceDoor, "id">> }
  | { type: "door-delete"; id: string }
  | { type: "window-add"; window: Omit<TraceWindow, "id"> }
  | { type: "window-update"; id: string; patch: Partial<Omit<TraceWindow, "id">> }
  | { type: "window-delete"; id: string }
  | { type: "open-pair"; rooms: readonly [string, string]; open: boolean }
  | { type: "openings-add"; doors: Omit<TraceDoor, "id">[]; windows: Omit<TraceWindow, "id">[] };

export type TraceAction =
  | { type: "reset" }
  | { type: "source"; source: TraceSourceInfo }
  | { type: "step"; step: TraceStep }
  | { type: "scale-method"; method: ScaleState["method"] }
  | { type: "scale-point"; index: 0 | 1; point: PlanPoint | null }
  | { type: "scale-length"; value: string }
  | { type: "scale-found"; points: readonly [PlanPoint, PlanPoint]; lengthCm: number }
  | { type: "unit-box"; box: Box | null; flatType: FlatType | null }
  | { type: "flat-type"; flatType: FlatType | null }
  | { type: "measured-angle"; angle: number | null }
  | { type: "rotation"; rotation: number }
  | { type: "start"; plan: TracePlan; readBy: "ai" | "manual"; model?: string | null; notes?: AiNotes }
  | { type: "edit"; edit: PlanEdit }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; selection: Selection }
  | { type: "ceiling"; value: string }
  | { type: "declared-area"; value: string }
  | { type: "checked-edges"; value: boolean };

const HISTORY_LIMIT = 100;
const EMPTY_PLAN: TracePlan = { rooms: [], openPairs: [], doors: [], windows: [] };

export function createTraceState(): TraceState {
  return {
    step: "picture",
    source: null,
    scale: { method: "scale-bar", points: [null, null], length: "", found: false },
    unit: { box: null, flatType: null, rotation: 0, measuredAngle: null },
    readBy: null,
    model: null,
    aiNotes: null,
    plan: EMPTY_PLAN,
    nextId: 1,
    past: [],
    future: [],
    selection: null,
    ceiling: String(TRACED_CEILING.initial),
    declaredArea: "",
    checkedEdges: false,
  };
}

/** A strictly positive plain decimal, or null. */
export function positiveNumber(value: string): number | null {
  if (!/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return null;
  const number = Number(value);
  return number > 0 && Number.isFinite(number) ? number : null;
}

/** Centimetres per source unit from the calibration, or null while it is incomplete. */
export function scaleOf(scale: ScaleState): number | null {
  const [first, second] = scale.points;
  const length = positiveNumber(scale.length);
  return first && second && length ? scaleFromTaps(first, second, length) : null;
}

export function canEnter(state: TraceState, step: TraceStep): boolean {
  switch (step) {
    case "picture": return true;
    case "scale": return state.source !== null;
    case "unit": return state.source !== null && scaleOf(state.scale) !== null;
    case "detect": return canEnter(state, "unit") && state.unit.box !== null;
    case "review": return state.readBy !== null;
    case "check": return state.readBy !== null && state.plan.rooms.length > 0;
  }
}

/** The number after the last dash of each ID, so new IDs never repeat ones already in the plan. */
function nextIdFor(plan: TracePlan): number {
  const numbers = [...plan.rooms, ...plan.doors, ...plan.windows].map((entry) => Number(entry.id.split("-").at(-1))).filter(Number.isFinite);
  return Math.max(0, ...numbers) + 1;
}

const samePair = (pair: readonly [string, string], rooms: readonly [string, string]) => (pair[0] === rooms[0] && pair[1] === rooms[1]) || (pair[0] === rooms[1] && pair[1] === rooms[0]);

function applyPlanEdit(document: TraceDocument, edit: PlanEdit): TraceDocument & { added?: string } {
  const { plan, nextId } = document;
  switch (edit.type) {
    case "room-add": {
      const id = `room-${nextId}`;
      return { plan: { ...plan, rooms: [...plan.rooms, { ...edit.room, id }] }, nextId: nextId + 1, added: id };
    }
    case "room-update":
      return { nextId, plan: { ...plan, rooms: plan.rooms.map((room) => room.id === edit.id ? { ...room, ...(edit.box ? { box: edit.box } : {}), ...(edit.kind ? { kind: edit.kind } : {}), edges: { ...room.edges, ...edit.edges } } : room) } };
    case "room-delete":
      return {
        nextId,
        plan: {
          rooms: plan.rooms.filter((room) => room.id !== edit.id),
          openPairs: plan.openPairs.filter((pair) => !pair.includes(edit.id)),
          doors: plan.doors.map((door) => door.swingInto === edit.id ? { ...door, swingInto: undefined } : door),
          windows: plan.windows.filter((window) => window.roomId !== edit.id),
        },
      };
    case "edge-checked":
      return { nextId, plan: { ...plan, rooms: plan.rooms.map((room) => room.id === edit.id && room.edges[edit.side].status === "unverified" ? { ...room, edges: { ...room.edges, [edit.side]: { ...room.edges[edit.side], status: "manual" } } } : room) } };
    case "door-add": {
      const id = `door-${nextId}`;
      return { plan: { ...plan, doors: [...plan.doors, { ...edit.door, id }] }, nextId: nextId + 1, added: id };
    }
    case "door-update":
      return { nextId, plan: { ...plan, doors: plan.doors.map((door) => door.id === edit.id ? { ...door, ...edit.patch } : door) } };
    case "door-delete":
      return { nextId, plan: { ...plan, doors: plan.doors.filter((door) => door.id !== edit.id) } };
    case "window-add": {
      const id = `window-${nextId}`;
      return { plan: { ...plan, windows: [...plan.windows, { ...edit.window, id }] }, nextId: nextId + 1, added: id };
    }
    case "window-update":
      return { nextId, plan: { ...plan, windows: plan.windows.map((window) => window.id === edit.id ? { ...window, ...edit.patch } : window) } };
    case "window-delete":
      return { nextId, plan: { ...plan, windows: plan.windows.filter((window) => window.id !== edit.id) } };
    case "openings-add": {
      let next = nextId;
      const doors = edit.doors.map((door) => ({ ...door, id: `door-${next++}` }));
      const windows = edit.windows.map((window) => ({ ...window, id: `window-${next++}` }));
      return { nextId: next, plan: { ...plan, doors: [...plan.doors, ...doors], windows: [...plan.windows, ...windows] } };
    }
    case "open-pair": {
      const others = plan.openPairs.filter((pair) => !samePair(pair, edit.rooms));
      return { nextId, plan: { ...plan, openPairs: edit.open ? [...others, edit.rooms] : others } };
    }
  }
}

function selectionExists(plan: TracePlan, selection: Selection): boolean {
  if (!selection) return true;
  if (selection.kind === "wall") return selection.rooms === null || selection.rooms.every((id) => plan.rooms.some((room) => room.id === id));
  const entries = selection.kind === "room" ? plan.rooms : selection.kind === "door" ? plan.doors : plan.windows;
  return entries.some((entry) => entry.id === selection.id);
}

function withDocument(state: TraceState, document: TraceDocument, past: TraceDocument[], future: TraceDocument[]): TraceState {
  return { ...state, plan: document.plan, nextId: document.nextId, past, future, selection: selectionExists(document.plan, state.selection) ? state.selection : null };
}

export function traceReducer(state: TraceState, action: TraceAction): TraceState {
  switch (action.type) {
    case "reset":
      return createTraceState();
    case "source":
      return { ...createTraceState(), source: action.source, step: "scale" };
    case "step":
      return canEnter(state, action.step) ? { ...state, step: action.step } : state;
    case "scale-method":
      return { ...state, scale: { ...state.scale, method: action.method, found: false } };
    case "scale-point": {
      const points: [PlanPoint | null, PlanPoint | null] = [...state.scale.points];
      points[action.index] = action.point;
      return { ...state, scale: { ...state.scale, points, found: false } };
    }
    case "scale-length":
      return { ...state, scale: { ...state.scale, length: action.value } };
    case "scale-found":
      return { ...state, scale: { method: "scale-bar", points: action.points, length: String(action.lengthCm), found: true } };
    case "unit-box":
      return { ...state, unit: { ...state.unit, box: action.box, flatType: action.flatType ?? state.unit.flatType, measuredAngle: null, rotation: 0 } };
    case "flat-type":
      return { ...state, unit: { ...state.unit, flatType: action.flatType } };
    case "measured-angle":
      return { ...state, unit: { ...state.unit, measuredAngle: action.angle } };
    case "rotation":
      return { ...state, unit: { ...state.unit, rotation: action.rotation } };
    case "start":
      return { ...state, plan: action.plan, nextId: nextIdFor(action.plan), readBy: action.readBy, model: action.model ?? null, aiNotes: action.notes ?? null, past: [], future: [], selection: null, checkedEdges: false, step: "review" };
    case "edit": {
      const before: TraceDocument = { plan: state.plan, nextId: state.nextId };
      const after = applyPlanEdit(before, action.edit);
      const next = withDocument(state, after, [...state.past, before].slice(-HISTORY_LIMIT), []);
      return after.added ? { ...next, selection: { kind: action.edit.type === "room-add" ? "room" : action.edit.type === "door-add" ? "door" : "window", id: after.added } } : next;
    }
    case "undo":
      return state.past.length === 0 ? state : withDocument(state, state.past[state.past.length - 1], state.past.slice(0, -1), [{ plan: state.plan, nextId: state.nextId }, ...state.future]);
    case "redo":
      return state.future.length === 0 ? state : withDocument(state, state.future[0], [...state.past, { plan: state.plan, nextId: state.nextId }], state.future.slice(1));
    case "select":
      return { ...state, selection: action.selection };
    case "ceiling":
      return { ...state, ceiling: action.value };
    case "declared-area":
      return { ...state, declaredArea: action.value };
    case "checked-edges":
      return { ...state, checkedEdges: action.value };
  }
}
