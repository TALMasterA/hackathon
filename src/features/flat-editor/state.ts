import { DEMO_FLAT, FLAT_FURNITURE } from "../../data/flat-preset";
import { containingRoom } from "../../lib/geometry/architecture";
import { furnitureDraft, validateFurnitureDraft } from "../../lib/geometry/edit";
import { validateInput } from "../../lib/geometry/input";
import { proposeItemEdit } from "../../lib/geometry/locks";
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
  cameraRevision: number;
}

export function copySnapshot(snapshot: LayoutSnapshot): LayoutSnapshot {
  return { ceilingHeight: snapshot.ceilingHeight, furniture: snapshot.furniture.map((item) => ({ ...item, name: { ...item.name }, position: { ...item.position } })) };
}

export function createEditorState(): EditorState {
  const current: LayoutSnapshot = { ceilingHeight: DEMO_FLAT.height, furniture: FLAT_FURNITURE.map((item) => ({ ...item, position: { ...item.position } })) };
  return { current, baseline: copySnapshot(current), locks: { position: [], distance: [] }, selectedId: current.furniture[0].id, selectedRoomId: "living", focusedIds: [current.furniture[0].id], language: "en", view: "after", draft: furnitureDraft(current.furniture[0]), inputIssues: [], ceilingInput: String(DEMO_FLAT.height), ceilingIssue: null, lockNotice: [], cameraRevision: 0 };
}

export type EditorAction =
  | { type: "select"; id: string; focusedIds?: string[] }
  | { type: "room"; id: string }
  | { type: "language"; language: Language }
  | { type: "propose"; item: FlatFurniture }
  | { type: "draft"; field: keyof FurnitureDraft; value: string }
  | { type: "normalise-draft" }
  | { type: "ceiling"; value: string }
  | { type: "view"; view: LayoutView }
  | { type: "reset" };

function commitProposal(state: EditorState, proposed: FlatFurniture, rawDraft?: FurnitureDraft): EditorState {
  if (state.view === "before") return state;
  const candidate = { ...proposed, roomId: containingRoom(DEMO_FLAT, proposed.position)?.id ?? proposed.roomId };
  const result = proposeItemEdit(state.current.furniture, candidate, state.locks);
  if (!result.accepted) return { ...state, draft: state.selectedId === result.item.id ? furnitureDraft(result.item) : state.draft, inputIssues: [], lockNotice: result.violations };
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
    case "view": {
      const snapshot = action.view === "before" ? state.baseline : state.current;
      const item = snapshot.furniture.find((entry) => entry.id === state.selectedId) ?? snapshot.furniture[0];
      return { ...state, view: action.view, selectedId: item?.id ?? null, focusedIds: item ? [item.id] : [], draft: item ? furnitureDraft(item) : null, inputIssues: [], lockNotice: [] };
    }
    case "reset":
      return { ...createEditorState(), language: state.language, cameraRevision: state.cameraRevision + 1 };
  }
}