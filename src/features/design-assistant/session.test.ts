import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { deepFreeze, demoLayout, livingContext, NO_LOCKS } from "./fixtures";
import { generateLayoutCandidatesSync } from "./generate";
import { interpretUserNeeds } from "./interpret";
import { entry } from "./preferences";
import { createDesignState, currentProposal, designReducer, HISTORY_LIMITS, sessionFreshness, type DesignAction } from "./session";
import type { DesignState, GenerationOutcome, Preference, ProposalRecord } from "./types";

const masterDoor: Preference = { type: "open-zone", zone: { kind: "door", doorId: "master-door", depth: 90 } };
const request = { roomId: "living", changeLittle: false, openZone: null, closer: null, farther: null, keep: [] };

function started(text = "梳化唔好郁"): DesignState {
  return designReducer(createDesignState(), { type: "start", scope: "demo", flatId: DEMO_FLAT.id, roomId: "living", baseline: demoLayout(), locks: NO_LOCKS, revision: "r0", interpretation: interpretUserNeeds(request, text, livingContext()), text });
}

function outcomeFor(state: DesignState, id = "p1"): GenerationOutcome {
  const session = state.session!;
  return generateLayoutCandidatesSync({ flat: DEMO_FLAT, roomId: session.roomId, baseline: session.baseline, locks: session.locks, preferences: session.preferences.map((item) => item.preference), avoid: session.avoid, version: session.round + 1, proposalId: id, inputRevision: session.startRevision });
}

const run = (state: DesignState, ...actions: DesignAction[]) => actions.reduce(designReducer, state);

describe("design session", () => {
  it("snapshots the baseline, confirms needs, and accepts only the pending request's result", () => {
    const state = started();
    const session = state.session!;
    expect(session.phase).toBe("confirm");
    expect(session.feedbackHistory[0]).toMatchObject({ kind: "initial", text: "梳化唔好郁" });
    const confirmed = run(state, { type: "confirm", preferences: [entry(masterDoor, "control", 0)] });
    expect(confirmed.session!.preferences.map((item) => item.preference)).toEqual([masterDoor]);
    const requested = run(confirmed, { type: "generate-request", requestId: 1 });
    expect(requested.session!.phase).toBe("generating");
    // A duplicate request while one runs is ignored.
    expect(run(requested, { type: "generate-request", requestId: 2 })).toBe(requested);
    const outcome = outcomeFor(requested);
    expect(run(requested, { type: "generate-result", requestId: 9, outcome })).toBe(requested);
    const shown = run(requested, { type: "generate-result", requestId: 1, outcome });
    expect(shown.session!.phase).toBe("proposal");
    expect(currentProposal(shown.session)!.version).toBe(1);
    expect(shown.session!.avoid).toHaveLength(1);
  });

  it("ignores a late result after cancelling, and a superseded request's result", () => {
    const requested = run(started(), { type: "confirm", preferences: [entry(masterDoor, "control", 0)] }, { type: "generate-request", requestId: 1 });
    const outcome = outcomeFor(requested);
    const cancelled = run(requested, { type: "cancel" });
    expect(cancelled.session!.outcome).toEqual({ status: "cancelled" });
    expect(run(cancelled, { type: "generate-result", requestId: 1, outcome })).toBe(cancelled);
    const again = run(cancelled, { type: "generate-request", requestId: 2 });
    expect(run(again, { type: "generate-result", requestId: 1, outcome })).toBe(again);
    expect(run(again, { type: "generate-result", requestId: 2, outcome }).session!.phase).toBe("proposal");
    expect(run(again, { type: "generate-failure", requestId: 1, message: "late" })).toBe(again);
  });

  it("records rejection feedback, keeps the user's words and never moves the baseline", () => {
    const frozen = deepFreeze(started());
    const shown = run(frozen, { type: "confirm", preferences: [entry(masterDoor, "control", 0)] }, { type: "generate-request", requestId: 1 });
    const withProposal = run(shown, { type: "generate-result", requestId: 1, outcome: outcomeFor(shown) });
    const proposal = currentProposal(withProposal.session) as ProposalRecord;
    const avoid: Preference = { type: "avoid-position", itemId: "living-sofa", centre: proposal.changes[0].to.position, radius: 60 };
    const rejected = run(withProposal, { type: "reject-start" }, { type: "reject", proposalId: proposal.id, text: "太近窗口，唔鍾意", reasons: [{ code: "dislike-position", itemId: "living-sofa" }], added: [entry(avoid, "feedback", 1)], replaced: [], unsupported: [{ clause: "太近窗口", topic: "daylight" }], unrecognised: [] });
    const session = rejected.session!;
    expect(session.phase).toBe("paused");
    expect(session.proposals[0].status).toBe("rejected");
    expect(session.preferences.map((item) => item.preference)).toEqual([masterDoor, avoid]);
    expect(session.feedbackHistory.at(-1)).toMatchObject({ kind: "rejection", text: "太近窗口，唔鍾意", unsupported: [{ topic: "daylight" }] });
    expect(session.baseline).toEqual(demoLayout());
    expect(session.baseline).toBe(frozen.session!.baseline);
    // The next round is generated from the same baseline, avoiding the rejected arrangement.
    const next = run(rejected, { type: "generate-request", requestId: 2 });
    const second = outcomeFor(next, "p2");
    expect(second.status).toBe("found");
    const accepted = run(next, { type: "generate-result", requestId: 2, outcome: second });
    expect(currentProposal(accepted.session)!.version).toBe(2);
  });

  it("bounds history and restarts from the latest layout with earlier needs for review", () => {
    let state = run(started(), { type: "confirm", preferences: [entry(masterDoor, "control", 0), entry({ type: "keep-in-place", itemId: "living-tv", allowRotation: false }, "text", 0)] });
    const outcome = outcomeFor(state);
    for (let round = 1; round <= HISTORY_LIMITS.proposals + 3; round++) {
      state = run(state, { type: "generate-request", requestId: round }, { type: "generate-result", requestId: round, outcome: outcome.status === "found" ? { ...outcome, proposal: { ...outcome.proposal, id: `p${round}` } } : outcome }, { type: "discard", proposalId: `p${round}` });
    }
    expect(state.session!.proposals).toHaveLength(HISTORY_LIMITS.proposals);
    expect(state.session!.avoid.length).toBeLessThanOrEqual(HISTORY_LIMITS.avoid);
    const latest = demoLayout({ "living-tv": { roomId: "master", position: { x: 100, z: 400 } } });
    const restarted = run(state, { type: "restart", scope: "demo", flatId: DEMO_FLAT.id, roomId: "living", baseline: latest, locks: NO_LOCKS, revision: "r1", interpretation: interpretUserNeeds(request, "", livingContext(latest)) });
    const session = restarted.session!;
    expect(session.phase).toBe("confirm");
    expect(session.baseline).toEqual(latest);
    expect(session.startRevision).toBe("r1");
    expect(session.preferences).toEqual([]);
    expect(session.pending!.carried.map((item) => item.preference)).toEqual([masterDoor]);
    expect(session.pending!.dropped.map((item) => item.key)).toEqual(["keep:living-tv"]);
    expect(session.feedbackHistory.map((item) => item.kind)).toEqual(["initial", "restart"]);
  });

  it("tells fresh, stale, applied, undone and edited sessions apart", () => {
    const session = started().session!;
    expect(sessionFreshness(session, "demo", "r0")).toBe("fresh");
    expect(sessionFreshness(session, "demo", "r-edited")).toBe("stale");
    expect(sessionFreshness(session, "harmony", "r0")).toBe("stale");
    const applied = { ...session, applied: { proposalId: "p1", version: 1, preRevision: "r0", postRevision: "r2", changes: [] } };
    expect(sessionFreshness(applied, "demo", "r2")).toBe("applied");
    expect(sessionFreshness(applied, "demo", "r0")).toBe("undone");
    expect(sessionFreshness(applied, "demo", "r3")).toBe("edited-after-apply");
  });
});
