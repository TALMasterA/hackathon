import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { analyzeLayout, issueItemIds } from "../../lib/geometry/layout";
import type { LayoutLocks } from "../../types/domain";
import { previewProposal } from "./apply";
import { deepFreeze, demoLayout, NO_LOCKS } from "./fixtures";
import { generateLayoutCandidates, generateLayoutCandidatesSync, repeatsArrangement, type GenerationInput } from "./generate";
import { interpretFeedback } from "./interpret";
import { livingContext } from "./fixtures";
import type { Arrangement, Preference, ProposalRecord } from "./types";

const masterDoor: Preference = { type: "open-zone", zone: { kind: "door", doorId: "master-door", depth: 90 } };
const sofaFront: Preference = { type: "open-zone", zone: { kind: "item-front", itemId: "living-sofa", depth: 90 } };
const keepSofa: Preference = { type: "keep-in-place", itemId: "living-sofa", allowRotation: false };

function input(preferences: Preference[], extra: Partial<GenerationInput> = {}): GenerationInput {
  return { flat: DEMO_FLAT, roomId: "living", baseline: demoLayout(), locks: NO_LOCKS, preferences, avoid: [], version: 1, proposalId: "p1", inputRevision: "revision", ...extra };
}

function found(generationInput: GenerationInput): ProposalRecord {
  const outcome = generateLayoutCandidatesSync(generationInput);
  if (outcome.status !== "found") throw new Error(`Expected a proposal, got ${outcome.status}`);
  return outcome.proposal;
}

const arrangement = (proposal: ProposalRecord): Arrangement => ({ proposalId: proposal.id, poses: Object.fromEntries(proposal.changes.map((change) => [change.id, change.to])) });
const withoutTiming = (proposal: ProposalRecord) => ({ ...proposal, searched: { ...proposal.searched, elapsedMs: 0 } });

describe("heuristic proposal generation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("A: proposes real, validated moves without touching its inputs", () => {
    const generationInput = deepFreeze(input([masterDoor]));
    const proposal = found(generationInput);
    expect(proposal.status).toBe("preview");
    expect(proposal.generationMode).toBe("heuristic");
    expect(proposal.interpretationMode).toBe("rule-based");
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.changes.every((change) => change.displacement > 0.5 || change.rotation > 0.5)).toBe(true);
    expect(proposal.changedIds).toContain("living-sofa");
    const zone = proposal.metrics.find((metric) => metric.kind === "zone")!;
    expect(zone.before).toBeCloseTo(0.56);
    expect(zone.after).toBeLessThan(zone.before);
    expect(["met", "improved"]).toContain(zone.outcome);
    const candidate = previewProposal(generationInput.baseline.furniture, proposal);
    expect(analyzeLayout(DEMO_FLAT, candidate, 260).filter((issue) => issueItemIds(issue).some((id) => proposal.changedIds.includes(id)))).toEqual([]);
    expect(proposal.validation.feasible).toBe(true);
    expect(candidate.every((item) => item.roomId === generationInput.baseline.furniture.find((entry) => entry.id === item.id)!.roomId)).toBe(true);
    expect(proposal.reasons.find((reason) => reason.itemId === "living-sofa")!.messages.map((message) => message.key)).toContain("reason.zone");
    expect(proposal.checks.map((message) => message.key)).toEqual(expect.arrayContaining(["check.room", "check.collisions", "check.unchangedSizes"]));
    expect(proposal.unverified.map((message) => message.key)).toContain("unverified.route");
    // Same input, same proposal.
    expect(withoutTiming(found(generationInput))).toEqual(withoutTiming(proposal));
  });

  it("B: keeps a kept item's baseline pose in every round", () => {
    const preferences: Preference[] = [sofaFront, keepSofa];
    const avoid: Arrangement[] = [];
    const sofa = demoLayout().furniture.find((item) => item.id === "living-sofa")!;
    for (let round = 1; round <= 3; round++) {
      const outcome = generateLayoutCandidatesSync(input(preferences, { avoid, version: round, proposalId: `p${round}` }));
      expect(["found", "none"]).toContain(outcome.status);
      if (outcome.status !== "found") break;
      expect(outcome.proposal.changedIds).not.toContain("living-sofa");
      const shown = previewProposal(demoLayout().furniture, outcome.proposal).find((item) => item.id === "living-sofa")!;
      expect(shown.position).toEqual(sofa.position);
      expect(shown.orientation).toBe(sofa.orientation);
      avoid.push(arrangement(outcome.proposal));
      preferences.push(...interpretFeedback([{ code: "dislike-position", itemId: outcome.proposal.changes.find((change) => change.displacement > 0.5)?.id }], "", outcome.proposal, livingContext()).preferences);
    }
    expect(avoid.length).toBeGreaterThanOrEqual(2);
  });

  it("C: a rejection reason changes the preferences and the next proposal is meaningfully different", () => {
    const first = found(input([masterDoor]));
    const sofaMove = first.changes.find((change) => change.id === "living-sofa")!;
    const feedback = interpretFeedback([{ code: "dislike-position", itemId: "living-sofa" }], "", first, livingContext());
    expect(feedback.preferences).toEqual([{ type: "avoid-position", itemId: "living-sofa", centre: sofaMove.to.position, radius: 60 }]);
    const second = found(input([masterDoor, ...feedback.preferences], { avoid: [arrangement(first)], version: 2, proposalId: "p2" }));
    expect(repeatsArrangement(demoLayout().furniture, previewProposal(demoLayout().furniture, second), arrangement(first))).toBe(false);
    const sofa = second.changes.find((change) => change.id === "living-sofa");
    if (sofa && sofa.displacement > 0.5) expect(Math.hypot(sofa.to.position.x - sofaMove.to.position.x, sofa.to.position.z - sofaMove.to.position.z)).toBeGreaterThan(60);
    // "Too many changes" caps the next proposal.
    const limited = generateLayoutCandidatesSync(input([masterDoor, { type: "minimise-changes", maxChangedItems: 1 }], { avoid: [arrangement(first), arrangement(second)] }));
    if (limited.status === "found") expect(limited.proposal.changes.length).toBe(1);
  });

  it("treats a pose within 15 cm and 10 degrees as a repeat", () => {
    const baseline = demoLayout().furniture;
    const shown: Arrangement = { proposalId: "p1", poses: { "living-sofa": { position: { x: 100, z: 270 }, orientation: 0 } } };
    const near = baseline.map((item) => item.id === "living-sofa" ? { ...item, position: { x: 110, z: 275 }, orientation: 5 } : item);
    const far = baseline.map((item) => item.id === "living-sofa" ? { ...item, position: { x: 120, z: 270 } } : item);
    expect(repeatsArrangement(baseline, near, shown)).toBe(true);
    expect(repeatsArrangement(baseline, far, shown)).toBe(false);
    const extra = near.map((item) => item.id === "living-tv" ? { ...item, orientation: 90 } : item);
    expect(repeatsArrangement(baseline, extra, shown)).toBe(false);
  });

  it("D: reports no suitable candidate instead of bypassing constraints", () => {
    const locks: LayoutLocks = deepFreeze({ position: ["living-tv"], distance: [{ id: "distance-1", firstId: "living-coffee-table", secondId: "living-sofa", minimum: 20 }] });
    const generationInput = deepFreeze(input([masterDoor, keepSofa], { locks }));
    const outcome = generateLayoutCandidatesSync(generationInput);
    expect(outcome.status).toBe("none");
    if (outcome.status !== "none") return;
    expect(outcome.blockers).toContainEqual({ key: "blocker.zoneKept", params: { item: { item: "living-sofa" }, zone: { zone: masterDoor.type === "open-zone" ? masterDoor.zone : null! } } });
    expect(outcome.suggestions.map((message) => message.key)).toContain("suggestion.unkeep");
    expect(outcome.searched.movesTried).toBeGreaterThan(0);
    const allKept: Preference[] = demoLayout().furniture.filter((item) => item.roomId === "living").map((item) => ({ type: "keep-in-place", itemId: item.id, allowRotation: false }));
    const pair = generateLayoutCandidatesSync(input([{ type: "pair", firstId: "living-sofa", secondId: "living-tv", direction: "closer" }, ...allKept]));
    expect(pair.status).toBe("none");
    if (pair.status === "none") expect(pair.blockers.map((message) => message.key)).toContain("blocker.pairFixed");
  });

  it("respects position locks (turning only) and distance locks", () => {
    const locks: LayoutLocks = { position: ["living-sofa"], distance: [{ id: "distance-1", firstId: "living-coffee-table", secondId: "living-sofa", minimum: 15 }] };
    const proposal = found(input([{ type: "pair", firstId: "living-coffee-table", secondId: "living-sofa", direction: "closer" }], { locks }));
    const candidate = previewProposal(demoLayout().furniture, proposal);
    const sofa = candidate.find((item) => item.id === "living-sofa")!;
    expect(sofa.position).toEqual({ x: 250, z: 270 });
    const pair = proposal.metrics.find((metric) => metric.kind === "pair")!;
    expect(pair.after).toBeGreaterThanOrEqual(15 - 1e-6);
    expect(pair.after).toBeLessThan(pair.before);
    // With a 25 cm minimum the pair cannot get 10 cm closer than 32.5 cm: no proposal, and the lock is named.
    const tight = generateLayoutCandidatesSync(input([{ type: "pair", firstId: "living-coffee-table", secondId: "living-sofa", direction: "closer" }], { locks: { ...locks, distance: [{ ...locks.distance[0], minimum: 25 }] } }));
    expect(tight.status).toBe("none");
    if (tight.status === "none") expect(tight.blockers.map((message) => message.key)).toContain("blocker.pairLock");
  });

  it("works on a shaped, PDF-derived flat (Harmony): moves stay inside their area and pass the checks", async () => {
    const { HARMONY_EXAMPLES, HARMONY_FLAT } = await import("../../data/harmony-preset");
    const baseline = deepFreeze({ ceilingHeight: 260, furniture: HARMONY_EXAMPLES.map((item) => ({ ...item, position: { ...item.position } })) });
    const proposal = found({ flat: HARMONY_FLAT, roomId: "central", baseline, locks: NO_LOCKS, preferences: [{ type: "pair", firstId: "harmony-central-sofa", secondId: "harmony-central-tv-console", direction: "farther" }], avoid: [], version: 1, proposalId: "h1", inputRevision: "r" });
    expect(proposal.validation.feasible).toBe(true);
    const candidate = previewProposal(baseline.furniture, proposal);
    expect(analyzeLayout(HARMONY_FLAT, candidate, 260).filter((issue) => issueItemIds(issue).some((id) => proposal.changedIds.includes(id)))).toEqual([]);
    expect(candidate.filter((item) => proposal.changedIds.includes(item.id)).every((item) => item.roomId === "central")).toBe(true);
  });

  it("says when the current layout already meets the goals, without moving anything", () => {
    const outcome = generateLayoutCandidatesSync(input([{ type: "open-zone", zone: { kind: "door", doorId: "front-door", depth: 120 } }]));
    expect(outcome.status).toBe("baseline-meets-goals");
    expect(generateLayoutCandidatesSync(input([keepSofa])).status).toBe("none");
  });

  it("runs in slices, stops when cancelled or past its deadline", async () => {
    const pauses = vi.fn(async () => {});
    const outcome = await generateLayoutCandidates(input([masterDoor]), { yieldToBrowser: pauses });
    expect(outcome.status).toBe("found");
    const controller = new AbortController();
    controller.abort();
    expect(await generateLayoutCandidates(input([masterDoor]), { signal: controller.signal })).toEqual({ status: "cancelled" });
    expect((await generateLayoutCandidates(input([masterDoor]), { deadlineMs: -1 })).status).toBe("timed-out");
  });

  it("H: works without any network request or key", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("network not allowed")));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("FAL_KEY", "");
    const outcome = await generateLayoutCandidates(input([masterDoor]), { yieldToBrowser: async () => {} });
    expect(outcome.status).toBe("found");
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
