import { DEMO_FLAT, FURNITURE_LIBRARY } from "../../data/flat-preset";
import { FLAT_SCENARIOS, type ScenarioId } from "../../data/flat-scenarios";
import { containingRoom } from "../../lib/geometry/architecture";
import { furnitureDraft, validateFurnitureDraft } from "../../lib/geometry/edit";
import { validateInput } from "../../lib/geometry/input";
import { normalizeAngle } from "../../lib/geometry/oriented";
import { proposeItemEdit, validateDistanceLock, type LockSetupIssue } from "../../lib/geometry/locks";
import type { EditorInputIssue, Flat, FlatFurniture, FurnitureDraft, Language, LayoutLocks, LayoutSnapshot, LockViolation, SuggestionReport } from "../../types/domain";
import { placeLibraryItem, suggestFurniture } from "./layout";

export type LayoutView = "before" | "after";

export const HISTORY_LIMIT = 100;

export interface EditorDocument {
  current: LayoutSnapshot;
  baseline: LayoutSnapshot;
  locks: LayoutLocks;
  nextItemNumber: number;
  nextLockNumber: number;
}

export interface EditorState {
  /** The flat being furnished; replacing it starts a new document (see "use-flat"). */
  flat: Flat;
  current: LayoutSnapshot;
  baseline: LayoutSnapshot;
  locks: LayoutLocks;
  selectedId: string | null;
  selectedRoomId: string;
  focusedIds: string[];
  language: Language;
  view: LayoutView;
  draft: FurnitureDraft | null;
  inputIssues: EditorInputIssue[];
  ceilingInput: string;
  ceilingIssue: EditorInputIssue | null;
  lockNotice: LockViolation[];
  lockNoticeContext: "edit" | "setup";
  lockSetupIssue: LockSetupIssue | null;
  nextLockNumber: number;
  nextItemNumber: number;
  libraryFullRoomId: string | null;
  suggestionReport: SuggestionReport | null;
  cameraRevision: number;
  past: EditorDocument[];
  future: EditorDocument[];
  gesture: EditorDocument | null;
  coalesceKey: string | null;
}

export function copySnapshot(snapshot: LayoutSnapshot): LayoutSnapshot {
  return { ceilingHeight: snapshot.ceilingHeight, furniture: snapshot.furniture.map((item) => ({ ...item, name: { ...item.name }, position: { ...item.position } })) };
}

/** The room new library items go to by default: the first living room, else the first room. */
export function defaultRoomId(flat: Flat): string {
  return (flat.rooms.find((room) => room.kind === "living") ?? flat.rooms[0])?.id ?? "";
}

export function createEditorState(flat: Flat = DEMO_FLAT): EditorState {
  const current: LayoutSnapshot = { ceilingHeight: flat.height, furniture: [] };
  return { flat, current, baseline: copySnapshot(current), locks: { position: [], distance: [] }, selectedId: null, selectedRoomId: defaultRoomId(flat), focusedIds: [], language: "en", view: "after", draft: null, inputIssues: [], ceilingInput: String(flat.height), ceilingIssue: null, lockNotice: [], lockNoticeContext: "edit", lockSetupIssue: null, nextLockNumber: 1, nextItemNumber: 1, libraryFullRoomId: null, suggestionReport: null, cameraRevision: 0, past: [], future: [], gesture: null, coalesceKey: null };
}

export type EditorAction =
  | { type: "select"; id: string; focusedIds?: string[] }
  | { type: "room"; id: string }
  | { type: "language"; language: Language }
  | { type: "propose"; item: FlatFurniture }
  | { type: "draft"; field: keyof FurnitureDraft; value: string }
  | { type: "normalise-draft" }
  | { type: "ceiling"; value: string }
  | { type: "position-lock"; id: string }
  | { type: "distance-lock"; id?: string; firstId: string; secondId: string; minimum: string }
  | { type: "remove-distance-lock"; id: string }
  | { type: "add-item"; templateId: string }
  | { type: "replace-item"; templateId: string }
  | { type: "delete-item"; id: string }
  | { type: "suggest"; roomId: string | "all" }
  | { type: "baseline" }
  | { type: "view"; view: LayoutView }
  | { type: "reset" }
  | { type: "gesture-start" }
  | { type: "gesture-end" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "use-flat"; flat: Flat };

type EditAction = Exclude<EditorAction, { type: "gesture-start" | "gesture-end" | "undo" | "redo" | "use-flat" }>;

function editorDocument(state: EditorState): EditorDocument {
  return { current: state.current, baseline: state.baseline, locks: state.locks, nextItemNumber: state.nextItemNumber, nextLockNumber: state.nextLockNumber };
}

function deepEqual(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (typeof first !== "object" || typeof second !== "object" || first === null || second === null || Array.isArray(first) !== Array.isArray(second)) return false;
  const firstRecord = first as Record<string, unknown>;
  const secondRecord = second as Record<string, unknown>;
  const keys = Object.keys(firstRecord);
  return keys.length === Object.keys(secondRecord).length && keys.every((key) => key in secondRecord && deepEqual(firstRecord[key], secondRecord[key]));
}

function sameDocument(first: EditorDocument, second: EditorDocument): boolean {
  if (first.current === second.current && first.baseline === second.baseline && first.locks === second.locks && first.nextItemNumber === second.nextItemNumber && first.nextLockNumber === second.nextLockNumber) return true;
  return deepEqual(first, second);
}

function pushHistory(state: EditorState, document: EditorDocument): EditorState {
  return { ...state, past: [...state.past, document].slice(-HISTORY_LIMIT), future: [] };
}

function endGesture(state: EditorState): EditorState {
  if (!state.gesture) return state;
  const ended = { ...state, gesture: null };
  return sameDocument(state.gesture, editorDocument(state)) ? ended : pushHistory(ended, state.gesture);
}

function restoreDocument(state: EditorState, document: EditorDocument, past: EditorDocument[], future: EditorDocument[]): EditorState {
  const item = document.current.furniture.find((entry) => entry.id === state.selectedId);
  return { ...state, ...document, past, future, selectedId: item?.id ?? null, focusedIds: item ? [item.id] : [], draft: item ? furnitureDraft(item) : null, inputIssues: [], ceilingInput: String(document.current.ceilingHeight), ceilingIssue: null, lockNotice: [], lockSetupIssue: null, libraryFullRoomId: null, suggestionReport: null, gesture: null, coalesceKey: null };
}

function coalesceKeyFor(state: EditorState, action: EditAction): string | null {
  if (action.type === "draft") return `${state.selectedId}:${action.field}`;
  return action.type === "ceiling" ? "ceiling" : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "undo":
      if (state.view === "before" || state.past.length === 0) return state;
      return restoreDocument(state, state.past[state.past.length - 1], state.past.slice(0, -1), [editorDocument(state), ...state.future]);
    case "redo":
      if (state.view === "before" || state.future.length === 0) return state;
      return restoreDocument(state, state.future[0], [...state.past, editorDocument(state)].slice(-HISTORY_LIMIT), state.future.slice(1));
    case "gesture-start": {
      const closed = endGesture(state);
      return { ...closed, gesture: editorDocument(closed), coalesceKey: null };
    }
    case "gesture-end":
      return endGesture(state);
    case "use-flat":
      // Furniture, locks and history from one flat make no sense in another, so this is a fresh start, not an undoable step.
      return { ...createEditorState(action.flat), language: state.language, cameraRevision: state.cameraRevision + 1 };
  }
  const before = editorDocument(state);
  const next = applyEdit(state, action);
  const key = coalesceKeyFor(state, action);
  if (key !== null && key === state.coalesceKey) return next;
  const changed = !sameDocument(before, editorDocument(next));
  const report = changed && action.type !== "suggest" ? null : next.suggestionReport;
  if (changed && !(state.gesture && action.type === "propose")) return { ...pushHistory(next, before), coalesceKey: key, suggestionReport: report };
  return next.coalesceKey === null && next.suggestionReport === report ? next : { ...next, coalesceKey: null, suggestionReport: report };
}

function commitProposal(state: EditorState, proposed: FlatFurniture, rawDraft?: FurnitureDraft): EditorState {
  if (state.view === "before") return state;
  const candidate = { ...proposed, orientation: normalizeAngle(proposed.orientation), roomId: containingRoom(state.flat, proposed.position)?.id ?? proposed.roomId };
  const result = proposeItemEdit(state.current.furniture, candidate, state.locks);
  if (!result.accepted) return { ...state, draft: state.selectedId === result.item.id ? furnitureDraft(result.item) : state.draft, inputIssues: [], lockNotice: result.violations, lockNoticeContext: "edit" };
  const previous = state.current.furniture.find((item) => item.id === result.item.id)!;
  return { ...state, current: { ...state.current, furniture: state.current.furniture.map((item) => item.id === result.item.id ? result.item : item) }, selectedRoomId: state.selectedId === result.item.id && previous.roomId !== result.item.roomId ? result.item.roomId : state.selectedRoomId, draft: state.selectedId === result.item.id ? rawDraft ?? furnitureDraft(result.item) : state.draft, inputIssues: [], lockNotice: [] };
}

function applyEdit(state: EditorState, action: EditAction): EditorState {
  switch (action.type) {
    case "select": {
      const snapshot = state.view === "before" ? state.baseline : state.current;
      const item = snapshot.furniture.find((entry) => entry.id === action.id);
      return item ? { ...state, selectedId: item.id, selectedRoomId: item.roomId, focusedIds: action.focusedIds ?? [item.id], draft: furnitureDraft(item), inputIssues: [], lockNotice: [] } : state;
    }
    case "room":
      return { ...state, selectedRoomId: action.id };
    case "language":
      return { ...state, language: action.language };
    case "propose":
      return commitProposal(state, action.item);
    case "draft": {
      if (state.view === "before" || !state.draft) return state;
      const item = state.current.furniture.find((entry) => entry.id === state.selectedId);
      if (!item) return state;
      const draft = { ...state.draft, [action.field]: action.value };
      const result = validateFurnitureDraft(draft, item, state.flat);
      return result.complete ? commitProposal(state, result.item, draft) : { ...state, draft, inputIssues: result.issues, lockNotice: [] };
    }
    case "normalise-draft": {
      const item = state.current.furniture.find((entry) => entry.id === state.selectedId);
      return item && state.inputIssues.length === 0 && state.view === "after" ? { ...state, draft: furnitureDraft(item) } : state;
    }
    case "ceiling": {
      if (state.view === "before") return state;
      const result = validateInput({ width: "1", depth: "1", height: "1", roomHeight: action.value, orientation: 0 }, state.flat);
      return result.complete
        ? { ...state, ceilingInput: action.value, ceilingIssue: null, current: { ...state.current, ceilingHeight: result.roomHeight } }
        : { ...state, ceilingInput: action.value, ceilingIssue: { ...result.issues[0], field: "ceilingHeight" } };
    }
    case "position-lock": {
      if (state.view === "before" || !state.current.furniture.some((item) => item.id === action.id)) return state;
      const position = state.locks.position.includes(action.id) ? state.locks.position.filter((id) => id !== action.id) : [...state.locks.position, action.id];
      return { ...state, locks: { ...state.locks, position }, lockNotice: [] };
    }
    case "distance-lock": {
      if (state.view === "before") return state;
      const id = action.id ?? `distance-${state.nextLockNumber}`;
      if (action.id && !state.locks.distance.some((lock) => lock.id === action.id)) return state;
      const result = validateDistanceLock(state.current.furniture, { ...action, id });
      if (result.status === "input") return { ...state, lockSetupIssue: result.issue, lockNotice: [] };
      if (result.status === "violated") return { ...state, lockSetupIssue: null, lockNotice: result.violations, lockNoticeContext: "setup" };
      const distance = action.id ? state.locks.distance.map((lock) => lock.id === action.id ? result.lock : lock) : [...state.locks.distance, result.lock];
      return { ...state, locks: { ...state.locks, distance }, lockSetupIssue: null, lockNotice: [], nextLockNumber: state.nextLockNumber + (action.id ? 0 : 1) };
    }
    case "remove-distance-lock":
      return state.view === "before" ? state : { ...state, locks: { ...state.locks, distance: state.locks.distance.filter((lock) => lock.id !== action.id) }, lockNotice: [], lockSetupIssue: null };
    case "add-item": {
      if (state.view === "before") return state;
      const template = FURNITURE_LIBRARY.find((entry) => entry.id === action.templateId);
      if (!template) return state;
      const item = placeLibraryItem({ ...state.flat, height: state.current.ceilingHeight }, state.current.furniture, template, state.selectedRoomId, `item-${state.nextItemNumber}`);
      if (!item) return { ...state, libraryFullRoomId: state.selectedRoomId };
      return { ...state, current: { ...state.current, furniture: [...state.current.furniture, item] }, selectedId: item.id, focusedIds: [item.id], draft: furnitureDraft(item), inputIssues: [], libraryFullRoomId: null, nextItemNumber: state.nextItemNumber + 1, lockNotice: [] };
    }
    case "replace-item": {
      if (state.view === "before") return state;
      const selected = state.current.furniture.find((entry) => entry.id === state.selectedId);
      const template = FURNITURE_LIBRARY.find((entry) => entry.id === action.templateId);
      return selected && template ? commitProposal(state, { ...selected, ...template, id: selected.id, roomId: selected.roomId, position: { ...selected.position }, orientation: selected.orientation, name: { ...template.name } }) : state;
    }
    case "delete-item": {
      if (state.view === "before") return state;
      const furniture = state.current.furniture.filter((item) => item.id !== action.id);
      const selected = state.selectedId === action.id ? furniture[0] : furniture.find((item) => item.id === state.selectedId);
      return { ...state, current: { ...state.current, furniture }, selectedId: selected?.id ?? null, focusedIds: selected ? [selected.id] : [], draft: selected ? furnitureDraft(selected) : null, inputIssues: [], locks: { position: state.locks.position.filter((id) => id !== action.id), distance: state.locks.distance.filter((lock) => lock.firstId !== action.id && lock.secondId !== action.id) }, lockNotice: [], lockSetupIssue: null, libraryFullRoomId: null };
    }
    case "suggest": {
      if (state.view === "before") return state;
      const result = suggestFurniture({ ...state.flat, height: state.current.ceilingHeight }, state.current.furniture, state.locks, action.roomId);
      const suggestionReport: SuggestionReport = { roomId: action.roomId, added: result.added.map((item) => item.id), skipped: result.skipped.map(({ item, reason }) => ({ id: item.id, name: item.name, reason })) };
      return { ...state, current: result.added.length > 0 ? { ...state.current, furniture: [...state.current.furniture, ...result.added] } : state.current, suggestionReport, libraryFullRoomId: null, lockNotice: [] };
    }
    case "baseline":
      return state.view === "before" || state.inputIssues.length > 0 || state.ceilingIssue ? state : { ...state, baseline: copySnapshot(state.current), lockNotice: [] };
    case "view": {
      const snapshot = action.view === "before" ? state.baseline : state.current;
      const item = snapshot.furniture.find((entry) => entry.id === state.selectedId) ?? snapshot.furniture[0];
      return { ...state, view: action.view, selectedId: item?.id ?? null, focusedIds: item ? [item.id] : [], draft: item ? furnitureDraft(item) : null, inputIssues: [], ceilingInput: String(state.current.ceilingHeight), ceilingIssue: null, lockNotice: [] };
    }
    case "reset":
      return { ...createEditorState(state.flat), language: state.language, cameraRevision: state.cameraRevision + 1, past: state.past, future: state.future };
  }
}

/** A built-in plan, or "own": the one traced or opened flat, which the next trace or flat file replaces. */
export type SessionId = ScenarioId | "own";

export interface ScenarioSessions {
  activeId: SessionId;
  sessions: Record<ScenarioId, EditorState> & { own?: EditorState };
}

/** Edits to the active document; a new flat goes through the session's own "use-flat" instead. */
export type SessionEditAction = Exclude<EditorAction, { type: "use-flat" }>;

export type SessionAction =
  | { type: "switch"; id: SessionId }
  | { type: "use-flat"; flat: Flat }
  | { type: "edit"; action: SessionEditAction };

export function createScenarioSessions(): ScenarioSessions {
  return { activeId: "harmony", sessions: { demo: createEditorState(FLAT_SCENARIOS.demo.flat), harmony: createEditorState(FLAT_SCENARIOS.harmony.flat) } };
}

/** The active plan's document; "own" only becomes active once it exists. */
export function activeSession(state: ScenarioSessions): EditorState {
  return state.sessions[state.activeId]!;
}

export function sessionReducer(state: ScenarioSessions, action: SessionAction): ScenarioSessions {
  const active = activeSession(state);
  if (action.type === "switch") {
    if (action.id === state.activeId || !state.sessions[action.id]) return state;
    return { activeId: action.id, sessions: { ...state.sessions, [state.activeId]: endGesture(active) } };
  }
  if (action.type === "use-flat") {
    // Only the user's own flat is replaced, as a fresh document; the built-in plans keep their work.
    const sessions = { ...state.sessions, [state.activeId]: endGesture(active) };
    return { activeId: "own", sessions: { ...sessions, own: editorReducer(sessions.own ?? active, { type: "use-flat", flat: action.flat }) } };
  }
  if (action.action.type === "language") {
    const { demo, harmony, own } = state.sessions;
    return { ...state, sessions: { demo: editorReducer(demo, action.action), harmony: editorReducer(harmony, action.action), ...(own ? { own: editorReducer(own, action.action) } : {}) } };
  }
  return { ...state, sessions: { ...state.sessions, [state.activeId]: editorReducer(active, action.action) } };
}
