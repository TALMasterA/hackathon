import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { getLayoutContext } from "./context";
import { demoLayout, livingContext, NO_LOCKS } from "./fixtures";
import { findMentions, interpretFeedback, interpretUserNeeds, resolveAmbiguous, splitClauses } from "./interpret";
import { detectConflicts, detectWarnings, entry, mergePreferences } from "./preferences";
import type { Preference, ProposalRecord, StructuredRequest } from "./types";

const empty: StructuredRequest = { roomId: "living", changeLittle: false, openZone: null, closer: null, farther: null, keep: [] };
const context = livingContext();
const read = (text: string, request: Partial<StructuredRequest> = {}) => interpretUserNeeds({ ...empty, ...request }, text, context);

describe("rule-based request interpretation", () => {
  it("reads the brief's Cantonese example: walking space unresolved, sofa kept, others movable", () => {
    const result = read("想客廳易行啲，梳化唔好郁，其他傢俬可以調整。");
    expect(result.mode).toBe("rule-based");
    expect(result.textPreferences.map((item) => item.preference)).toEqual([{ type: "keep-in-place", itemId: "living-sofa", allowRotation: false }]);
    expect(result.unresolved).toEqual([{ clause: "想客廳易行啲", topic: "walking-space" }]);
    expect(result.assumptions).toContain("others-movable");
    expect(result.unrecognised).toEqual([]);
    // Keeping something is not a measurable goal: generation needs one.
    expect(result.invalid).toContain("no-goal");
  });

  it("maps the brief's English examples to preferences", () => {
    expect(read("Don't move the sofa").textPreferences[0].preference).toEqual({ type: "keep-in-place", itemId: "living-sofa", allowRotation: false });
    expect(read("Change less").textPreferences[0].preference).toEqual({ type: "minimise-changes" });
    expect(read("Keep the entrance clear").textPreferences[0].preference).toEqual({ type: "open-zone", zone: { kind: "door", doorId: "front-door", depth: 90 } });
    expect(read("Keep the space in front of the sofa clear").textPreferences[0].preference).toEqual({ type: "open-zone", zone: { kind: "item-front", itemId: "living-sofa", depth: 90 } });
    expect(read("Move the TV console and the sofa apart").textPreferences[0].preference).toEqual({ type: "pair", firstId: "living-tv", secondId: "living-sofa", direction: "farther" });
    expect(read("梳化同茶几近啲").textPreferences[0].preference).toEqual({ type: "pair", firstId: "living-sofa", secondId: "living-coffee-table", direction: "closer" });
    expect(read("門口唔好擋住").textPreferences[0].preference).toMatchObject({ type: "open-zone", zone: { kind: "door", doorId: "front-door" } });
    expect(read("盡量少改動").textPreferences[0].preference).toEqual({ type: "minimise-changes" });
  });

  it("asks which item an ambiguous word means instead of guessing", () => {
    const chair = read("Don't move the chair");
    expect(chair.textPreferences).toEqual([]);
    expect(chair.ambiguous).toHaveLength(1);
    expect(chair.ambiguous[0].slots[0].candidates.sort()).toEqual(["dining-chair-north", "dining-chair-south", "dining-chair-west"]);
    expect(resolveAmbiguous(chair.ambiguous[0], { itemId: "dining-chair-west" })).toEqual({ type: "keep-in-place", itemId: "dining-chair-west", allowRotation: false });
    expect(resolveAmbiguous(chair.ambiguous[0], { itemId: "living-sofa" })).toBeNull();
    const table = read("Keep the table closer to the sofa");
    expect(table.ambiguous[0].slots).toEqual([{ slot: "firstId", mention: "table", candidates: ["living-coffee-table", "living-side-table", "dining-table"] }]);
    expect(resolveAmbiguous(table.ambiguous[0], { firstId: "living-coffee-table" })).toEqual({ type: "pair", firstId: "living-coffee-table", secondId: "living-sofa", direction: "closer" });
    expect(table.invalid).not.toContain("no-goal");
    expect(read("Dining chair 2 stays where it is").textPreferences[0].preference).toMatchObject({ itemId: "dining-chair-south" });
  });

  it("labels unsupported needs and never turns them into a metric", () => {
    const lighting = read("I want warmer lighting");
    expect(lighting.unsupported).toEqual([{ clause: "i want warmer lighting", topic: "lighting" }]);
    expect(lighting.textPreferences).toEqual([]);
    expect(read("要多啲陽光").unsupported[0].topic).toBe("daylight");
    expect(read("風水要好").unsupported[0].topic).toBe("feng-shui");
    expect(read("Make the sofa bigger").unsupported[0].topic).toBe("resize");
    expect(read("Move the bed into the bedroom").unsupported[0].topic).toBe("other-room");
    expect(read("Don't move the bed").unresolved[0].topic).toBe("not-in-room");
    expect(read("purple elephants").unrecognised).toEqual(["purple elephants"]);
  });

  it("treats structured controls as authoritative and reports invalid input", () => {
    expect(read("", { closer: ["living-sofa", "living-sofa"] }).invalid).toContain("pair-same-item");
    expect(read("", { openZone: { kind: "door", doorId: "", depth: 60 } }).invalid).toContain("zone-missing");
    const valid = read("", { openZone: { kind: "door", doorId: "master-door", depth: 60 }, keep: [{ itemId: "living-tv", allowRotation: true }] });
    expect(valid.invalid).toEqual([]);
    expect(valid.preferences).toEqual([{ type: "keep-in-place", itemId: "living-tv", allowRotation: true }, { type: "open-zone", zone: { kind: "door", doorId: "master-door", depth: 60 } }]);
  });

  it("splits clauses without separating the two items of a pair", () => {
    expect(splitClauses("Keep the sofa and table closer, but don't move the TV")).toEqual(["keep the sofa and table closer", "don't move the tv"]);
    expect(findMentions("床頭櫃同床", getLayoutContext({ flat: DEMO_FLAT, current: demoLayout(), locks: NO_LOCKS }, "master")!.roomItems).map((mention) => mention.ids)).toEqual([["master-side-table"], ["master-bed"]]);
  });
});

const proposal = {
  id: "p1",
  version: 1,
  changedIds: ["living-sofa", "living-side-table"],
  changes: [
    { id: "living-sofa", from: { position: { x: 250, z: 270 }, orientation: 0 }, to: { position: { x: 100, z: 270 }, orientation: 0 }, displacement: 150, rotation: 0 },
    { id: "living-side-table", from: { position: { x: 370, z: 270 }, orientation: 0 }, to: { position: { x: 370, z: 270 }, orientation: 90 }, displacement: 0, rotation: 90 },
  ],
} as unknown as ProposalRecord;

describe("rejection feedback", () => {
  it("maps each reason chip to an actionable preference", () => {
    const result = interpretFeedback([
      { code: "should-not-move", itemId: "living-sofa" },
      { code: "too-many-changes" },
      { code: "dislike-orientation", itemId: "living-side-table" },
      { code: "farther", itemId: "living-tv", secondId: "living-sofa" },
      { code: "keep-here", itemId: "living-side-table", at: "proposed" },
    ], "", proposal, context);
    expect(result.invalid).toEqual([]);
    expect(result.preferences).toEqual([
      { type: "keep-in-place", itemId: "living-sofa", allowRotation: false },
      { type: "minimise-changes", maxChangedItems: 1 },
      { type: "avoid-orientation", itemId: "living-side-table", angle: 90 },
      { type: "pair", firstId: "living-tv", secondId: "living-sofa", direction: "farther" },
      { type: "keep-in-place", itemId: "living-side-table", allowRotation: false, pose: { position: { x: 370, z: 270 }, orientation: 90 } },
    ]);
    const position = interpretFeedback([{ code: "dislike-position", itemId: "living-sofa" }], "", proposal, context);
    expect(position.preferences).toEqual([{ type: "avoid-position", itemId: "living-sofa", centre: { x: 100, z: 270 }, radius: 60 }]);
  });

  it("requires a reason, text for Other, and two different items for a pair", () => {
    expect(interpretFeedback([], "", proposal, context).invalid).toEqual(["no-reason"]);
    expect(interpretFeedback([{ code: "other" }], " ", proposal, context).invalid).toContain("other-needs-text");
    expect(interpretFeedback([{ code: "closer", itemId: "living-tv", secondId: "living-tv" }], "", proposal, context).invalid).toContain("pair-same-item");
  });

  it("reads feedback text about the proposal, keeps subjective text unmeasured", () => {
    const text = (reasons: Parameters<typeof interpretFeedback>[0], words: string, shown = proposal) => interpretFeedback(reasons, words, shown, context).textPreferences.map((item) => item.preference);
    expect(interpretFeedback([{ code: "other" }], "I don't like the sofa's position", proposal, context).preferences).toEqual([]);
    expect(text([{ code: "other" }], "I don't like the sofa's position")).toEqual([{ type: "avoid-position", itemId: "living-sofa", centre: { x: 100, z: 270 }, radius: 60 }]);
    expect(text([], "改動太多")).toEqual([{ type: "minimise-changes", maxChangedItems: 1 }]);
    // Only the sofa moved and only the side table turned, so "this position" and "this direction" are clear.
    expect(text([], "I don't like this position")).toEqual([{ type: "avoid-position", itemId: "living-sofa", centre: { x: 100, z: 270 }, radius: 60 }]);
    expect(text([], "唔鍾意呢個方向")).toEqual([{ type: "avoid-orientation", itemId: "living-side-table", angle: 90 }]);
    const both = { ...proposal, changes: [proposal.changes[0], { ...proposal.changes[1], to: { position: { x: 200, z: 70 }, orientation: 0 }, displacement: 220, rotation: 0 }] } as ProposalRecord;
    const unclear = interpretFeedback([], "I don't like this position", both, context);
    expect(unclear.textPreferences).toEqual([]);
    expect(unclear.ambiguous[0].slots[0].candidates).toEqual(["living-sofa", "living-side-table"]);
    expect(resolveAmbiguous(unclear.ambiguous[0], { itemId: "living-side-table" })).toEqual({ type: "avoid-position", itemId: "living-side-table", centre: { x: 200, z: 70 }, radius: 30 });
    expect(interpretFeedback([], "keep it here", proposal, context).unresolved[0].topic).toBe("keep-here");
    const style = interpretFeedback([{ code: "other" }], "It doesn't feel cosy", proposal, context);
    expect(style.preferences).toEqual([]);
    expect(style.textPreferences).toEqual([]);
    expect(style.unsupported[0].topic).toBe("style");
  });
});

describe("preference accumulation and conflicts", () => {
  const closer: Preference = { type: "pair", firstId: "living-sofa", secondId: "living-tv", direction: "closer" };
  const farther: Preference = { type: "pair", firstId: "living-tv", secondId: "living-sofa", direction: "farther" };

  it("merges by key: newer replaces older, a change limit only tightens", () => {
    const first = [entry({ type: "minimise-changes", maxChangedItems: 2 }, "feedback", 1), entry(closer, "control", 0)];
    const merged = mergePreferences(first, [entry({ type: "minimise-changes" }, "text", 2), entry({ type: "keep-in-place", itemId: "living-tv", allowRotation: false }, "feedback", 2)]);
    expect(merged.map((item) => item.preference)).toEqual([{ type: "minimise-changes", maxChangedItems: 2 }, closer, { type: "keep-in-place", itemId: "living-tv", allowRotation: false }]);
    expect(mergePreferences(merged, [entry({ type: "minimise-changes", maxChangedItems: 1 }, "feedback", 3)])[0].preference).toEqual({ type: "minimise-changes", maxChangedItems: 1 });
    expect(mergePreferences(merged, [], [merged[1].key]).map((item) => item.preference.type)).toEqual(["minimise-changes", "keep-in-place"]);
  });

  it("detects contradictions instead of accumulating them silently", () => {
    expect(detectConflicts([closer, farther], context.furniture, NO_LOCKS)).toEqual([{ code: "pair-direction", indices: [0, 1], itemIds: ["living-sofa", "living-tv"] }]);
    const keep: Preference = { type: "keep-in-place", itemId: "living-sofa", allowRotation: false };
    expect(detectConflicts([{ type: "avoid-position", itemId: "living-sofa", centre: { x: 240, z: 270 }, radius: 60 }, keep], context.furniture, NO_LOCKS)[0]).toMatchObject({ code: "keep-vs-avoid", indices: [0, 1] });
    expect(detectConflicts([{ type: "avoid-position", itemId: "living-sofa", centre: { x: 100, z: 270 }, radius: 60 }, keep], context.furniture, NO_LOCKS)).toEqual([]);
    expect(detectConflicts([keep, { ...keep, pose: { position: { x: 100, z: 270 }, orientation: 0 } }], context.furniture, NO_LOCKS)[0].code).toBe("keep-pose");
    const lock = { position: [], distance: [{ id: "distance-1", firstId: "living-sofa", secondId: "living-coffee-table", minimum: 32.5 }] };
    expect(detectConflicts([{ type: "pair", firstId: "living-coffee-table", secondId: "living-sofa", direction: "closer" }], context.furniture, lock)[0]).toMatchObject({ code: "closer-vs-lock", lock: { id: "distance-1", minimum: 32.5, actual: 32.5 } });
  });

  it("warns when a kept or locked item sits in the area to keep open", () => {
    const zone: Preference = { type: "open-zone", zone: { kind: "door", doorId: "master-door", depth: 90 } };
    expect(detectWarnings([zone, { type: "keep-in-place", itemId: "living-sofa", allowRotation: false }], context)).toEqual([{ code: "zone-blocked-by-fixed", itemIds: ["living-sofa"], reason: "kept" }]);
    expect(detectWarnings([zone], livingContext(demoLayout(), { position: ["living-sofa"], distance: [] }))[0].reason).toBe("locked");
  });
});
