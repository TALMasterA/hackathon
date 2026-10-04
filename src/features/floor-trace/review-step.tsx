"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { AppWindow, ArrowLeftRight, ArrowRight, Check, DoorOpen, MousePointer2, PenLine, Redo2, ScanSearch, Square, Trash2, Undo2, X } from "lucide-react";
import { formatCm } from "@/i18n/dictionary";
import { ROOM_KIND_INKS, TRACE_INK } from "@/lib/theme";
import { traceText, type TraceTranslationKey } from "@/i18n/trace";
import { doorGeometry, openingEndpoints, wallPolygon } from "@/lib/geometry/architecture";
import { pointInPolygon, polygonArea } from "@/lib/geometry/oriented";
import { isSimplePolygon } from "@/lib/geometry/polygon";
import { sides, wallHit, wallPoint } from "@/lib/floorplan/attach";
import { traceGeometry } from "@/lib/floorplan/build";
import { ROOM_KIND_NAMES, ROOM_KINDS } from "@/lib/floorplan/names";
import { isBoxRoom, roomBounds, roomEdges, roundFace, type EdgeStatus, type TraceRoom } from "@/lib/floorplan/trace";
import { drawnWindows, moveEdge, nearestFace, roomAcross, scanOpenings, snapDrawnRoom, snapTraceEdge, snapTraceRooms, traceOpening, withEdgeLines, type FaceHit } from "@/lib/floorplan/trace-snap";
import type { Language, Position2D, RoomKind, Wall } from "@/types/domain";
import type { PlanAnalysis } from "./analysis";
import { alongEdge, closeShape, edgeNear, MIN_OPENING_CM, openingSpan, roomIsBigEnough, snapCorner, type CornerSnap } from "./draw";
import { NumberField } from "./number-field";
import { PlanView } from "./plan-view";
import type { TraceAction, TraceState } from "./trace-state";

type Mode = "select" | "box" | "shape" | "door" | "window";

export const KIND_COLORS: Record<RoomKind, string> = ROOM_KIND_INKS;
const EDGE_STYLE: Record<EdgeStatus, { stroke: string; width: number; dash?: [number, number] }> = {
  verified: { stroke: TRACE_INK.verified, width: 2.5 },
  manual: { stroke: TRACE_INK.manual, width: 2.5 },
  unverified: { stroke: TRACE_INK.unverified, width: 3.5, dash: [7, 5] },
  open: { stroke: TRACE_INK.open, width: 2, dash: [2, 4] },
};
const HANDLE_PX = 7;
const HIT_PX = 14;
/** A press that moves less than this is a tap, not a drag. Screen pixels. */
const TAP_PX = 6;
const DOUBLE_TAP_MS = 400;
/** How far from a room's edge a door or window drag may start, in screen pixels (at least 40 cm). */
const OPENING_REACH_PX = 24;

const distance = (first: Position2D, second: Position2D) => Math.hypot(first.x - second.x, first.z - second.z);
/** Corners are kept on the 0.5 cm grid traced faces use; a 45° line between grid corners stays exactly 45°. */
const onGrid = (point: Position2D): Position2D => ({ x: roundFace(point.x), z: roundFace(point.z) });
const middle = (first: Position2D, second: Position2D): Position2D => ({ x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 });
const pathOf = (points: readonly Position2D[]) => points.map((point) => `${point.x},${point.z}`).join(" ");
/** A room's label corner: its topmost, then leftmost, corner. */
const labelCorner = (points: readonly Position2D[]) => points.reduce((best, point) => point.z < best.z - 0.01 || (Math.abs(point.z - best.z) <= 0.01 && point.x < best.x) ? point : best);

type Notice = { key: TraceTranslationKey; parameters?: Record<string, number>; tone: "error" | "status" };
type OpeningKind = "door" | "window";

interface ReviewStepProps {
  state: TraceState;
  dispatch: Dispatch<TraceAction>;
  analysis: PlanAnalysis;
  language: Language;
}

export function ReviewStep({ state, dispatch, analysis, language }: ReviewStepProps) {
  const t = (key: TraceTranslationKey, parameters?: Record<string, string | number>) => traceText(language, key, parameters);
  const { plan, selection } = state;
  const geometry = useMemo(() => traceGeometry(plan), [plan]);
  const [mode, setModeState] = useState<Mode>("select");
  const [notice, setNotice] = useState<Notice | null>(null);
  const warn = (key: TraceTranslationKey) => setNotice({ key, tone: "error" });
  const [box, setBox] = useState<{ from: Position2D; to: Position2D } | null>(null);
  const [shape, setShape] = useState<Position2D[] | null>(null);
  const [hover, setHover] = useState<{ point: Position2D; snap: CornerSnap } | null>(null);
  const [edgeDrag, setEdgeDrag] = useState<{ roomId: string; index: number; through: Position2D } | null>(null);
  const [cornerDrag, setCornerDrag] = useState<{ roomId: string; index: number; points: Position2D[]; start: Position2D; moved: boolean } | null>(null);
  const [corner, setCorner] = useState<{ roomId: string; index: number } | null>(null);
  const [highlight, setHighlight] = useState<{ roomId: string; index: number } | null>(null);
  const [opening, setOpening] = useState<{ kind: OpeningKind; hit: FaceHit; from: number; to: number } | null>(null);
  /** A selected door or window being resized (an end handle) or slid (its middle) along its wall; `along` is the pointer. */
  const [openingEdit, setOpeningEdit] = useState<{ kind: OpeningKind; id: string; wall: Wall; handle: "start" | "end" | "body"; span: [number, number]; grab: number; along: number } | null>(null);
  const lastTap = useRef<{ time: number; point: Position2D } | null>(null);
  const altHeld = useRef(false);

  const roomName = (traceId: string | undefined) => {
    const index = plan.rooms.findIndex((room) => room.id === traceId);
    return index >= 0 ? geometry.rooms[index].name[language] : "";
  };
  const traceIdOf = (flatId: string) => plan.rooms[geometry.rooms.findIndex((room) => room.id === flatId)]?.id;
  const selectedRoom = selection?.kind === "room" ? plan.rooms.find((room) => room.id === selection.id) ?? null : null;
  const selectedDoor = selection?.kind === "door" ? plan.doors.find((door) => door.id === selection.id) ?? null : null;
  const selectedWindow = selection?.kind === "window" ? plan.windows.find((window) => window.id === selection.id) ?? null : null;
  const selectedCorner = corner && corner.roomId === selectedRoom?.id && corner.index < selectedRoom.points.length ? corner.index : null;
  const unchecked = plan.rooms.reduce((sum, room) => sum + room.edges.filter((edge) => edge.status === "unverified").length, 0);
  const pseudoFlat = { walls: geometry.walls, rooms: geometry.rooms };

  function setMode(next: Mode) {
    setModeState(next);
    setNotice(null);
    setShape(null);
    setHover(null);
    setBox(null);
    setOpening(null);
    setCorner(null);
  }

  /** A room's corners as shown: moved by an edge or corner drag in progress. */
  function shownPoints(room: TraceRoom): Position2D[] {
    if (edgeDrag?.roomId === room.id) return moveEdge(room, edgeDrag.index, edgeDrag.through);
    if (cornerDrag?.roomId === room.id) return cornerDrag.points;
    return room.points;
  }

  /** Replaces a room's corners after an edit, if the result is still a room. */
  function reshape(room: TraceRoom, moved: Position2D[], edges: TraceRoom["edges"]) {
    const points = moved.map(onGrid);
    if (!isSimplePolygon(points)) return warn("review.shape.crossing");
    if (!roomIsBigEnough({ points })) return warn("review.tooSmall");
    dispatch({ type: "edit", edit: { type: "room-update", id: room.id, points, edges } });
  }

  // --- Shape drawing -------------------------------------------------------------------------------

  function finishShape(corners: readonly Position2D[]) {
    const result = closeShape(corners);
    if ("problem" in result) return warn(result.problem === "crossing" ? "review.shape.crossing" : "review.tooSmall");
    const snapped = snapDrawnRoom(analysis.context, { id: "new", ...result.room });
    const tidied = { ...snapped, points: snapped.points.map(onGrid) };
    const room = isSimplePolygon(tidied.points) && roomIsBigEnough(tidied) ? tidied : result.room;
    dispatch({ type: "edit", edit: { type: "room-add", room: { kind: "other", points: room.points, edges: room.edges } } });
    setMode("select");
  }

  function shapeTap(point: Position2D, unit: number) {
    const now = Date.now();
    const doubled = lastTap.current !== null && now - lastTap.current.time < DOUBLE_TAP_MS && distance(point, lastTap.current.point) <= HIT_PX * unit;
    lastTap.current = { time: now, point };
    if (shape && shape.length >= 3 && doubled) return finishShape(shape);
    const snapped = snapCorner({ point, unit, previous: shape?.at(-1), first: shape?.[0], align: shape ?? [], free: altHeld.current });
    if (snapped.snap === "close") {
      if (shape && shape.length >= 3) finishShape(shape);
      return;
    }
    setShape([...(shape ?? []), onGrid(snapped.point)]);
  }

  function removeLastCorner() {
    setShape((current) => current && current.length > 1 ? current.slice(0, -1) : null);
  }

  // --- Doors and windows ---------------------------------------------------------------------------

  /** A tap on a wall: the opening the drawing shows there, measured; otherwise a hint to drag. */
  function tapOpening(kind: OpeningKind, point: Position2D) {
    const found = traceOpening(analysis.context, plan, point);
    if (!found || found.kind !== kind) return setNotice({ key: kind === "door" ? "review.dragDoor" : "review.dragWindow", tone: "error" });
    if (kind === "door") dispatch({ type: "edit", edit: { type: "door-add", door: { at: found.at, width: found.width, ...(found.swingInto ? { swingInto: found.swingInto } : {}) } } });
    else dispatch({ type: "edit", edit: { type: "window-add", window: { at: found.at, width: found.width, roomId: found.roomId } } });
    setMode("select");
  }

  function placeOpening(kind: OpeningKind, hit: FaceHit, from: number, to: number) {
    const span = openingSpan(hit.edge, from, to);
    if (span.width < MIN_OPENING_CM) return warn("review.openingNarrow");
    if (kind === "door") {
      // The drawing may still say which way the leaf swings, even when the user measured the width.
      const drawn = traceOpening(analysis.context, plan, span.at);
      const swingInto = drawn?.kind === "door" && distance(drawn.at, span.at) < span.width / 2 ? drawn.swingInto : undefined;
      dispatch({ type: "edit", edit: { type: "door-add", door: { at: span.at, width: span.width, hinge: span.hinge, ...(swingInto ? { swingInto } : {}) } } });
    } else {
      dispatch({ type: "edit", edit: { type: "window-add", window: { at: span.at, width: span.width, roomId: hit.room.id } } });
      if (roomAcross(plan, hit.room, hit.index, span.at)) {
        setModeState("select");
        return setNotice({ key: "review.windowInside", tone: "error" });
      }
    }
    setMode("select");
  }

  /** The generated wall and the opening's two ends along it, for a selected door or window. */
  function openingOnWall(kind: OpeningKind, id: string) {
    const attached = kind === "door" ? geometry.doors.find((door) => door.id === id) : geometry.windows.find((window) => window.id === id);
    const wall = attached && geometry.walls.find((entry) => entry.id === attached.wallId);
    if (!attached || !wall) return null;
    const ends = openingEndpoints(attached, wall);
    return { attached, wall, ends, span: [wallHit(wall, ends.start).along, wallHit(wall, ends.end).along] as [number, number] };
  }

  /** An opening's span while one of its ends or its middle is dragged along its wall. */
  function editedSpan(edit: NonNullable<typeof openingEdit>, along: number): [number, number] {
    const length = Math.hypot(edit.wall.end.x - edit.wall.start.x, edit.wall.end.z - edit.wall.start.z);
    const clamp = (value: number) => Math.min(length, Math.max(0, value));
    const [start, end] = edit.span;
    if (edit.handle === "start") return [clamp(along), end];
    if (edit.handle === "end") return [start, clamp(along)];
    const width = end - start;
    const from = Math.min(length - width, Math.max(0, along - edit.grab));
    return [from, from + width];
  }

  function finishOpeningEdit(edit: NonNullable<typeof openingEdit>, along: number) {
    const [from, to] = editedSpan(edit, along);
    const width = Math.round(Math.abs(to - from) * 2) / 2;
    if (width < MIN_OPENING_CM) return warn("review.openingNarrow");
    const at = wallPoint(edit.wall, (from + to) / 2);
    if (edit.kind === "door") dispatch({ type: "edit", edit: { type: "door-update", id: edit.id, patch: { at, width, flagged: false } } });
    else dispatch({ type: "edit", edit: { type: "window-update", id: edit.id, patch: { at, width } } });
  }

  // --- Selecting -----------------------------------------------------------------------------------

  /** The rooms either side of a generated wall at a point on it, as trace IDs (null when one side is outside). */
  function wallRooms(wall: Wall, at: Position2D): readonly [string, string] | null {
    const [low, high] = sides(geometry.rooms, wall, wallHit(wall, at).along);
    const ids = [low && traceIdOf(low.id), high && traceIdOf(high.id)];
    return ids[0] && ids[1] ? [ids[0], ids[1]] : null;
  }

  function select(point: Position2D, unit: number) {
    const near = (at: Position2D) => distance(at, point) <= HIT_PX * unit;
    const door = geometry.doors.find((entry) => near(entry.position)) ?? plan.doors.find((entry) => near(entry.at));
    if (door) return dispatch({ type: "select", selection: { kind: "door", id: door.id } });
    const window = geometry.windows.find((entry) => near(entry.position)) ?? plan.windows.find((entry) => near(entry.at));
    if (window) return dispatch({ type: "select", selection: { kind: "window", id: window.id } });
    // Inside the selected room, along one of its edges: a double tap adds a corner there.
    if (selectedRoom && pointInPolygon(point, selectedRoom.points)) {
      const edge = edgeNear(selectedRoom, point, HIT_PX * unit);
      if (edge) {
        const now = Date.now();
        const doubled = lastTap.current !== null && now - lastTap.current.time < DOUBLE_TAP_MS && distance(point, lastTap.current.point) <= HIT_PX * unit;
        lastTap.current = { time: now, point };
        if (doubled) {
          dispatch({ type: "edit", edit: { type: "corner-insert", id: selectedRoom.id, index: edge.edge.index, point: edge.point } });
          setCorner({ roomId: selectedRoom.id, index: edge.edge.index + 1 });
        }
        return;
      }
    }
    const wall = geometry.walls.find((entry) => {
      const hit = wallHit(entry, point);
      return Math.abs(hit.across) <= entry.thickness / 2 + 3 * unit && hit.along >= 0 && hit.along <= hit.length;
    });
    if (wall) return dispatch({ type: "select", selection: { kind: "wall", id: wall.id, rooms: wallRooms(wall, point) } });
    const room = plan.rooms.filter((entry) => pointInPolygon(point, entry.points)).sort((first, second) => polygonArea(first.points) - polygonArea(second.points))[0];
    setCorner(null);
    dispatch({ type: "select", selection: room ? { kind: "room", id: room.id } : null });
  }

  /**
   * A room with one corner dragged to a point: its two edges move parallel to themselves, so every
   * angle (right or 45°) is kept and the neighbouring corners follow. With Alt, only that corner moves.
   */
  function draggedCorner(room: TraceRoom, index: number, point: Position2D): Position2D[] {
    if (altHeld.current) return room.points.map((entry, other) => other === index ? point : entry);
    const count = room.points.length;
    const previous = (index + count - 1) % count;
    const direction = (edge: number) => {
      const [start, end] = [room.points[edge], room.points[(edge + 1) % count]];
      return { x: end.x - start.x, z: end.z - start.z };
    };
    return withEdgeLines(room.points, new Map([[previous, { point, direction: direction(previous) }], [index, { point, direction: direction(index) }]]));
  }

  // --- Pointer tool --------------------------------------------------------------------------------

  const tool = {
    down(point: Position2D, unit: number) {
      setNotice(null);
      if (mode === "box") {
        setBox({ from: point, to: point });
        return true;
      }
      if (mode === "door" || mode === "window") {
        const hit = nearestFace(plan, point, Math.max(40, OPENING_REACH_PX * unit));
        if (!hit) return false;
        const along = alongEdge(hit.edge, hit.point);
        setOpening({ kind: mode, hit, from: along, to: along });
        return true;
      }
      if (mode !== "select") return false;
      const selectedOpening = selectedDoor ? { kind: "door" as const, id: selectedDoor.id } : selectedWindow ? { kind: "window" as const, id: selectedWindow.id } : null;
      if (selectedOpening) {
        const placed = openingOnWall(selectedOpening.kind, selectedOpening.id);
        if (placed) {
          const handle = distance(point, placed.ends.start) <= HIT_PX * unit ? "start" : distance(point, placed.ends.end) <= HIT_PX * unit ? "end" : distance(point, placed.attached.position) <= HIT_PX * unit ? "body" : null;
          if (handle) {
            const along = wallHit(placed.wall, point).along;
            setOpeningEdit({ ...selectedOpening, wall: placed.wall, handle, span: placed.span, grab: along - placed.span[0], along });
            return true;
          }
        }
      }
      if (selectedRoom) {
        const cornerIndex = selectedRoom.points.findIndex((entry) => distance(entry, point) <= HIT_PX * unit);
        if (cornerIndex >= 0) {
          setCornerDrag({ roomId: selectedRoom.id, index: cornerIndex, points: selectedRoom.points, start: point, moved: false });
          return true;
        }
        const edge = roomEdges(selectedRoom).find((entry) => distance(middle(entry.start, entry.end), point) <= HIT_PX * unit);
        if (edge) {
          setEdgeDrag({ roomId: selectedRoom.id, index: edge.index, through: middle(edge.start, edge.end) });
          return true;
        }
      }
      return false;
    },
    move(point: Position2D, unit: number) {
      if (box) setBox({ ...box, to: point });
      if (opening) setOpening({ ...opening, to: alongEdge(opening.hit.edge, point) });
      if (edgeDrag) setEdgeDrag({ ...edgeDrag, through: point });
      if (openingEdit) setOpeningEdit({ ...openingEdit, along: wallHit(openingEdit.wall, point).along });
      if (cornerDrag) {
        const room = plan.rooms.find((entry) => entry.id === cornerDrag.roomId);
        if (room) setCornerDrag({ ...cornerDrag, points: draggedCorner(room, cornerDrag.index, point), moved: cornerDrag.moved || distance(point, cornerDrag.start) > TAP_PX * unit });
      }
    },
    up(point: Position2D, unit: number) {
      if (box) {
        const area = { minX: Math.min(box.from.x, point.x), maxX: Math.max(box.from.x, point.x), minZ: Math.min(box.from.z, point.z), maxZ: Math.max(box.from.z, point.z) };
        setBox(null);
        if (area.maxX - area.minX < 40 || area.maxZ - area.minZ < 40) return warn("review.tooSmall");
        const [snapped] = snapTraceRooms(analysis.context, [{ id: "new", kind: "other", box: area }]);
        dispatch({ type: "edit", edit: { type: "room-add", room: { kind: "other", points: snapped.points, edges: snapped.edges } } });
        setMode("select");
        return;
      }
      if (opening) {
        const to = alongEdge(opening.hit.edge, point);
        setOpening(null);
        if (Math.abs(to - opening.from) < TAP_PX * unit) return tapOpening(opening.kind, point);
        return placeOpening(opening.kind, opening.hit, opening.from, to);
      }
      if (openingEdit) {
        setOpeningEdit(null);
        return finishOpeningEdit(openingEdit, wallHit(openingEdit.wall, point).along);
      }
      if (edgeDrag) {
        const room = plan.rooms.find((entry) => entry.id === edgeDrag.roomId);
        setEdgeDrag(null);
        if (!room) return;
        const result = snapTraceEdge(analysis.context, room, edgeDrag.index, point);
        return reshape(room, result.points, room.edges.map((edge, index) => index === edgeDrag.index ? result.edge : edge));
      }
      if (cornerDrag) {
        const room = plan.rooms.find((entry) => entry.id === cornerDrag.roomId);
        setCornerDrag(null);
        if (!room) return;
        setCorner({ roomId: room.id, index: cornerDrag.index });
        // Judged from where the pointer was let go: the last move may not have been drawn yet.
        if (!cornerDrag.moved && distance(point, cornerDrag.start) <= TAP_PX * unit) return;
        const count = room.points.length;
        const touched = new Set([(cornerDrag.index + count - 1) % count, cornerDrag.index]);
        reshape(room, draggedCorner(room, cornerDrag.index, point), room.edges.map((edge, index) => touched.has(index) ? { status: "manual" } : edge));
      }
    },
    tap(point: Position2D, unit: number) {
      setNotice(null);
      if (mode === "shape") shapeTap(point, unit);
      else if (mode === "door" || mode === "window") warn("review.startOnWall");
      else if (mode === "select") select(point, unit);
    },
    hover(point: Position2D | null, unit: number) {
      if (mode !== "shape" || !shape || !point) return setHover(null);
      setHover(snapCorner({ point, unit, previous: shape.at(-1), first: shape[0], align: shape, free: altHeld.current }));
    },
  };

  function removeCorner(room: TraceRoom, index: number) {
    if (room.points.length <= 3) return;
    const points = room.points.filter((_, entry) => entry !== index);
    if (!isSimplePolygon(points) || !roomIsBigEnough({ points })) return warn("review.shape.crossing");
    dispatch({ type: "edit", edit: { type: "corner-remove", id: room.id, index } });
    setCorner(null);
  }

  // Keys: Alt draws at any angle; Enter, Backspace and Escape finish, shorten or cancel a room being
  // drawn; Delete removes the selected corner. Re-bound after each render so it sees the current state.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      altHeld.current = event.altKey;
      if (event.type !== "keydown") return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea")) return;
      if (mode === "shape" && shape) {
        if (event.key === "Enter" && shape.length >= 3) finishShape(shape);
        else if (event.key === "Escape") setShape(null);
        else if (event.key === "Backspace") setShape(shape.length > 1 ? shape.slice(0, -1) : null);
        else return;
        event.preventDefault();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedRoom && selectedCorner !== null) {
        event.preventDefault();
        removeCorner(selectedRoom, selectedCorner);
      }
    }
    const release = () => { altHeld.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", release);
    };
  });

  /** Adds every door and window the drawing shows along the traced rooms that the plan lacks, as one step. */
  function findOpenings() {
    const scanned = scanOpenings(analysis.context, plan);
    const near = (first: Position2D, second: Position2D, limit: number) => distance(first, second) < limit;
    const doors = scanned.filter((entry) => entry.kind === "door" && (entry.swings || entry.jambs === 2) && !plan.doors.some((door) => near(door.at, entry.at, 30)))
      .map((entry) => ({ at: entry.at, width: entry.width, ...(entry.swingInto ? { swingInto: entry.swingInto } : {}) }));
    const windows = drawnWindows(plan, scanned).filter((window) => !plan.windows.some((entry) => near(entry.at, window.at, 40)));
    if (doors.length + windows.length === 0) return setNotice({ key: "review.foundNone", tone: "status" });
    dispatch({ type: "edit", edit: { type: "openings-add", doors, windows } });
    setNotice({ key: "review.foundOpenings", parameters: { doors: doors.length, windows: windows.length }, tone: "status" });
  }

  const modes: { mode: Mode; icon: typeof MousePointer2; label: TraceTranslationKey }[] = [
    { mode: "select", icon: MousePointer2, label: "review.mode.select" },
    { mode: "shape", icon: PenLine, label: "review.mode.shape" },
    { mode: "box", icon: Square, label: "review.mode.box" },
    { mode: "door", icon: DoorOpen, label: "review.mode.door" },
    { mode: "window", icon: AppWindow, label: "review.mode.window" },
  ];
  const selectedDoorPlaced = selectedDoor ? geometry.doors.find((door) => door.id === selectedDoor.id) ?? null : null;
  const swingChoices = selectedDoorPlaced ? selectedDoorPlaced.connects.map((id) => id === "outside" ? { value: "outside", label: t("review.door.outside") } : { value: traceIdOf(id) ?? id, label: roomName(traceIdOf(id)) }) : [];
  const swingNow = selectedDoor?.swingInto ?? (selectedDoorPlaced ? traceIdOf(selectedDoorPlaced.swingRoomId) : undefined);
  const editPreview = openingEdit ? editedSpan(openingEdit, openingEdit.along) : null;

  return (
    <div className="trace-body">
      <PlanView width={analysis.widthCm} height={analysis.heightCm} image={analysis.url} label={t("trace.plan")} zoomInLabel={t("trace.zoomIn")} zoomOutLabel={t("trace.zoomOut")} fitLabel={t("trace.fit")} hint={t("trace.panHint")} tool={tool} className={`trace-mode-${mode}`}>
        {(unit) => (
          <>
            {geometry.walls.map((wall) => {
              const selected = selection?.kind === "wall" && selection.id === wall.id;
              return <polygon key={wall.id} points={pathOf(wallPolygon(wall))} fill={selected ? TRACE_INK.wallSelected : TRACE_INK.wall} fillOpacity={selected ? 0.6 : 0.4} />;
            })}
            {plan.rooms.map((room, roomIndex) => {
              const points = shownPoints(room);
              const selected = selection?.kind === "room" && selection.id === room.id;
              const bounds = roomBounds({ points });
              const label = labelCorner(points);
              return (
                <g key={room.id}>
                  <polygon points={pathOf(points)} fill={KIND_COLORS[room.kind]} fillOpacity={selected ? 0.55 : 0.35} />
                  {roomEdges({ points }).map((edge) => {
                    const dragged = (edgeDrag?.roomId === room.id && edgeDrag.index === edge.index) || (cornerDrag?.roomId === room.id && cornerDrag.moved && (edge.index === cornerDrag.index || (edge.index + 1) % points.length === cornerDrag.index));
                    const style = EDGE_STYLE[dragged ? "manual" : room.edges[edge.index]?.status ?? "manual"];
                    const lit = highlight?.roomId === room.id && highlight.index === edge.index;
                    return <line key={edge.index} x1={edge.start.x} y1={edge.start.z} x2={edge.end.x} y2={edge.end.z} stroke={lit ? TRACE_INK.lit : style.stroke} strokeWidth={(lit ? 6 : style.width) * unit} strokeDasharray={style.dash && !lit ? `${style.dash[0] * unit} ${style.dash[1] * unit}` : undefined} strokeLinecap="round" />;
                  })}
                  <text x={label.x + 6 * unit} y={label.z + 16 * unit} fontSize={12 * unit} className="trace-room-label">{geometry.rooms[roomIndex].name[language]}</text>
                  <text x={label.x + 6 * unit} y={label.z + 31 * unit} fontSize={11 * unit} className="trace-room-size">{isBoxRoom({ points }) ? `${formatCm(bounds.maxX - bounds.minX, language)} × ${formatCm(bounds.maxZ - bounds.minZ, language)}` : `${formatCm(Math.round(polygonArea(points) / 1000) / 10, language)} m²`}</text>
                  {selected && roomEdges({ points }).map((edge) => {
                    const at = middle(edge.start, edge.end);
                    return <rect key={`edge-${edge.index}`} x={at.x - HANDLE_PX * 0.8 * unit} y={at.z - HANDLE_PX * 0.8 * unit} width={HANDLE_PX * 1.6 * unit} height={HANDLE_PX * 1.6 * unit} fill={TRACE_INK.handleFill} stroke={TRACE_INK.handle} strokeWidth={2 * unit} className="trace-handle" />;
                  })}
                  {selected && points.map((point, index) => <circle key={`corner-${index}`} cx={point.x} cy={point.z} r={HANDLE_PX * unit} fill={selectedCorner === index ? TRACE_INK.handle : TRACE_INK.handleFill} stroke={TRACE_INK.handle} strokeWidth={2 * unit} className="trace-handle" />)}
                </g>
              );
            })}
            {geometry.doors.map((door) => {
              const leaf = doorGeometry(door, pseudoFlat);
              const selected = selection?.kind === "door" && selection.id === door.id;
              const color = selected ? TRACE_INK.selection : plan.doors.find((entry) => entry.id === door.id)?.flagged ? TRACE_INK.doorFlagged : TRACE_INK.door;
              const wall = geometry.walls.find((entry) => entry.id === door.wallId)!;
              const ends = openingEndpoints(door, wall);
              return (
                <g key={door.id}>
                  <line x1={ends.start.x} y1={ends.start.z} x2={ends.end.x} y2={ends.end.z} stroke={TRACE_INK.doorGap} strokeWidth={wall.thickness} />
                  <path d={`M ${leaf.closedEnd.x} ${leaf.closedEnd.z} A ${door.width} ${door.width} 0 0 ${leaf.sweep} ${leaf.openEnd.x} ${leaf.openEnd.z}`} fill="none" stroke={color} strokeWidth={1.5 * unit} strokeDasharray={`${4 * unit} ${3 * unit}`} />
                  <line x1={leaf.hinge.x} y1={leaf.hinge.z} x2={leaf.openEnd.x} y2={leaf.openEnd.z} stroke={color} strokeWidth={3 * unit} />
                  <circle cx={leaf.hinge.x} cy={leaf.hinge.z} r={3 * unit} fill={color} />
                  {selected && [ends.start, ends.end].map((end, index) => <circle key={index} cx={end.x} cy={end.z} r={HANDLE_PX * unit} fill={TRACE_INK.handleFill} stroke={TRACE_INK.handle} strokeWidth={2 * unit} className="trace-handle" />)}
                  {selected && <circle cx={door.position.x} cy={door.position.z} r={5 * unit} fill={TRACE_INK.handle} />}
                </g>
              );
            })}
            {geometry.windows.map((window) => {
              const wall = geometry.walls.find((entry) => entry.id === window.wallId)!;
              const ends = openingEndpoints(window, wall);
              const selected = selection?.kind === "window" && selection.id === window.id;
              return (
                <g key={window.id}>
                  <line x1={ends.start.x} y1={ends.start.z} x2={ends.end.x} y2={ends.end.z} stroke={selected ? TRACE_INK.selection : TRACE_INK.window} strokeWidth={6 * unit} strokeLinecap="round" />
                  {selected && [ends.start, ends.end].map((end, index) => <circle key={index} cx={end.x} cy={end.z} r={HANDLE_PX * unit} fill={TRACE_INK.handleFill} stroke={TRACE_INK.handle} strokeWidth={2 * unit} className="trace-handle" />)}
                  {selected && <circle cx={window.position.x} cy={window.position.z} r={5 * unit} fill={TRACE_INK.handle} />}
                </g>
              );
            })}
            {geometry.problems.map((problem) => {
              const entry = plan.doors.find((door) => door.id === problem.id) ?? plan.windows.find((window) => window.id === problem.id);
              return entry && <circle key={problem.id} cx={entry.at.x} cy={entry.at.z} r={7 * unit} fill={TRACE_INK.problem} fillOpacity={0.6} stroke={TRACE_INK.problemRule} strokeWidth={2 * unit} />;
            })}
            {box && <rect x={Math.min(box.from.x, box.to.x)} y={Math.min(box.from.z, box.to.z)} width={Math.abs(box.to.x - box.from.x)} height={Math.abs(box.to.z - box.from.z)} fill={TRACE_INK.selection} fillOpacity={0.13} stroke={TRACE_INK.selection} strokeWidth={2 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />}
            {shape && (
              <g pointerEvents="none">
                <polyline points={pathOf(hover ? [...shape, hover.point] : shape)} fill={hover?.snap === "close" ? TRACE_INK.selection : "none"} fillOpacity={0.13} stroke={TRACE_INK.selection} strokeWidth={2.5 * unit} strokeLinejoin="round" />
                {shape.map((point, index) => <circle key={index} cx={point.x} cy={point.z} r={(index === 0 ? HANDLE_PX : 4) * unit} fill={index === 0 ? TRACE_INK.handleFill : TRACE_INK.handle} stroke={TRACE_INK.handle} strokeWidth={2 * unit} />)}
                {hover && shape.length > 0 && (() => {
                  const last = shape.at(-1)!;
                  const at = middle(last, hover.point);
                  return <text x={at.x + 8 * unit} y={at.z - 8 * unit} fontSize={12 * unit} strokeWidth={3 * unit} className="trace-measure">{formatCm(Math.round(distance(last, hover.point)), language)} {t("trace.cm")}</text>;
                })()}
              </g>
            )}
            {opening && (() => {
              const span = openingSpan(opening.hit.edge, opening.from, opening.to);
              return (
                <g pointerEvents="none">
                  <line x1={span.start.x} y1={span.start.z} x2={span.end.x} y2={span.end.z} stroke={opening.kind === "door" ? TRACE_INK.door : TRACE_INK.window} strokeWidth={7 * unit} strokeLinecap="round" />
                  <circle cx={span.start.x} cy={span.start.z} r={5 * unit} fill={TRACE_INK.handle} />
                  <text x={span.at.x + 10 * unit} y={span.at.z - 10 * unit} fontSize={12 * unit} strokeWidth={3 * unit} className="trace-measure">{formatCm(span.width, language)} {t("trace.cm")}</text>
                </g>
              );
            })()}
            {openingEdit && editPreview && (() => {
              const [from, to] = editPreview;
              const [start, end] = [wallPoint(openingEdit.wall, from), wallPoint(openingEdit.wall, to)];
              const at = middle(start, end);
              return (
                <g pointerEvents="none">
                  <line x1={start.x} y1={start.z} x2={end.x} y2={end.z} stroke={TRACE_INK.selection} strokeWidth={7 * unit} strokeLinecap="round" strokeOpacity={0.7} />
                  <text x={at.x + 10 * unit} y={at.z - 10 * unit} fontSize={12 * unit} strokeWidth={3 * unit} className="trace-measure">{formatCm(Math.round(Math.abs(to - from) * 2) / 2, language)} {t("trace.cm")}</text>
                </g>
              );
            })()}
          </>
        )}
      </PlanView>
      <aside className="trace-panel" aria-labelledby="trace-review-title">
        <h2 id="trace-review-title">{t("review.title")}</h2>
        <p className="constraint-note">{state.readBy === "ai" ? t("review.readByAi", { model: state.model ?? "AI" }) : t("review.manual")}</p>
        {state.aiNotes && (
          <ul className="trace-checklist trace-notes">
            <li>{t("review.found", { rooms: plan.rooms.length, doors: plan.doors.length, windows: plan.windows.length })}</li>
            {state.aiNotes.outside > 0 && <li>{t("review.outside", { count: state.aiNotes.outside })}</li>}
            {state.aiNotes.dropped > 0 && <li>{t("review.dropped", { count: state.aiNotes.dropped })}</li>}
            {state.aiNotes.diagonal && <li>{t("review.diagonal")}</li>}
          </ul>
        )}
        <div className="trace-toolbar">
          <div className="segmented trace-modes" role="group" aria-label={t("review.tools")}>
            {modes.map((entry) => <button key={entry.mode} type="button" aria-pressed={mode === entry.mode} title={t(entry.label)} onClick={() => setMode(entry.mode)}><entry.icon size={16} aria-hidden="true" /><span>{t(entry.label)}</span></button>)}
          </div>
          <div className="history-tools">
            <button type="button" className="icon-button" disabled={state.past.length === 0} aria-label={t("review.undo")} title={t("review.undo")} onClick={() => dispatch({ type: "undo" })}><Undo2 size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" disabled={state.future.length === 0} aria-label={t("review.redo")} title={t("review.redo")} onClick={() => dispatch({ type: "redo" })}><Redo2 size={18} aria-hidden="true" /></button>
          </div>
        </div>
        {mode === "shape" && (
          <section className="trace-selection" aria-label={t("review.mode.shape")}>
            <p className="constraint-note">{t("review.shape.hint")}</p>
            {shape && <p>{t("review.shape.corners", { count: shape.length })}</p>}
            <div className="trace-shape-actions">
              <button type="button" className="primary-button" disabled={!shape || shape.length < 3} onClick={() => shape && finishShape(shape)}><Check size={16} aria-hidden="true" />{t("review.shape.finish")}</button>
              <button type="button" className="secondary-button" disabled={!shape} onClick={removeLastCorner}><Undo2 size={16} aria-hidden="true" />{t("review.shape.undo")}</button>
              <button type="button" className="secondary-button" disabled={!shape} onClick={() => { setShape(null); setHover(null); }}><X size={16} aria-hidden="true" />{t("review.shape.cancel")}</button>
            </div>
          </section>
        )}
        {(mode === "door" || mode === "window") && <p className="constraint-note">{t(mode === "door" ? "review.dragDoor" : "review.dragWindow")}</p>}
        <button type="button" className="secondary-button" disabled={plan.rooms.length === 0} onClick={findOpenings}><ScanSearch size={17} aria-hidden="true" />{t("review.findOpenings")}</button>
        {notice && <p className={notice.tone === "error" ? "field-error" : "suggestion-status"} role="status">{t(notice.key, notice.parameters)}</p>}
        <p className="constraint-note">{t("review.legend")}</p>
        {plan.rooms.length === 0 ? <p className="trace-warning">{t("review.empty")}</p> : unchecked > 0 ? <p className="trace-warning" role="status">{t("review.unchecked", { count: unchecked })}</p> : <p className="trace-ok" role="status"><Check size={16} aria-hidden="true" />{t("review.allChecked")}</p>}

        {selectedRoom && (() => {
          const bounds = roomBounds(selectedRoom);
          const width = formatCm(bounds.maxX - bounds.minX, language);
          const depth = formatCm(bounds.maxZ - bounds.minZ, language);
          const area = formatCm(Math.round(polygonArea(selectedRoom.points) / 1000) / 10, language);
          return (
            <section className="trace-selection" aria-label={t("review.room")}>
              <h3>{roomName(selectedRoom.id)}</h3>
              <label className="room-picker trace-field">{t("review.room.kind")}
                <select value={selectedRoom.kind} onChange={(event) => dispatch({ type: "edit", edit: { type: "room-update", id: selectedRoom.id, kind: event.target.value as RoomKind } })}>
                  {ROOM_KINDS.map((kind) => <option key={kind} value={kind}>{ROOM_KIND_NAMES[kind][language]}</option>)}
                </select>
              </label>
              <p>{isBoxRoom(selectedRoom) ? t("review.room.size", { width, depth, area }) : t("review.room.shapeSize", { area, corners: selectedRoom.points.length, width, depth })}</p>
              {selectedCorner !== null && (
                <div className="trace-corner">
                  <span>{t("review.corner.selected", { number: selectedCorner + 1 })}</span>
                  <button type="button" className="secondary-button" disabled={selectedRoom.points.length <= 3} onClick={() => removeCorner(selectedRoom, selectedCorner)}><Trash2 size={15} aria-hidden="true" />{t("review.corner.remove")}</button>
                </div>
              )}
              <h4>{t("review.edges")}</h4>
              <ul className="trace-edges">
                {roomEdges(selectedRoom).map((edge) => {
                  const record = selectedRoom.edges[edge.index] ?? { status: "manual" as const };
                  return (
                    <li key={edge.index} data-status={record.status} onMouseEnter={() => setHighlight({ roomId: selectedRoom.id, index: edge.index })} onMouseLeave={() => setHighlight(null)} onFocus={() => setHighlight({ roomId: selectedRoom.id, index: edge.index })} onBlur={() => setHighlight(null)}>
                      <span><strong>{t("review.edge.label", { number: edge.index + 1, side: t(edge.side ? `review.side.${edge.side}` : "review.side.angled") })}</strong> · {formatCm(Math.round(edge.length), language)} {t("trace.cm")} · {record.status === "verified" && record.thickness !== undefined ? t("review.edge.thickness", { thickness: formatCm(record.thickness, language) }) : t(`review.edge.${record.status}`)}</span>
                      {record.status === "unverified" && <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "edge-checked", id: selectedRoom.id, index: edge.index } })}><Check size={15} aria-hidden="true" />{t("review.edge.check")}</button>}
                    </li>
                  );
                })}
              </ul>
              <p className="constraint-note">{t("review.edge.drag")}</p>
              <button type="button" className="delete-item-button" onClick={() => dispatch({ type: "edit", edit: { type: "room-delete", id: selectedRoom.id } })}><Trash2 size={16} aria-hidden="true" />{t("review.room.delete")}</button>
            </section>
          );
        })()}

        {selectedDoor && (
          <section className="trace-selection" aria-label={t("review.door")}>
            <h3>{t("review.door")}</h3>
            <NumberField id={`door-width-${selectedDoor.id}`} label={t("review.door.width")} unit={t("trace.cm")} value={selectedDoor.width} minimum={50} maximum={200} onChange={(width) => dispatch({ type: "edit", edit: { type: "door-update", id: selectedDoor.id, patch: { width, flagged: false } } })} />
            {selectedDoor.flagged && <p className="trace-warning">{t("review.door.flagged")}</p>}
            {selectedDoorPlaced && (
              <>
                <div className="trace-field">
                  <span>{t("review.door.swing")}</span>
                  <div className="segmented" role="group" aria-label={t("review.door.swing")}>
                    {swingChoices.map((choice) => <button key={choice.value} type="button" aria-pressed={swingNow === choice.value || (choice.value === "outside" && selectedDoor.swingInto === "outside")} onClick={() => dispatch({ type: "edit", edit: { type: "door-update", id: selectedDoor.id, patch: { swingInto: choice.value } } })}>{choice.label}</button>)}
                  </div>
                </div>
                <div className="trace-field">
                  <span>{t("review.door.hinge")}</span>
                  <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "door-update", id: selectedDoor.id, patch: { hinge: selectedDoor.hinge === "high" ? "low" : "high" } } })}><ArrowLeftRight size={16} aria-hidden="true" />{t("review.door.flip")}</button>
                </div>
                <p className="constraint-note">{t("review.opening.drag")}</p>
              </>
            )}
            <button type="button" className="delete-item-button" onClick={() => dispatch({ type: "edit", edit: { type: "door-delete", id: selectedDoor.id } })}><Trash2 size={16} aria-hidden="true" />{t("review.door.delete")}</button>
          </section>
        )}

        {selectedWindow && (
          <section className="trace-selection" aria-label={t("review.window")}>
            <h3>{t("review.window")}</h3>
            <NumberField id={`window-width-${selectedWindow.id}`} label={t("review.window.width")} unit={t("trace.cm")} value={selectedWindow.width} minimum={20} maximum={1000} onChange={(width) => dispatch({ type: "edit", edit: { type: "window-update", id: selectedWindow.id, patch: { width } } })} />
            <p className="constraint-note">{t("review.opening.drag")}</p>
            <button type="button" className="delete-item-button" onClick={() => dispatch({ type: "edit", edit: { type: "window-delete", id: selectedWindow.id } })}><Trash2 size={16} aria-hidden="true" />{t("review.window.delete")}</button>
          </section>
        )}

        {selection?.kind === "wall" && (
          <section className="trace-selection">
            {selection.rooms ? (
              <>
                <p>{t("review.wall.inner", { first: roomName(selection.rooms[0]), second: roomName(selection.rooms[1]) })}</p>
                <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "open-pair", rooms: selection.rooms!, open: true } })}>{t("review.wall.remove")}</button>
              </>
            ) : <p>{t("review.wall.outer")}</p>}
          </section>
        )}

        {plan.openPairs.length > 0 && (
          <section className="trace-selection" aria-labelledby="trace-open-title">
            <h3 id="trace-open-title">{t("review.open")}</h3>
            <ul className="trace-edges">
              {plan.openPairs.map((pair) => (
                <li key={pair.join("|")}>
                  <span>{t("review.open.item", { first: roomName(pair[0]), second: roomName(pair[1]) })}</span>
                  <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit", edit: { type: "open-pair", rooms: pair, open: false } })}>{t("review.open.restore")}</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="trace-fields">
          <div className="dimension-field">
            <label htmlFor="trace-ceiling">{t("review.ceiling")}</label>
            <div className="input-with-unit"><input id="trace-ceiling" type="text" inputMode="decimal" value={state.ceiling} aria-describedby="trace-ceiling-range" onChange={(event) => dispatch({ type: "ceiling", value: event.target.value })} /><span>{t("trace.cm")}</span></div>
            <p id="trace-ceiling-range" className="field-hint">{t("review.ceilingRange")}</p>
          </div>
          <div className="dimension-field">
            <label htmlFor="trace-area">{t("review.area")}</label>
            <div className="input-with-unit"><input id="trace-area" type="text" inputMode="decimal" value={state.declaredArea} aria-describedby="trace-area-hint" onChange={(event) => dispatch({ type: "declared-area", value: event.target.value })} /><span>{t("review.areaUnit")}</span></div>
            <p id="trace-area-hint" className="field-hint">{t("review.areaHint")}</p>
          </div>
        </div>
        <div className="trace-actions">
          <button type="button" className="primary-button" disabled={plan.rooms.length === 0} onClick={() => dispatch({ type: "step", step: "check" })}>{t("review.next")}<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </aside>
    </div>
  );
}
