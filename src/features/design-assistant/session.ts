import type { LayoutLocks, LayoutSnapshot } from "../../types/domain";
import { copySnapshot } from "../flat-editor/state";
import { mergePreferences, preferenceItems } from "./preferences";
import type { Arrangement, DesignSession, DesignState, FeedbackEntry, GenerationOutcome, Interpretation, PreferenceEntry, ProposalRecord, RejectionReason, UnsupportedTopic } from "./types";

/** History kept per session: older entries drop off first. */
export const HISTORY_LIMITS = { proposals: 10, feedback: 20, avoid: 20 } as const;

export function createDesignState(): DesignState {
  return { session: null, nextSessionId: 1 };
}

export interface SessionStart {
  scope: string;
  flatId: string;
  roomId: string;
  baseline: LayoutSnapshot;
  locks: LayoutLocks;
  revision: string;
  interpretation: Interpretation;
  text: string;
}

export type DesignAction =
  | ({ type: "start" } & SessionStart)
  | { type: "edit-request" }
  | { type: "confirm"; preferences: PreferenceEntry[] }
  | { type: "generate-request"; requestId: number }
  | { type: "generate-result"; requestId: number; outcome: GenerationOutcome }
  | { type: "generate-failure"; requestId: number; message: string }
  | { type: "cancel" }
  | { type: "reject-start" }
  | { type: "reject-back" }
  | { type: "reject"; proposalId: string; text: string; reasons: RejectionReason[]; added: PreferenceEntry[]; replaced: string[]; unsupported: { clause: string; topic: UnsupportedTopic }[]; unrecognised: string[] }
  | { type: "discard"; proposalId: string }
  | { type: "remove-preference"; key: string }
  | { type: "accepted"; proposalId: string; preRevision: string; postRevision: string }
  | ({ type: "restart"; interpretation: Interpretation } & Omit<SessionStart, "interpretation" | "text">)
  | { type: "end" };

const bounded = <T>(list: readonly T[], limit: number) => list.slice(-limit);

function arrangementOf(proposal: ProposalRecord): Arrangement {
  return { proposalId: proposal.id, poses: Object.fromEntries(proposal.changes.map((change) => [change.id, { position: { ...change.to.position }, orientation: change.to.orientation }])) };
}

function setStatus(session: DesignSession, proposalId: string, status: ProposalRecord["status"]): ProposalRecord[] {
  return session.proposals.map((proposal) => proposal.id === proposalId && proposal.status === "preview" ? { ...proposal, status } : proposal);
}

export const currentProposal = (session: DesignSession | null): ProposalRecord | null => session?.proposals.at(-1) ?? null;

/**
 * The design session as one pure reducer. Every proposal is generated from `baseline`, the committed
 * layout when the session started, never from a rejected draft. A generation result is used only if it
 * answers the request still pending; a cancelled or superseded one is ignored.
 */
export function designReducer(state: DesignState, action: DesignAction): DesignState {
  const session = state.session;
  if (action.type === "start") {
    const initial: FeedbackEntry = { round: 0, kind: "initial", text: action.text, reasons: [], added: [], replaced: [], unsupported: action.interpretation.unsupported, unrecognised: action.interpretation.unrecognised };
    return {
      nextSessionId: state.nextSessionId + 1,
      session: { id: state.nextSessionId, scope: action.scope, flatId: action.flatId, roomId: action.roomId, baseline: copySnapshot(action.baseline), locks: { position: [...action.locks.position], distance: action.locks.distance.map((lock) => ({ ...lock })) }, startRevision: action.revision, phase: "confirm", pending: { interpretation: action.interpretation, carried: [], dropped: [] }, preferences: [], feedbackHistory: [initial], proposals: [], avoid: [], request: null, nextRequestId: 1, outcome: null, applied: null, round: 0 },
    };
  }
  if (!session) return state;
  const update = (next: Partial<DesignSession>): DesignState => ({ ...state, session: { ...session, ...next } });
  switch (action.type) {
    case "end":
      return { ...state, session: null };
    case "edit-request":
      // Back to the request form: nothing was confirmed yet, so the session simply ends.
      return session.phase === "confirm" && session.proposals.length === 0 && session.feedbackHistory.length <= 1 ? { ...state, session: null } : state;
    case "confirm": {
      if (session.phase !== "confirm") return state;
      const preferences = mergePreferences(session.preferences, action.preferences);
      const history = session.feedbackHistory.map((entry, index) => index === session.feedbackHistory.length - 1 ? { ...entry, added: action.preferences.map((item) => item.key) } : entry);
      return update({ preferences, feedbackHistory: history, pending: null, phase: "paused" });
    }
    case "generate-request":
      if (session.request || action.requestId !== session.nextRequestId || !["paused", "result", "reject"].includes(session.phase)) return state;
      return update({ request: { id: action.requestId }, nextRequestId: session.nextRequestId + 1, phase: "generating", outcome: null });
    case "generate-result": {
      if (session.request?.id !== action.requestId) return state;
      if (action.outcome.status === "found") {
        const proposal = action.outcome.proposal;
        return update({ request: null, phase: "proposal", proposals: bounded([...session.proposals, proposal], HISTORY_LIMITS.proposals), avoid: bounded([...session.avoid, arrangementOf(proposal)], HISTORY_LIMITS.avoid), round: session.round + 1, outcome: null });
      }
      return update({ request: null, phase: "result", outcome: action.outcome });
    }
    case "generate-failure":
      return session.request?.id === action.requestId ? update({ request: null, phase: "result", outcome: { status: "error", message: action.message } }) : state;
    case "cancel":
      return session.request ? update({ request: null, phase: "result", outcome: { status: "cancelled" } }) : state;
    case "reject-start":
      return session.phase === "proposal" ? update({ phase: "reject" }) : state;
    case "reject-back":
      return session.phase === "reject" ? update({ phase: "proposal" }) : state;
    case "reject": {
      const proposal = session.proposals.find((entry) => entry.id === action.proposalId);
      if (session.phase !== "reject" || !proposal) return state;
      // recordRejectionFeedback: the user's words are kept as written, and only confirmed preferences are added.
      const entry: FeedbackEntry = { round: session.round, kind: "rejection", proposalId: proposal.id, text: action.text, reasons: action.reasons, added: action.added.map((item) => item.key), replaced: action.replaced, unsupported: action.unsupported, unrecognised: action.unrecognised };
      return update({ phase: "paused", proposals: setStatus(session, proposal.id, "rejected"), preferences: mergePreferences(session.preferences, action.added, action.replaced), feedbackHistory: bounded([...session.feedbackHistory, entry], HISTORY_LIMITS.feedback) });
    }
    case "discard":
      return session.phase === "proposal" || session.phase === "reject" ? update({ phase: "paused", proposals: setStatus(session, action.proposalId, "discarded") }) : state;
    case "remove-preference":
      return session.request || session.phase === "accepted" ? state : update({ preferences: session.preferences.filter((item) => item.key !== action.key) });
    case "accepted": {
      const proposal = session.proposals.find((entry) => entry.id === action.proposalId);
      if (!proposal || session.phase !== "proposal") return state;
      return update({ phase: "accepted", proposals: setStatus(session, proposal.id, "accepted"), applied: { proposalId: proposal.id, version: proposal.version, preRevision: action.preRevision, postRevision: action.postRevision, changes: proposal.changes } });
    }
    case "restart": {
      // From the latest layout: earlier needs come back for review; those about missing items are dropped.
      const present = new Set(action.baseline.furniture.filter((item) => item.roomId === action.roomId).map((item) => item.id));
      const carried = session.preferences.filter((item) => preferenceItems(item.preference).every((id) => present.has(id)) && !(item.preference.type === "keep-in-place" && item.preference.pose));
      const dropped = session.preferences.filter((item) => !carried.includes(item));
      const entry: FeedbackEntry = { round: session.round, kind: "restart", text: "", reasons: [], added: [], replaced: dropped.map((item) => item.key), unsupported: [], unrecognised: [] };
      return update({ scope: action.scope, flatId: action.flatId, roomId: action.roomId, baseline: copySnapshot(action.baseline), locks: { position: [...action.locks.position], distance: action.locks.distance.map((lock) => ({ ...lock })) }, startRevision: action.revision, phase: "confirm", pending: { interpretation: action.interpretation, carried, dropped }, preferences: [], feedbackHistory: bounded([...session.feedbackHistory, entry], HISTORY_LIMITS.feedback), proposals: session.proposals.map((proposal) => proposal.status === "preview" ? { ...proposal, status: "discarded" } : proposal), request: null, outcome: null, applied: null });
    }
  }
}

export type Freshness = "fresh" | "stale" | "applied" | "undone" | "edited-after-apply";

/**
 * Whether the session still matches the editor: the same plan and the same layout revision it started
 * from. After an application, the applied revision means "applied" and the start revision "undone".
 */
export function sessionFreshness(session: DesignSession, scope: string, revision: string): Freshness {
  if (session.scope !== scope) return "stale";
  if (session.applied) {
    if (revision === session.applied.postRevision) return "applied";
    if (revision === session.applied.preRevision) return "undone";
    return "edited-after-apply";
  }
  return revision === session.startRevision ? "fresh" : "stale";
}
