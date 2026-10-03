import { DEMO_FLAT, FLAT_FURNITURE } from "../../data/flat-preset";
import { containingRoom } from "../../lib/geometry/architecture";
import { furnitureDraft, validateFurnitureDraft } from "../../lib/geometry/edit";
import { validateInput } from "../../lib/geometry/input";
import { proposeItemEdit, validateDistanceLock, type LockSetupIssue } from "../../lib/geometry/locks";
import type { EditorInputIssue, FlatFurniture, FurnitureDraft, Language, LayoutLocks, LayoutSnapshot, LockViolation } from "../../types/domain";

export type LayoutView = "before" | "after";

export interface EditorState {
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
  cameraRevision: number;
}

export function copySnapshot(snapshot: LayoutSnapshot): LayoutSnapshot {
  return { ceilingHeight: snapshot.ceilingHeight, furniture: snapshot.furniture.map((item) => ({ ...item, name: { ...item.name }, position: { ...item.position } })) };
}

export function createEditorState(): EditorState {
  const current: LayoutSnapshot = { ceilingHeight: DEMO_FLAT.height, furniture: FLAT_FURNITURE.map((item) => ({ ...item, position: { ...item.position } })) };
  return { current, baseline: copySnapshot(current), locks: { position: [], distance: [] }, selectedId: current.furniture[0].id, selectedRoomId: "living", focusedIds: [current.furniture[0].id], language: "en", view: "after", draft: furnitureDraft(current.furniture[0]), inputIssues: [], ceilingInput: String(DEMO_FLAT.height), ceilingIssue: null, lockNotice: [], lockNoticeContext: "edit", lockSetupIssue: null, nextLockNumber: 1, cameraRevision: 0 };
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
  | { type: "view"; view: LayoutView }
  | { type: "reset" };

function commitProposal(state: EditorState, proposed: FlatFurniture, rawDraft?: FurnitureDraft): EditorState {
  if (state.view === "before") return state;
  const candidate = { ...proposed, roomId: containingRoom(DEMO_FLAT, proposed.position)?.id ?? proposed.roomId };
  const result = proposeItemEdit(state.current.furniture, candidate, state.locks);
  if (!result.accepted) return { ...state, draft: state.selectedId === result.item.id ? furnitureDraft(result.item) : state.draft, inputIssues: [], lockNotice: result.violations, lockNoticeContext: "edit" };
  return { ...state, current: { ...state.current, furniture: state.current.furniture.map((item) => item.id === result.item.id ? result.item : item) }, draft: state.selectedId === result.item.id ? rawDraft ?? furnitureDraft(result.item) : state.draft, inputIssues: [], lockNotice: [] };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
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
      const result = validateFurnitureDraft(draft, item, DEMO_FLAT);
      return result.complete ? commitProposal(state, result.item, draft) : { ...state, draft, inputIssues: result.issues, lockNotice: [] };
    }
    case "normalise-draft": {
      const item = state.current.furniture.find((entry) => entry.id === state.selectedId);
      return item && state.inputIssues.length === 0 && state.view === "after" ? { ...state, draft: furnitureDraft(item) } : state;
    }
    case "ceiling": {
      if (state.view === "before") return state;
      const result = validateInput({ width: "1", depth: "1", height: "1", roomHeight: action.value, orientation: 0 }, DEMO_FLAT);
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
    case "view": {
      const snapshot = action.view === "before" ? state.baseline : state.current;
      const item = snapshot.furniture.find((entry) => entry.id === state.selectedId) ?? snapshot.furniture[0];
      return { ...state, view: action.view, selectedId: item?.id ?? null, focusedIds: item ? [item.id] : [], draft: item ? furnitureDraft(item) : null, inputIssues: [], lockNotice: [] };
    }
    case "reset":
      return { ...createEditorState(), language: state.language, cameraRevision: state.cameraRevision + 1 };
  }
}