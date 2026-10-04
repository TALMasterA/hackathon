import { layoutRevision } from "../flat-editor/revision";
import { editorReducer, type EditorAction, type EditorState, type ItemTransform } from "../flat-editor/state";

type ApplyAction = Extract<EditorAction, { type: "apply-layout" }>;
import { roomShape } from "./context";
import { validateLayout } from "./evaluate";
import type { AppliedRecord, DesignSession, ProposalRecord } from "./types";

export type ApplyRefusal = "stale" | "not-preview" | "invalid" | "rejected-by-editor" | "missing-room";
export type UndoRefusal = "edited-since" | "no-history";

/** The furniture with a proposal's poses, for the preview and for checks; the input is never changed. */
export function previewProposal<T extends { id: string; position: { x: number; z: number }; orientation: number }>(furniture: readonly T[], proposal: Pick<ProposalRecord, "changes">): T[] {
  return furniture.map((item) => {
    const change = proposal.changes.find((entry) => entry.id === item.id);
    return change ? { ...item, position: { ...change.to.position }, orientation: change.to.orientation } : item;
  });
}

/**
 * applyAcceptedProposal: refuses a proposal made for another layout revision, re-validates it against
 * the current locks and the session's kept items, and returns one editor action that applies every
 * pose at once. The editor reducer is run here once to be sure it accepts the action.
 */
export function applyAcceptedProposal(editor: EditorState, session: DesignSession, proposal: ProposalRecord):
  | { ok: true; action: ApplyAction; preRevision: string; postRevision: string }
  | { ok: false; reason: ApplyRefusal } {
  const preRevision = layoutRevision(editor.flat.id, editor.current, editor.locks);
  if (proposal.inputRevision !== session.startRevision || preRevision !== proposal.inputRevision) return { ok: false, reason: "stale" };
  if (proposal.status !== "preview") return { ok: false, reason: "not-preview" };
  const room = editor.flat.rooms.find((entry) => entry.id === proposal.roomId);
  if (!room) return { ok: false, reason: "missing-room" };
  const candidate = previewProposal(editor.current.furniture, proposal);
  const validation = validateLayout({ flat: editor.flat, shape: roomShape(room), ceilingHeight: editor.current.ceilingHeight, baseline: editor.current.furniture, candidate, locks: editor.locks, preferences: session.preferences.map((entry) => entry.preference) });
  if (!validation.feasible) return { ok: false, reason: "invalid" };
  const transforms: ItemTransform[] = proposal.changes.map((change) => ({ id: change.id, position: { ...change.to.position }, orientation: change.to.orientation }));
  const action: ApplyAction = { type: "apply-layout", transforms, expectedRevision: preRevision };
  const next = editorReducer({ ...editor, view: "after" }, action);
  if (next.current === editor.current) return { ok: false, reason: "rejected-by-editor" };
  return { ok: true, action, preRevision, postRevision: layoutRevision(editor.flat.id, next.current, next.locks) };
}

/**
 * undoAppliedProposal: the editor's own undo, allowed only while the layout is still exactly the
 * applied one and the step before it is the layout the proposal was applied to. Otherwise there are
 * newer edits, and undoing here would overwrite them.
 */
export function undoAppliedProposal(editor: EditorState, applied: AppliedRecord): { ok: true; action: { type: "undo" } } | { ok: false; reason: UndoRefusal } {
  if (layoutRevision(editor.flat.id, editor.current, editor.locks) !== applied.postRevision) return { ok: false, reason: "edited-since" };
  const previous = editor.past.at(-1);
  if (!previous) return { ok: false, reason: "no-history" };
  if (layoutRevision(editor.flat.id, previous.current, previous.locks) !== applied.preRevision) return { ok: false, reason: "edited-since" };
  return { ok: true, action: { type: "undo" } };
}
