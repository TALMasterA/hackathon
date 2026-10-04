"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { SessionEditAction } from "../flat-editor/state";
import type { EditorState } from "../flat-editor/state";
import { layoutRevision } from "../flat-editor/revision";
import { applyAcceptedProposal, previewProposal, undoAppliedProposal } from "./apply";
import { getLayoutContext, roomShape, zonePolygon } from "./context";
import { generateLayoutCandidates, type GenerationInput } from "./generate";
import { interpretUserNeeds } from "./interpret";
import { createDesignState, currentProposal, designReducer, sessionFreshness, type DesignAction } from "./session";
import type { DesignSession, PreferenceEntry, RejectionReason, StructuredRequest, UnsupportedTopic } from "./types";

export type PreviewMode = "current" | "proposed";

function generationInput(session: DesignSession, editor: EditorState, requestId: number): GenerationInput {
  return {
    flat: { ...editor.flat, height: session.baseline.ceilingHeight },
    roomId: session.roomId,
    baseline: session.baseline,
    locks: session.locks,
    preferences: session.preferences.map((entry) => entry.preference),
    avoid: session.avoid,
    version: session.round + 1,
    proposalId: `s${session.id}-r${requestId}`,
    inputRevision: session.startRevision,
  };
}

/**
 * The design assistant's state next to the editor: its own reducer, the running search, the preview
 * and the actions that reach the editor (apply and undo). The editor's reducer stays the only owner
 * of the committed layout; a preview is derived data and never dispatched.
 */
export function useDesignAssistant({ editor, scope, dispatchEditor }: { editor: EditorState; scope: string; dispatchEditor: (action: SessionEditAction) => void }) {
  const [design, dispatchDesign] = useReducer(designReducer, undefined, createDesignState);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("proposed");
  const [notice, setNotice] = useState<string | null>(null);
  const designRef = useRef(design);
  const editorRef = useRef(editor);
  const running = useRef<AbortController | null>(null);
  useEffect(() => {
    designRef.current = design;
    editorRef.current = editor;
  });
  useEffect(() => () => running.current?.abort(), []);

  const session = design.session;
  const revision = layoutRevision(editor.flat.id, editor.current, editor.locks);
  const freshness = session ? sessionFreshness(session, scope, revision) : null;
  const proposal = currentProposal(session);
  const previewing = Boolean(session && session.phase === "proposal" && proposal?.status === "preview" && freshness === "fresh" && previewMode === "proposed" && editor.view === "after");
  const committed = editor.current.furniture;
  const preview = useMemo(() => previewing && proposal ? previewProposal(committed, proposal) : null, [previewing, proposal, committed]);

  const dispatch = useCallback((action: DesignAction) => {
    designRef.current = designReducer(designRef.current, action);
    dispatchDesign(action);
  }, []);

  /** Starts a search for the session as it is after the actions just dispatched. */
  const generate = useCallback(() => {
    const current = designRef.current.session;
    if (!current || current.request) return;
    const requestId = current.nextRequestId;
    dispatch({ type: "generate-request", requestId });
    const started = designRef.current.session;
    if (started?.request?.id !== requestId) return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setNotice(null);
    setPreviewMode("proposed");
    generateLayoutCandidates(generationInput(started, editorRef.current, requestId), { signal: controller.signal })
      .then((outcome) => {
        if (outcome.status === "cancelled") return;
        dispatch({ type: "generate-result", requestId, outcome });
      })
      .catch((error: unknown) => dispatch({ type: "generate-failure", requestId, message: error instanceof Error ? error.message : String(error) }));
  }, [dispatch]);

  const start = useCallback((request: StructuredRequest, text: string) => {
    const current = editorRef.current;
    const context = getLayoutContext(current, request.roomId);
    if (!context) return;
    setNotice(null);
    dispatch({ type: "start", scope, flatId: current.flat.id, roomId: request.roomId, baseline: current.current, locks: current.locks, revision: layoutRevision(current.flat.id, current.current, current.locks), interpretation: interpretUserNeeds(request, text, context), text });
  }, [dispatch, scope]);

  const confirm = useCallback((preferences: PreferenceEntry[]) => {
    dispatch({ type: "confirm", preferences });
    generate();
  }, [dispatch, generate]);

  const cancel = useCallback(() => {
    running.current?.abort();
    running.current = null;
    dispatch({ type: "cancel" });
  }, [dispatch]);

  const reject = useCallback((input: { proposalId: string; text: string; reasons: RejectionReason[]; added: PreferenceEntry[]; replaced: string[]; unsupported: { clause: string; topic: UnsupportedTopic }[]; unrecognised: string[] }) => {
    dispatch({ type: "reject", ...input });
    generate();
  }, [dispatch, generate]);

  const accept = useCallback(() => {
    const current = designRef.current.session;
    const shown = currentProposal(current);
    const state = editorRef.current;
    if (!current || !shown) return;
    if (sessionFreshness(current, scope, layoutRevision(state.flat.id, state.current, state.locks)) !== "fresh") {
      setNotice("apply.refused.stale");
      return;
    }
    const result = applyAcceptedProposal(state, current, shown);
    if (!result.ok) {
      setNotice(`apply.refused.${result.reason}`);
      return;
    }
    if (state.view !== "after") dispatchEditor({ type: "view", view: "after" });
    dispatchEditor(result.action);
    dispatch({ type: "accepted", proposalId: shown.id, preRevision: result.preRevision, postRevision: result.postRevision });
    setNotice(null);
  }, [dispatch, dispatchEditor, scope]);

  const undo = useCallback(() => {
    const applied = designRef.current.session?.applied;
    const state = editorRef.current;
    if (!applied) return;
    const result = undoAppliedProposal(state, applied);
    if (!result.ok) {
      setNotice(`undo.refused.${result.reason}`);
      return;
    }
    if (state.view !== "after") dispatchEditor({ type: "view", view: "after" });
    dispatchEditor(result.action);
    setNotice(null);
  }, [dispatchEditor]);

  const restart = useCallback((fallbackRoomId: string) => {
    const current = designRef.current.session;
    const state = editorRef.current;
    if (!current) return;
    running.current?.abort();
    const roomId = state.flat.rooms.some((room) => room.id === current.roomId) ? current.roomId : fallbackRoomId;
    const context = getLayoutContext(state, roomId);
    if (!context) return;
    const interpretation = interpretUserNeeds({ roomId, changeLittle: false, openZone: null, closer: null, farther: null, keep: [] }, "", context);
    dispatch({ type: "restart", scope, flatId: state.flat.id, roomId, baseline: state.current, locks: state.locks, revision: layoutRevision(state.flat.id, state.current, state.locks), interpretation });
    setNotice(null);
  }, [dispatch, scope]);

  const end = useCallback(() => {
    running.current?.abort();
    running.current = null;
    dispatch({ type: "end" });
    setNotice(null);
  }, [dispatch]);

  /** Open zones of the session, drawn on the plan over whatever furniture is displayed. */
  const zonesFor = useCallback((furniture: EditorState["current"]["furniture"]) => {
    if (!session || (freshness !== "fresh" && freshness !== "applied")) return [];
    const room = editor.flat.rooms.find((entry) => entry.id === session.roomId);
    if (!room) return [];
    const shape = roomShape(room);
    const preferences = [...session.preferences.map((entry) => entry.preference), ...(session.pending?.interpretation.preferences ?? [])];
    return preferences.flatMap((preference, index) => {
      if (preference.type !== "open-zone") return [];
      const polygon = zonePolygon(editor.flat, shape, preference.zone, furniture);
      return polygon ? [{ id: `zone-${index}`, polygon }] : [];
    });
  }, [editor.flat, freshness, session]);

  return { design, session, proposal, freshness, revision, previewMode, setPreviewMode, preview, previewing, notice, setNotice, dispatch, start, confirm, generate, cancel, reject, accept, undo, restart, end, zonesFor };
}

export type DesignAssistant = ReturnType<typeof useDesignAssistant>;
