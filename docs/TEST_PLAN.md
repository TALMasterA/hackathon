# Test Plan (Revision 3)

## Cheap Verification Policy

Run `npm run typecheck` and `npm run test:run` after meaningful changes, `npm run lint` before each commit, and `npm run build` only before milestone pushes. A check is limited to roughly three minutes; a stalled check is stopped and recorded as unverified before continuing. Browser automation is not the default. Reserve one final smoke per milestone with no more than five browser calls, no polling/screenshot loops and no repeated failing action beyond twice.

The latest completed automated suite has **158 cases in nine files**. Obsolete fixed-sofa/gated-After cases were removed; relevant input, reset/language and geometry coverage was migrated, not ignored. Revision 3 migrated the cases that assumed twenty starting items to a `furnishedState()` helper (suggest all, set baseline, select the sofa) instead of deleting them. No DOM/GPU/backend/API/secret is required by Vitest.

## Required Automated Coverage

| Required category | Observable tested outcome |
| --- | --- |
| SAT 0/30/45/90/135/360 | Rotated overlap vs separated rectangles; 360 equals zero |
| Touching/epsilon | Edge/corner contact allowed; sub-epsilon noise ignored and larger penetration detected |
| Penetration/area | Known 2 cm translation, 20 square-cm overlap, containment depth 6, 45-degree octagon area |
| Convex edge distance | Separated diagonal 5 cm, rotated known clearance, contact/overlap zero, symmetry |
| Architecture | Solid wall hit, furniture fitting a true door gap, front-door swing, envelope region/excess |
| Height | Excess changes from none at 260 to 30 cm at 220 for a 250 cm item |
| Position locks | More than one position lock; movement blocked, size/rotation allowed unless another lock fails |
| Distance locks | Satisfied/violated minimums, zero minimum, multiple locks on one item and all failures |
| Bounce-back | Continuous valid drag followed by failure returns last accepted position/draft; rotate/replace rejection |
| Temporary overlap | No-lock collision edit accepted, with a live warning |
| Manual validation | Blank/zero/negative/nonfinite/malformed/range inputs rejected without clamping; decimals preserved |
| Library/baseline | Free add/default angle, no-free result, pose-preserving replace, lock-cleaning delete, deep baseline and every change marker |
| Flat sanity | Five/no corridor, no overlapping rooms, known walls/openings within lengths, direct connections, valid default items and warning-free preset |
| 2D/3D transforms | Clockwise sign, cm-to-metres axes, triangle area/upward winding/elevation |
| Bilingual output | Complete keys/placeholders, new field/object names and actual numeric issue/lock values |
| Undo/redo granularity | 50 proposals in one gesture = one undo; typing 1/12/120 into width = one step, width then depth = two; blur starts a new step; ceiling typing coalesces |
| Undo/redo rules | Lock bounce, incomplete draft, no-op and empty gesture push nothing; add+delete undo/redo; new action clears redo; Reset Demo undo restores layout/locks/baseline; Before view no-op; vanished selection becomes null; 100-step cap drops oldest |
| Plan zoom maths | Room fit contains room + 30 cm at wide/tall aspects and is centred; zoom keeps the anchor's screen fraction; 120 cm minimum and snap-to-home; extreme pans keep >= 25% overlap; reveal leaves visible items alone and centres off-screen ones; zoomed `clientToPlan` |
| 3D room framing | Room target = centre in metres at 0.6 m; distance = larger side x 1.6 within 2-10 m; direction preserved; no focus = original whole-flat pose and 6-22 m |
| Empty start / suggestions | Fresh state empty with no issues/selection in both views; suggest all = 20 warning-free items in one undo step; repeat room suggestion adds nothing and reports present; blocked sofa skipped as furniture; lock-breaking item skipped; Reset then undo; Before no-op; bilingual skip message |

Additional state cases cover incomplete drafts, readonly Before, shared ceiling input, language/reset, impossible lock creation/edit, missing/same endpoints, re-baselining warnings, comparison draft discard, room following, and extreme coordinate rejection.

## Desktop Judge Checklist

1. Start locally; confirm five rooms, walls with real openings, entrance, windows, no furniture, empty-room hints and an empty Before. Use Furnish whole flat and confirm twenty warning-free items marked Added in both views; repeat Suggest for a room and read the "already present" status.
2. Select any item in plan/list/3D; drag only in the plan, including release outside its original bounds.
3. Enter exact X/Z and dimensions; edit obliquely with dial and numeric angles at 0/30/45/90/135/360.
4. Overlap furniture/wall/swing/envelope and exceed ceiling; inspect red tint, true floor region, near-region numbers, Issues and item focus.
5. Toggle several position locks; ensure X/Z and drag are blocked but eligible rotation/size works.
6. Create several edge-distance locks, edit/delete them, exercise valid and rejected moves/rotations/resizes/replacements, and compare required/attempted/restored numbers.
7. Add/replace/delete every library kind, including a room with no preset-size free position and a deleted lock endpoint.
8. Compare Before/After immediately, inspect ghosts and changed/removed markers, set a baseline, and verify camera does not reset on those actions.
9. Reset Demo and Reset View; verify the empty flat/baseline, default ceiling, empty locks, whole-flat plan/camera and retained language, then Undo to recover the previous layout.
10. Test blank/malformed/maximum input and keyboard focus/error associations; confirm last accepted geometry is not clamped or replaced by bad text.
11. Undo across a long plan drag and a dial drag: each is one step. Type into width, blur, type again: two steps. Ctrl+Z inside a text field undoes the text, not the layout; Ctrl+Z on the page undoes the layout; Ctrl+Shift+Z / Ctrl+Y redo.
12. Laptop wheel and trackpad: the plain wheel scrolls the page at whole-flat zoom; Ctrl/Cmd + wheel (or trackpad pinch) zooms around the cursor; once zoomed, the plain wheel zooms. Drag empty floor to pan; confirm the view cannot be lost off the flat.
13. Room chips, room picker and double-click zoom the plan and move the 3D camera to the room without changing its viewing direction; after orbiting, tapping the already-focused chip or Fit reframes the 3D camera again; the zoom buttons sit at the right end of the chip bar and never cover the plan at 320/375 px; Fit/Whole flat return both views; zoom buttons and Reset View in 3D stay within the focused room's limits. Selecting an off-screen item from the list, 3D view or Issues pans the zoomed plan to it.

## Mobile / Bilingual Judge Checklist

- Physical phone: plan drag with capture/release/cancel, scroll outside the gesture, dial rotation, lock creation/edit/delete and numeric keyboard.
- Confirm expanded small-item hit areas and touch-sized controls; no clipped controls or overlapping text in stacked panels.
- Inspect English/Traditional Chinese names, source disclaimers, new controls, errors, Issues, saved/attempted lock values and removed markers.
- Compare language switching during warnings/lock rejection; Reset Demo should retain language.
- Check long numeric labels, many concurrent collisions and lock rows; avoid assuming code key parity proves linguistic clarity.
- Verify orbit, wheel/pinch, zoom/reset and view-only 3D movement on actual devices.
- Physical phone: two-finger pinch zooms around the fingers and pans with them; a second finger during a furniture drag stops moving the furniture; double-tap on an empty room zooms; labels, lock icons and outlines stay readable at full zoom.

## Revision 2 Verification Record

- Type checking, the 113-test suite and lint pass after the complete feature changes.
- Production builds passed before all five implementation milestone pushes.
- Numerical data/geometry/state/input/translation checks are current Revision 2 evidence; Revision 1 browser screenshots are not reused as proof for this layout.
- Final bounded browser smoke completed in five browser calls total, including one expired previous-page reference that performed no action and one fresh page open. No Chrome DevTools exploration, gesture retries, polling or screenshot loops were used.
- The live page passed nine smoke checks: twenty-item load, one native pointer plan drag (selected X changed from 250 to about 267.20 cm), one keyboard dial rotation to 1 degree, one 25 cm distance-lock creation, a numeric Z proposal bounced to the last accepted pose (attempted distance about 1.320802 cm), immediate readonly Before/current After, one Traditional Chinese switch and a live non-lost WebGL context.
- No console errors or external requests were observed during the exercised sequence. The bounded desktop/mobile render captures passed layout overflow and nonblank-context checks at 1440 and 375 px. This is not physical-phone gesture or exhaustive visual certification.
- No household study, measured time comparison or professional accuracy validation has been performed.

## Revision 3 Verification Record

- Type checking, the 158-case suite and lint pass after each of the three feature milestones; a production build passed once before handover.
- The implementation session had no browser automation tools, so **no Revision 3 browser smoke was performed**. Every Revision 3 UI behaviour below is unverified in a real browser.

## Pending Manual Check

- Revision 3, all in a real browser: Undo/Redo buttons and shortcuts (including Ctrl+Z inside fields), drag/dial/typing step granularity, room chips/picker/double-tap focus, zoom buttons, gated wheel zoom, empty-floor panning, phone pinch and second-finger-during-drag, reveal-on-select, constant-size labels/lock icon/outlines while zoomed, 3D room framing/Reset View/zoom limits, the Suggested furniture panel and status text in both languages, empty-room hints, and layout at 320/375/1440 px with the new controls.

- Physical iOS/Android touch capture, cancellation/scroll conflicts, dial usability, pinch, virtual keyboard and low-end-device performance.
- Safari/Firefox, browser zoom extremes, screen-reader users and a formal accessibility/contrast review.
- Visual details beyond the bounded smoke: every model/window, multiple overlapping numeric labels, every library kind, removed-marker inspection, lock-row editing and camera preservation.
- Unsupported WebGL/context loss; error-boundary behavior on real hardware.
- Actual-flat accuracy, measurement uncertainty, conservative door swings, irregular shapes, delivery/plumbing/window clearances and any professional/code claim.
- Household comprehension, purchasing outcomes, consent-based usability and the timed manual-method comparison.

Unimplemented constraints are limitations, not checks to certify. The team should record judgement findings and create the next fixing prompt; no pending check is presented as passed.