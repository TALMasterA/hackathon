import { describe, expect, it } from "vitest";
import { createEditorState, editorReducer, type EditorAction, type EditorState } from "../flat-editor/state";
import { layoutRevision } from "../flat-editor/revision";
import { DEMO_FLAT } from "../../data/flat-preset";
import { applyAcceptedProposal, previewProposal, undoAppliedProposal } from "./apply";
import { deepFreeze, livingContext } from "./fixtures";
import { generateLayoutCandidatesSync } from "./generate";
import { interpretUserNeeds } from "./interpret";
import { entry } from "./preferences";
import { createDesignState, designReducer, sessionFreshness } from "./session";
import type { DesignSession, Preference, ProposalRecord } from "./types";

const masterDoor: Preference = { type: "open-zone", zone: { kind: "door", doorId: "master-door", depth: 90 } };

function furnished(): EditorState {
  const actions: EditorAction[] = [{ type: "suggest", roomId: "all" }, { type: "baseline" }];
  return actions.reduce(editorReducer, createEditorState(DEMO_FLAT));
}

function proposalFor(editor: EditorState): { session: DesignSession; proposal: ProposalRecord } {
  const revision = layoutRevision(editor.flat.id, editor.current, editor.locks);
  const request = { roomId: "living", changeLittle: false, openZone: null, closer: null, farther: null, keep: [] };
  let state = designReducer(createDesignState(), { type: "start", scope: "demo", flatId: editor.flat.id, roomId: "living", baseline: editor.current, locks: editor.locks, revision, interpretation: interpretUserNeeds(request, "", livingContext(editor.current, editor.locks)), text: "" });
  state = designReducer(state, { type: "confirm", preferences: [entry(masterDoor, "control", 0)] });
  state = designReducer(state, { type: "generate-request", requestId: 1 });
  const session = state.session!;
  const outcome = generateLayoutCandidatesSync({ flat: editor.flat, roomId: "living", baseline: session.baseline, locks: session.locks, preferences: [masterDoor], avoid: [], version: 1, proposalId: "p1", inputRevision: revision });
  state = designReducer(state, { type: "generate-result", requestId: 1, outcome });
  if (outcome.status !== "found") throw new Error(outcome.status);
  return { session: state.session!, proposal: outcome.proposal };
}

describe("preview, apply and undo", () => {
  it("previews without changing the committed layout, then applies exactly the preview in one undoable step", () => {
    const editor = deepFreeze(furnished());
    const { session, proposal } = proposalFor(editor);
    const preview = previewProposal(editor.current.furniture, proposal);
    expect(preview).not.toEqual(editor.current.furniture);
    const result = applyAcceptedProposal(editor, session, proposal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const applied = editorReducer(editor, result.action);
    expect(applied.current.furniture).toEqual(preview);
    expect(applied.baseline).toBe(editor.baseline);
    expect(applied.past).toHaveLength(editor.past.length + 1);
    expect(layoutRevision(applied.flat.id, applied.current, applied.locks)).toBe(result.postRevision);
    const accepted = designReducer({ session, nextSessionId: 2 }, { type: "accepted", proposalId: proposal.id, preRevision: result.preRevision, postRevision: result.postRevision }).session!;
    expect(accepted.proposals[0].status).toBe("accepted");
    expect(sessionFreshness(accepted, "demo", result.postRevision)).toBe("applied");
    const undo = undoAppliedProposal(applied, accepted.applied!);
    expect(undo).toEqual({ ok: true, action: { type: "undo" } });
    const restored = editorReducer(applied, { type: "undo" });
    expect(restored.current).toEqual(editor.current);
    expect(sessionFreshness(accepted, "demo", layoutRevision(restored.flat.id, restored.current, restored.locks))).toBe("undone");
  });

  it("F: a manual edit during the session makes the proposal stale and it cannot overwrite the edit", () => {
    const editor = furnished();
    const { session, proposal } = proposalFor(editor);
    const edited = [{ type: "select", id: "living-sofa" }, { type: "draft", field: "x", value: "240" }].reduce((state, action) => editorReducer(state, action as EditorAction), editor);
    expect(sessionFreshness(session, "demo", layoutRevision(edited.flat.id, edited.current, edited.locks))).toBe("stale");
    expect(applyAcceptedProposal(edited, session, proposal)).toEqual({ ok: false, reason: "stale" });
    const transforms = proposal.changes.map((change) => ({ id: change.id, position: change.to.position, orientation: change.to.orientation }));
    const attempted = editorReducer(edited, { type: "apply-layout", transforms, expectedRevision: proposal.inputRevision });
    expect(attempted.current).toBe(edited.current);
    expect(attempted.past).toBe(edited.past);
    // A lock added after the proposal also changes the revision.
    const locked = editorReducer(editor, { type: "position-lock", id: "living-sofa" });
    expect(applyAcceptedProposal(locked, session, proposal)).toEqual({ ok: false, reason: "stale" });
  });

  it("E: refuses to undo the application over newer edits", () => {
    const editor = furnished();
    const { session, proposal } = proposalFor(editor);
    const result = applyAcceptedProposal(editor, session, proposal);
    if (!result.ok) throw new Error(result.reason);
    const applied = editorReducer(editor, result.action);
    const record = { proposalId: proposal.id, version: 1, preRevision: result.preRevision, postRevision: result.postRevision, changes: proposal.changes };
    const later = [{ type: "select", id: "living-tv" }, { type: "draft", field: "x", value: "230" }].reduce((state, action) => editorReducer(state, action as EditorAction), applied);
    expect(undoAppliedProposal(later, record)).toEqual({ ok: false, reason: "edited-since" });
    // Moving it back by hand restores the revision but the step before is still the edit, not the application.
    const back = editorReducer(later, { type: "draft", field: "x", value: "235" });
    expect(layoutRevision(back.flat.id, back.current, back.locks)).toBe(result.postRevision);
    expect(undoAppliedProposal(editorReducer(back, { type: "normalise-draft" }), record).ok).toBe(false);
    expect(applyAcceptedProposal(applied, session, { ...proposal, status: "accepted" })).toEqual({ ok: false, reason: "stale" });
  });

  it("re-validates against the session's kept items before applying", () => {
    const editor = furnished();
    const { session, proposal } = proposalFor(editor);
    const keepingSofa = { ...session, preferences: [...session.preferences, entry({ type: "keep-in-place", itemId: proposal.changedIds[0], allowRotation: false }, "feedback", 1)] };
    expect(applyAcceptedProposal(editor, keepingSofa, proposal)).toEqual({ ok: false, reason: "invalid" });
  });
});
