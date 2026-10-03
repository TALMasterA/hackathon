# Test Plan (Revision 4)

## Cheap Verification Policy

Run `npm run typecheck` and `npm run test:run` after meaningful changes, `npm run lint` before each commit, and `npm run build` only before milestone pushes. A check is limited to roughly three minutes; a stalled check is stopped and recorded as unverified before continuing. Browser automation is not the default. Reserve one final smoke per milestone with no more than five browser calls, no polling/screenshot loops and no repeated failing action beyond twice.

The latest completed automated suite has **213 cases in fifteen files** (Revision 3 UI polish, after Revision 4 milestone 2). Obsolete fixed-sofa/gated-After cases were removed; relevant input, reset/language and geometry coverage was migrated, not ignored. Revision 3 migrated the cases that assumed twenty starting items to a `furnishedState()` helper (suggest all, set baseline, select the sofa) instead of deleting them. No DOM/GPU/backend/API/secret is required by Vitest.

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

## Revision 4 Verification Record

- Milestone 1 (furniture models): type checking, the unit suite and lint pass. Automated model checks load all fourteen committed GLB files in Node with Three.js' `GLTFLoader` and confirm that each library template's fitted model measures exactly its width x height x depth, rests on the floor and is centred on the item; that the suggested sofa's backrest is on the side away from the TV console and the console's front faces the sofa; and that collision tints never mutate cached materials. The session had no browser tools, so the rendered models were not seen in a browser.

- Milestone 2 (AI 3D look): type checking, the unit suite, lint and a production build pass. Automated cases cover photo validation (count, type by magic bytes, 4 MB size and declared body length), 503 when disabled or without a key, the per-IP and daily rate limits (route and sliding windows), queue-status mapping, server-side GLB streaming without fal URLs, the client job (4 s polling, 180 s timeout, cancel, server error codes), GLB parsing with external URLs blocked, looks surviving delete + undo and Reset + undo, looks cleared by an accepted library replacement and by Remove look (not by a lock-rejected replacement), the kind guard and the starting quarter turn.
- **One real end-to-end call** (dev server with `.env.local`, `curl`, a 768 x 768 JPEG of the Kenney sofa rendered from its GLB on white, 24 KB): POST 200 with a job ID in 12.3 s (including first-time route compilation in dev and the fal upload); status queued, then running, then done at 64.3 s after the POST; GLB download 200 `model/gltf-binary` in 10.1 s (including route compilation). **Time to model: about 74.6 s from POST to GLB downloaded. GLB size: 1,107,948 bytes (about 1.06 MiB).** The GLB has 5,269 vertices, one PNG base-colour texture, Y up, size 0.40 x 0.45 x 1.00 with the sofa's front facing +X. No fal URL appeared in any response. No other real call was made.

## Pending Manual Check

- Revision 3 UI polish: physical-phone drag/pinch/dial and virtual-keyboard behavior; same-item drag/rotation/dimension edits must not switch inspector tabs or reset its scroll; every add/replace/delete and Before/After/baseline/reset workflow; remaining distance locks must keep enforcing their thresholds after another lock is removed; issue-click selection; optional look consent/progress/preview across hidden tabs and empty Before; keyboard tabs, skip link and screen-reader announcements; narrow laptop/tablet and 320 px layouts; browser zoom and formal AA contrast review.
- Mobile 3D rendering after hiding/restoring/resizing needs manual confirmation. The bounded smoke observed a live WebGL context and a resized 326 x 358 backing buffer, but its mobile pixel sample was zero and its first canvas-width measurement preceded the renderer's resize. This is not evidence of successful mobile scene rendering. Desktop rendering was nonblank. The final empty-floor pan and look-panel lifetime preservation adjustments were typechecked and scoped-test checked, not browser-retested.

- Revision 4 milestone 2, in a real browser with a real fal key: AI look from real product photos (JPEG/PNG/WebP, portrait and landscape, phone camera photos with EXIF rotation, a transparent PNG); consent text and Confirm/Cancel; progress text, elapsed seconds and Cancel; the 3-minute timeout; reusing the same photo (no second call); the starting turn and Turn 90° on several kinds; Remove look; preview canvas and orbit; collision tint and selection outline on a look; Boxes mode; Before view; delete + undo, Reset + undo and library replace with a look; `.glb` upload (valid, too large, Draco-compressed, non-GLB); the "switched off" message with `MODEL3D_ENABLED` unset; both languages; 320/375 px; a phone over plain-HTTP LAN (no SHA-256 cache there); memory and frame rate with several looks.
- Revision 4 milestone 1, in a real browser: every kind's model appears and faces into its room in the fully suggested flat (the sofa and TV console face each other; chairs face the dining table/desk); models sit on the floor inside their outlines; colliding models turn translucent red and recover; selected/focused models show the box outline; Models / Boxes toggle in both languages and at 320/375 px (the toolbar may wrap onto two rows); loading flashes boxes only briefly; clicking a model selects it; frame rate on a low-end phone with all twenty models.

- Revision 3, all in a real browser: Undo/Redo buttons and shortcuts (including Ctrl+Z inside fields), drag/dial/typing step granularity, room chips/picker/double-tap focus, zoom buttons, gated wheel zoom, empty-floor panning, phone pinch and second-finger-during-drag, reveal-on-select, constant-size labels/lock icon/outlines while zoomed, 3D room framing/Reset View/zoom limits, the Suggested furniture panel and status text in both languages, empty-room hints, and layout at 320/375/1440 px with the new controls.

- Physical iOS/Android touch capture, cancellation/scroll conflicts, dial usability, pinch, virtual keyboard and low-end-device performance.
- Safari/Firefox, browser zoom extremes, screen-reader users and a formal accessibility/contrast review.
- Visual details beyond the bounded smoke: every model/window, multiple overlapping numeric labels, every library kind, removed-marker inspection, lock-row editing and camera preservation.
- Unsupported WebGL/context loss; error-boundary behavior on real hardware.
- Actual-flat accuracy, measurement uncertainty, conservative door swings, irregular shapes, delivery/plumbing/window clearances and any professional/code claim.
- Household comprehension, purchasing outcomes, consent-based usability and the timed manual-method comparison.

Unimplemented constraints are limitations, not checks to certify. The team should record judgement findings and create the next fixing prompt; no pending check is presented as passed.

## Revision 3 UI Polish Verification Record (2026-10-03)

- No geometry, lock enforcement, recommendation algorithm, state reducer, dependency versions or server routes changed. Existing remove-lock/delete-item history behavior gained two regression tests: deleting one lock preserves others and positions, releases the removed constraint, and supports undo/redo; deleting furniture cleans only related locks and undo restores the complete document.
- Typecheck passed after the final component changes. Full suite: 213 tests / 15 files passed. Focused state/translation suite: 63 passed; focused plan/state suite after pan preservation: 78 passed. The requested single lint pass passed before the final small preservation adjustments.
- One trusted integrated-browser smoke session, five tool calls total, approximately two minutes, including desktop and mobile screenshots. No unrelated browser exploration or real photo/API request.
- At 1440 x 900: no page-level horizontal overflow or body scrollbar; floor-plan and 3D stages had equal 509.5 px widths, matching top 297.4 px and bottom 795.2 px. Wheel scrolling the sidebar left the workspace at zero; scrolling the workspace then left the sidebar at 329 px and body at zero. A desktop WebGL pixel sample was nonzero.
- Smoke interactions: apply whole-flat example; select the sofa from the plan and observe Selected item tab; create a 25 cm distance lock, delete it through its accessible button, then restore it with the lightweight Undo action.
- At 375 x 812: normal page scrolling, no horizontal overflow, one visible visualization, retained twenty items, sofa selection and lock after switching view; constraint-creation draft `12` survived closing/reopening the drawer. Drawer close remained reachable after scrolling to its end. Traditional Chinese tabs and constraint controls rendered. Mobile scene rendering remains unverified as explained above.
- Declared dependencies were restored with `npm install --no-package-lock` because `@fal-ai/client` was missing locally. npm reported five high-severity audit findings; no audit fix or dependency upgrade was performed.
- An attempted second development server was refused because Next.js identified the existing server as this same workspace. The smoke used that server at http://localhost:3000; it was not stopped. No commit, push or deployment.
- Production build: the single final `npm run build` passed, including compilation, TypeScript and static page generation. Existing model3d routes remained present.