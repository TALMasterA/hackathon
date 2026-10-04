import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { isAssistantKey } from "../../i18n/assistant";
import type { Language } from "../../types/domain";
import { demoLayout, NO_LOCKS } from "./fixtures";
import { generateLayoutCandidatesSync } from "./generate";
import { formatMessage, namesFor, preferenceMessage } from "./messages";
import type { Message, Preference } from "./types";

const preferences: Preference[] = [
  { type: "keep-in-place", itemId: "living-tv", allowRotation: false },
  { type: "keep-in-place", itemId: "living-tv", allowRotation: true },
  { type: "keep-in-place", itemId: "living-tv", allowRotation: false, pose: { position: { x: 1, z: 2 }, orientation: 90 } },
  { type: "minimise-changes" },
  { type: "minimise-changes", maxChangedItems: 2 },
  { type: "open-zone", zone: { kind: "door", doorId: "master-door", depth: 90 } },
  { type: "open-zone", zone: { kind: "item-front", itemId: "living-sofa", depth: 60 } },
  { type: "pair", firstId: "living-sofa", secondId: "living-tv", direction: "closer" },
  { type: "pair", firstId: "living-sofa", secondId: "living-tv", direction: "farther" },
  { type: "avoid-position", itemId: "living-sofa", centre: { x: 100, z: 270 }, radius: 60 },
  { type: "avoid-orientation", itemId: "living-sofa", angle: 90 },
];

function expectFormatted(messages: readonly Message[], language: Language) {
  const names = namesFor(DEMO_FLAT, demoLayout().furniture, language);
  for (const message of messages) {
    expect(isAssistantKey(message.key), message.key).toBe(true);
    const text = formatMessage(message, language, names);
    expect(text, message.key).not.toMatch(/\{\w+\}/);
    expect(text).not.toContain("living-");
  }
}

describe("grounded explanation messages", () => {
  it("formats every proposal and no-result message in both languages with names, not ids", () => {
    const run = (prefs: Preference[]) => generateLayoutCandidatesSync({ flat: DEMO_FLAT, roomId: "living", baseline: demoLayout(), locks: NO_LOCKS, preferences: prefs, avoid: [], version: 1, proposalId: "p1", inputRevision: "r" });
    const found = run([preferences[5], { type: "minimise-changes" }]);
    const none = run([preferences[5], { type: "keep-in-place", itemId: "living-sofa", allowRotation: false }, { type: "minimise-changes", maxChangedItems: 1 }]);
    expect(found.status).toBe("found");
    expect(none.status).toBe("none");
    for (const language of ["en", "zh-Hant"] as const) {
      if (found.status === "found") expectFormatted([...found.proposal.reasons.flatMap((reason) => reason.messages), ...found.proposal.tradeOffs, ...found.proposal.checks, ...found.proposal.unverified, ...found.proposal.ranking], language);
      if (none.status === "none") expectFormatted([...none.blockers, ...none.suggestions], language);
      expectFormatted(preferences.map(preferenceMessage), language);
    }
    const names = namesFor(DEMO_FLAT, demoLayout().furniture, "zh-Hant");
    expect(formatMessage(preferenceMessage(preferences[5]), "zh-Hant", names)).toBe("主人房門前的通道（90 厘米）保持空曠");
    expect(formatMessage(preferenceMessage(preferences[7]), "en", namesFor(DEMO_FLAT, demoLayout().furniture, "en"))).toBe("Sofa and TV console closer");
  });
});
