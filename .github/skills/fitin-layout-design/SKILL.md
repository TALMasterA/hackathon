---
name: fitin-layout-design
description: Implement and review FitIn furniture-layout proposals, geometry validation, user-feedback revisions, isolated previews, and accepted-layout application.
---

# FitIn layout design (development Skill)

This Skill guides a coding agent that changes or reviews FitIn's **Design assistant / 設計協作助手**. It is a development workflow only. It is not the website's runtime designer, it does not run inside the app, and it confers no professional interior-design, accessibility or building-code certification. The app's runtime behaviour lives in the files below; do not copy their logic into this Skill.

## Where the real implementation is

| Responsibility | File |
| --- | --- |
| getLayoutContext, room shape, door-approach and item-front zones | `src/features/design-assistant/context.ts` |
| interpretUserNeeds, interpretFeedback (bounded EN / 繁中 rules) | `src/features/design-assistant/interpret.ts` |
| Preference keys, merge, conflicts, warnings | `src/features/design-assistant/preferences.ts` |
| evaluatePreferences, validateLayout | `src/features/design-assistant/evaluate.ts` |
| generateLayoutCandidates (bounded heuristic search, `SEARCH_LIMITS`) | `src/features/design-assistant/generate.ts` |
| Grounded explanation templates | `src/features/design-assistant/explain.ts` |
| Session reducer, recordRejectionFeedback, freshness | `src/features/design-assistant/session.ts` |
| previewProposal, applyAcceptedProposal, undoAppliedProposal | `src/features/design-assistant/apply.ts` |
| React wiring and panel | `use-design-assistant.ts`, `assistant-panel.tsx`, `src/features/flat-editor/workspace.tsx` |
| Layout revision hash, `apply-layout` editor action | `src/features/flat-editor/revision.ts`, `src/features/flat-editor/state.ts` |
| Geometry it reuses | `src/lib/geometry/layout.ts` (`analyzeLayout`, `itemViolations`), `locks.ts`, `architecture.ts`, `oriented.ts` |
| Texts | `src/i18n/assistant.ts` (+ parity test) |
| Behaviour, limits, acceptance checklist | `docs/DESIGN_ASSISTANT.md` |

## Instructions

1. **Inspect the actual model first.** Read `src/types/domain.ts`, the editor reducer and the geometry validators before changing anything. Do not assume an earlier revision of the repository.
2. **Translate daily-life needs into supported, structured preferences** (`Preference` in `types.ts`): keep in place, change little, keep a chosen zone open, pair closer / farther, avoided spot or direction. Anything else is returned as unsupported, unresolved or unrecognised, never guessed. Structured controls are authoritative; text-derived preferences need the user's tick.
3. **Separate hard constraints from soft preferences.** Hard: room boundary, walls, furniture, door swing zones, voids/outline, ceiling, position locks, distance locks, session keep-in-place, same room. Soft: number and size of changes, zone overlap, pair distance. Avoided spots and directions are filters on moved items.
4. **Preserve existing locks and fixed building elements.** Never redefine position-lock semantics (a locked item may only turn), never relax a distance lock inside generation, never move walls, doors or windows, never move furniture to another room, never change sizes or add/remove/replace items.
5. **Generate bounded candidates** from the session baseline: grid positions and quarter turns per item, single moves, then limited two-item combinations. Keep the search deterministic and chunked; document any limit you change in `SEARCH_LIMITS` and in the docs.
6. **Validate before presenting a candidate as feasible**: the winner is re-checked with the full `analyzeLayout` plus locks through `validateLayout`. Pre-existing warnings among unchanged items are disclosed, never labelled valid, and never blamed on the proposal.
7. **Ground explanations in actual transforms and evaluated metrics.** Use the templates in `explain.ts`; every claim names the item, the request and a before → after number. No improvement claim without a metric, no comfort percentages, no "AI" wording.
8. **Accumulate rejection feedback.** Keep the user's text verbatim in `feedbackHistory`; add only confirmed, actionable preferences; show contradictions and let the user resolve them.
9. **Avoid repeating rejected arrangements.** Every shown arrangement goes to `session.avoid`; candidates within 15 cm and 10° of one are skipped (`repeatsArrangement`).
10. **Keep proposal drafts isolated.** A preview is derived data (`previewProposal`) and is never dispatched; the committed layout and the global Before/After baseline stay untouched until "Accept and apply".
11. **Require user approval before applying**, as one `apply-layout` step that is a normal undo entry.
12. **Detect stale proposals** with `layoutRevision` (flat id, items, sizes, poses, ceiling, locks). A changed revision or another plan blocks applying and offers a restart from the latest layout; undo is refused when newer edits exist.
13. **Report unsupported needs and search limits honestly.** "No suitable proposal within the search limits" is not "no layout exists"; list blockers and user-controlled changes; never relax requirements automatically.
14. **Preserve English / Traditional Chinese support**: add every new key to both dictionaries in `src/i18n/assistant.ts`; the parity test must pass.
15. **Use focused tests and time-boxed verification**: add Vitest cases next to the module you change; run `npm run typecheck`, `npm run test:run`, `npm run lint`, then one `npm run build`, each within about three minutes. Do not add a new AI provider, MCP server, database or service for this feature, and do not invent universal clearance standards (zone depths are the user's choice).

## Example (demo plan "Current demo", example layout applied)

1. **Request** — Living / dining room, goal "Keep a selected area open" → Approach to Master-bedroom door, 90 cm; text "Don't move the TV, I want warmer lighting".
2. **Interpretation (rule-based)** — confirmed: keep that approach open; from text (ticked): keep TV console in place; unsupported: lighting.
3. **Proposal v1** — sofa moved 150 cm; "For 'keep the approach … open': Sofa overlapped it by 0.56 m², now 0.00 m²"; trade-off: 1 item, 150 cm; checks passed; walking route not checked.
4. **Rejection** — "I dislike this position" for the sofa → avoid within 60 cm of that spot; the arrangement is recorded.
5. **Revision v2** — a different arrangement (for example the sofa and coffee table each moved), generated again from the same baseline, not from v1.
6. **Acceptance** — "Accept and apply" checks the revision, re-validates and applies both poses in one undo step.
7. **Undo** — "Undo this application" restores the previous layout while nothing else has changed; after a newer edit it refuses and points to the toolbar Undo.
