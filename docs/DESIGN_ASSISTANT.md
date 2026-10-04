# Design Assistant / 設計協作助手 (Designer Feedback Loop)

Brief: `hackathon-4-designer-feedback-prompt.md`. Branch: `designer-feedback`.

## Purpose

Help an ordinary household improve the furniture arrangement they already have, without interior-design knowledge. The assistant answers three questions for one room at a time, from numbers it actually measured:

- **What should change?** Real position and quarter-turn changes of furniture already in the room.
- **Why?** Each change is tied to the user's request and a before → after metric.
- **What does it cost?** Trade-offs: how many items move and how far, and other distances that change noticeably.

It is not a chat and gives no generic advice. Every round is started by the user; nothing loops on its own.

**Mode, stated in the UI:** interpretation is **rule-based** (fixed English / Traditional Chinese phrase rules) and generation is a **bounded heuristic search**. It is **not AI**. No new AI API, no MCP server, no account, no key and no network request is involved; everything runs in the browser. The existing fal.ai features (3D looks, plan reading) are untouched and unused by this workflow. The heuristic is **not a guarantee of a globally optimal design**, and results rely only on the dimensions and constraints represented in the app.

## User Flow

1. **Open** the **Design assistant** button in the toolbar (or the fourth inspector tab).
2. **Request**: choose the room; tick goals (only measurable ones are offered); pick the area or the two items for each goal; tick items to keep in place (optionally "may turn"); optionally describe needs in your own words (placeholder: 「想客廳易行啲，梳化唔好郁，其他傢俬可以調整。」). **Review request**.
3. **Confirm**: the interpreted request is shown: needs from the controls, needs found in the text (each with a tick box), ambiguous references with a picker, furniture that stays as it is (kept, position-locked, unclear room), assumptions, unsupported / unresolved / unrecognised text, limits (for example a kept item inside the area to clear), conflicts, and warnings already in the layout. **Generate proposal / 產生方案** is enabled only when there is a measurable goal, no invalid input and no unresolved conflict.
4. **Generating**: progress with **Cancel**; the search stops after 8 seconds. A second request cannot start while one runs.
5. **Proposal vN**: a clearly labelled preview (banner above the views, badge "Heuristic proposal · not AI · not applied") in both the 2D plan and the 3D view, with a **Current / Proposed** toggle. The committed positions show as dashed ghost outlines, the chosen area is drawn dashed on the plan, and editing is paused. The panel lists the changed furniture, the measured goals, why each change addresses the request, trade-offs, what was checked, what was not, and how it was ranked. Actions: **Accept and apply / 接受並套用**, **Not satisfied / 唔滿意**, **Discard proposal / 放棄方案**.
6. **Rejection**: at least one reason chip or a text explanation is required (text is required for **Other**): *This item should not move*, *Too many changes*, *I dislike this position*, *I dislike this orientation*, *These items should be closer*, *These items should be farther apart*, *Keep this item here* (with "original place" or "the place in this proposal"), *Other*. Each chip has its item or pair picker. The interpretation of the feedback (needs read from the text have tick boxes, as in step 3), conflicts with earlier needs (choose "use the new one" or "keep the earlier one") and unmeasurable text are shown before **Generate revised proposal / 按回饋重新產生**. Nothing regenerates while feedback is being typed.
7. **Accepted**: the applied changes, **Undo this application / 復原今次套用**, and **Start a new session from this layout**. No further proposal is made unless the user starts one.
8. Throughout a session: **Your needs** (each removable), a collapsible **Session history** (request text, each proposal's status, rejection reasons and text as written) and **End session**.

## The Skill (development only)

`.github/skills/fitin-layout-design/SKILL.md` is a workspace Agent Skill for coding agents that implement or review this workflow. It lists the instructions in the brief, points to the files below, and has one request → interpretation → proposal → rejection → revision → acceptance → undo example. **The Skill is not the website's runtime designer**: the app never reads it, and it confers no professional certification.

## Internal Tools

Plain TypeScript in `src/features/design-assistant/`; internal function calls only, no network endpoint or MCP tool.

| Brief name | Implementation | Responsibility |
| --- | --- | --- |
| getLayoutContext | `context.ts` `getLayoutContext` | Room, its items, which may move (position-locked: turn only; room membership unclear: excluded), doors with an approach in this room, current locks and revision, warnings already in the layout, session preferences. Also `zonePolygon`, `doorApproachZone`, `itemFrontZone`. |
| interpretUserNeeds | `interpret.ts` `interpretUserNeeds`, `structuredPreferences` | Structured controls (authoritative) plus a bounded EN / 繁中 parser; returns text preferences for confirmation, ambiguous references, unsupported and unresolved needs, unrecognised clauses, assumptions, invalid input, mode `rule-based`. |
| (feedback) | `interpret.ts` `interpretFeedback` | Reason chips and feedback text as preferences for the next round. |
| generateLayoutCandidates | `generate.ts` `generateLayoutCandidates` (async, chunked) / `generateLayoutCandidatesSync` | Bounded deterministic search from the baseline; never touches editor state. |
| validateLayout | `evaluate.ts` `validateLayout` | Reuses `analyzeLayout` and the lock functions; returns structured issues (layout, lock, keep, room, missing) plus pre-existing warnings among unchanged items. |
| evaluatePreferences | `evaluate.ts` `evaluatePreferences` | Measurable objectives only, with before/after values and outcomes. |
| recordRejectionFeedback | `session.ts` `reject` action + `preferences.ts` `mergePreferences` | Keeps the user's words, adds confirmed preferences, replaces those the user chose to replace, records the rejected arrangement. |
| previewProposal | `apply.ts` `previewProposal` + `use-design-assistant.ts` | The proposal's poses over the committed furniture as derived data, shown in both views. |
| applyAcceptedProposal | `apply.ts` | Freshness check, re-validation against current locks and kept items, one `apply-layout` editor action. |
| undoAppliedProposal | `apply.ts` | The editor's own undo, only while nothing changed since applying. |

Supporting changes outside the module: `itemViolations` in `src/lib/geometry/layout.ts` (the same warnings `analyzeLayout` reports for one item, sharing its cached obstacle preparation, used to test many poses quickly; `analyzeLayout` output is unchanged and a test compares the two), `layoutRevision` in `src/features/flat-editor/revision.ts`, the `apply-layout` action in `src/features/flat-editor/state.ts`, an optional `zones` prop on `FloorPlan`, and `src/i18n/assistant.ts`.

## Supported And Unsupported Needs

| Need | Support |
| --- | --- |
| Change as little as possible / 盡量少改動 | Soft: the size of the change counts three times as much in ranking. "Too many changes" adds a limit (previous changed count − 1, at least 1). |
| Keep a selected area open / 指定位置保持空曠 | Goal. Areas: the approach in front of a door on this room's side (door width × depth), or the space in front of an item's front face (item width × depth, moving with the item; area outside the room counts as blocked). Depth 60 / 90 / 120 cm is the user's choice, not a clearance standard. Measured as m² of furniture in the area. |
| Bring two items closer / 兩件傢俬近啲; move two apart / 兩件傢俬遠啲 | Goal. Edge-to-edge distance between the two footprints. |
| Keep in place (optionally may turn) | Hard. The original pose (or only position, if turning is allowed) is preserved in every round. |
| Keep this item here (proposal's place) | Hard: the item stays at the pose the user picked from a proposal. |
| I dislike this position / orientation | Filter on moved items: not within 30–60 cm (half the item's longer side) of the rejected spot; not within 10° of the rejected direction. |
| "More walking space / 易行啲" for the whole room | **Not measured.** Shown as needing more detail with a hint to choose an area to keep open. No route or whole-room clearance is claimed. |
| Lighting, daylight, colour, materials, feng shui, air/temperature, noise, style/comfort, budget, adding/removing/replacing, resizing, moving to another room | **Unsupported**, listed as such; no metric is invented. |

Text phrases recognised (examples): "don't move the sofa / 梳化唔好郁 / 不要移動", "change less / 少啲改動 / 盡量少改", "closer / 近啲 / 靠近", "farther / apart / 遠啲 / 分開", "keep the entrance clear / 門口唔好擋", "in front of the sofa clear / 梳化前面留空", "the rest can move / 其他傢俬可以調整". Furniture is matched by the item's own name (both languages) and kind words (sofa/梳化/沙發, table/枱/檯/桌, chair/椅 …) in the chosen room. A word matching several items (for example "chair" with three chairs, or "table") is asked about, never guessed.

## Hard Constraints Versus Soft Preferences

Hard (a candidate violating any is never shown as feasible): the room's boundary, walls, other furniture, door swing zones, voids / the traced outline, the ceiling, position locks (turning only, as the editor allows), distance locks, session keep-in-place, same room, unchanged sizes / ids / kinds. Soft: number of changed items, distance moved, turning, furniture in an open area, pair distances. Filters: avoided spots and directions, earlier arrangements.

Warnings already in the layout are disclosed in the confirmation and with each proposal ("already there; this proposal neither causes nor fixes them"); the baseline is never called valid when it has warnings. A candidate counts as feasible only when its changed items cause no warning and break no lock.

## Candidate Generation And Ranking

Search limits (`SEARCH_LIMITS` in `generate.ts`):

- Movable items: the room's items, minus kept items; position-locked items and kept items that may turn only turn.
- Positions per item and direction: a grid over the room's bounding box with a step of the room's shorter side / 16, clamped to 10–25 cm (20 cm in the demo living room), plus the positions flush with each side; widened until at most 600 positions. Directions: the item's angle + 0°, 90°, 180°, 270°.
- Each pose must lie inside the room (rounding slack 0.01 cm per cm of edge) and pass `itemViolations` and the item's distance locks. A pose that only overlaps one other movable item at its original place is kept for "make room" combinations.
- Combinations: single moves; then, unless the change limit is 1, two-item changes: the best 6 moves of an item blocked by one other item with up to 12 of that item's least-moving free spots, and the best 6 free moves of every two items together.
- A candidate must improve at least one goal and make none worse. Thresholds: an area improves by 0.05 m² or 25% of what was in it (whichever is less, at least 0.01 m²) and counts as clear at ≤ 0.005 m²; a pair changes by ≥ 10 cm, and "closer" is met when the items touch (≤ 1 cm).
- Ranking: first the number of goals improved, then (gain − weight × size of the change), where gain sums each goal's share of possible improvement and the size of the change = items changed + metres moved + 0.5 per quarter turn (weight 3 under "change as little as possible"), then a signature tie-break. This is an internal rule of thumb, not a design standard, and the UI says so.
- The best 25 candidates are re-validated in order with the full `analyzeLayout` and lock checks; the first that passes is the proposal.
- Deterministic: the same input gives the same proposal. The search runs in ~12 ms slices with a yield to the browser in between, and stops at 8 s ("timed out"). The demo living room takes about 0.5–0.8 s in Node.

Repeats: every proposal shown or rejected in the session is stored as an arrangement; a candidate whose items are all within **15 cm and 10°** of one is skipped. Revisions are always generated from the session's baseline with the accumulated preferences, never from a rejected draft.

## State Semantics

| Concept | Where |
| --- | --- |
| committedLayout | The editor reducer's `current` (unchanged owner). |
| baselineLayout | `DesignSession.baseline`: a copy of `current` when the session starts (or restarts). |
| proposalLayout | `previewProposal(current, proposal)`: derived for display, never dispatched. |
| preferences | `DesignSession.preferences` (key, preference, source, round). |
| feedbackHistory | Initial request text, rejections (reasons and text as written, unsupported and unrecognised parts), restarts; at most 20. |
| proposalHistory | `DesignSession.proposals`: id, version, input revision, changed ids, transforms, reasons, metrics, trade-offs, validation, modes, search statistics, status preview / rejected / accepted / discarded; at most 10. Avoided arrangements: at most 20. |
| layoutRevision | Two FNV-1a hashes of the flat id, ceiling, every item's id, kind, size, position and angle (0.01 cm) and all locks. |

Preview mode replaces the displayed furniture in the plan, 3D view, item list and issues; the committed layout becomes the ghost outline. Plan dragging, fields, the library, locks, ceiling, Set baseline, toolbar undo/redo and Ctrl+Z are disabled while the preview shows. Before/After clicks leave the preview. The global Before/After baseline is never changed by a preview or by applying. The session lives in browser memory only, like the rest of the editor.

**Stale sessions.** The workspace compares the current revision and plan with the session's. Any outside edit, lock change, Reset Demo, undo/redo or plan switch makes the session stale: the preview hides, Accept is disabled (and `applyAcceptedProposal` and the `apply-layout` reducer both refuse a mismatched revision), and **Restart from the latest layout** snapshots the new layout, carrying earlier needs back for review (needs about furniture no longer in the room are left out and counted; "keep at the proposal's place" is not carried because that place belonged to the old layout). Feedback history is kept.

**Apply and undo.** Accept checks freshness, re-validates the previewed poses against the current locks and the session's kept items, and dispatches one `apply-layout` action, which itself refuses another revision or a lock violation and changes only position and orientation. It is one undo entry. Undo here is allowed only while the layout is exactly the applied one and the previous history step is the pre-application layout; after newer edits it refuses and points to the toolbar Undo.

## Feedback Conflict Handling

- Closer and farther for the same pair, two different kept places for one item, an item kept where it is avoided: shown as conflicts. In the confirmation, untick or leave out one; in a rejection, choose "use the new one" (the earlier need is replaced) or "keep the earlier one".
- "Closer" for a pair whose distance lock already holds them at its minimum: shown with a pointer to the Constraints tab; the need must be left out or the lock changed there (which makes the session stale and offers a restart). Generation never overrides a lock.
- A kept or position-locked item inside the area to clear, or a pair whose items are both kept: shown as limits before generating, and as blockers if no proposal is found.
- Subjective or unsupported feedback stays visible in the history with no metric.

## Failure Behaviour

| Situation | What the user sees |
| --- | --- |
| No measurable goal / invalid picks | Generate disabled with the reason. |
| Goals already met | "Your current layout already meets these goals as measured, so nothing was moved." |
| Nothing new and suitable | "No new suitable proposal was found within the search limits", with "this does not mean no layout exists", the blockers (kept or locked items in the area, both pair items kept, a distance lock, the change limit, avoided spots, repeats, no free space) and user-controlled changes (remove a keep, remove a position lock, change a distance lock, remove the limit or an avoided spot, a smaller depth, another goal), plus search statistics. Nothing is relaxed automatically. |
| Timeout (8 s) / Cancel | Stated; the layout is unchanged; late results are ignored. |
| Unexpected error | The message, and the layout is unchanged. |
| Stale | Banner and restart, as above. |
| Apply / undo refused | The reason (changed layout, failed checks, lock, newer edits). |

## Setup And Checks

No setup beyond the project's own: `npm ci`, then `npm run dev`. No environment variable, key or service is needed. Checks: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build`. Tests: `src/features/design-assistant/*.test.ts`, `src/i18n/assistant.test.ts`, the `itemViolations` case in `src/lib/geometry/layout.test.ts` and the `apply-layout` cases in `src/features/flat-editor/state.test.ts`.

## Repeatable Demo

On the **Current demo** plan (the steps and numbers below are what the automated browser smoke saw on 2026-10-03; rounding may differ by locale):

1. Flat plan → **Current demo**; **Apply example layout** (20 items).
2. **Design assistant** → Room: Living / dining room → goal **Keep a selected area open** → Area: **Approach to Master-bedroom door**, Depth 90 cm. Text: `Don't move the TV, I want warmer lighting`. **Review request**.
3. Confirm shows the area need, "Keep TV console in place" from the text (ticked) and lighting as unsupported. **Generate proposal**.
4. **Proposal v1**: Sofa moved 150 cm (its overlap with the approach 0.56 → 0.00 m²). The banner and dashed ghost show it is a preview; toggle **Current / Proposed** to compare.
5. **Not satisfied** → **I dislike this position** (Sofa) → **Generate revised proposal**.
6. **Proposal v2**: a different arrangement (in the smoke: Sofa moved 80.6 cm and Coffee table moved 53.4 cm).
7. **Accept and apply**: the plan shows exactly the v2 poses; the toolbar Undo is one step.
8. **Undo this application**: the layout returns to the example layout.

Constraint-limited variant: tick **Keep in place → Sofa** in step 2 instead; the result is "No new suitable proposal…", naming the sofa as the blocker and suggesting to remove its keep.

## Manual Acceptance Checklist

| Scenario | Automated evidence | Manual check |
| --- | --- | --- |
| A Initial proposal | `generate.test.ts` A (validated real changes, deep-frozen inputs), `apply.test.ts` (preview does not change the committed layout) | Steps 1–4 on desktop and phone |
| B Keep an item fixed | `generate.test.ts` B (3 rounds) | Keep the sofa, reject twice |
| C Reject and revise | `generate.test.ts` C, `session.test.ts` | Steps 5–6 |
| D Constraint-limited search | `generate.test.ts` D and lock cases | Variant above |
| E Accept and undo | `apply.test.ts` | Steps 7–8; also the toolbar Undo/Redo after applying |
| F Manual edit during a session | `apply.test.ts` F, `state.test.ts` | Drag an item while a proposal is open → stale banner, Accept disabled, restart |
| G Unsupported requirement | `interpret.test.ts` | "warmer lighting" / 「要多啲陽光」 listed as unsupported |
| H No external AI | `generate.test.ts` H (fetch stubbed, never called); smoke saw no `/api` request | Run with no `.env.local` |
| I Existing functionality | Full suite (463 tests) | Drag, rotate, locks, replacement, Before/After, languages, 2D/3D sync, phone layout |

## Known Limits

- One room per session; items never change rooms. Items whose stored room and position disagree are excluded and listed.
- Quarter turns from the current angle only; no free angles.
- At most two items move per proposal (plus an item kept at a proposal's place).
- Areas are rectangles in front of a door or an item; there is no free-drawn area and no whole-room walking-route check.
- The text reader is a fixed list of phrases; anything else is shown as not recognised.
- Item-front areas count the part outside the room as blocked; a wall-facing item can never have a clear front area.
- Mobile and desktop UI were checked in one headless Chromium smoke only; physical-device and household checks are pending (docs/TEST_PLAN.md).
