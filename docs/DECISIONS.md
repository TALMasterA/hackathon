# Decisions

## Revision 3 UI Polish (2026-10-03)

- Incremental UI revision on top of the existing Revision 4 features; no framework, document reducer, geometry, solver, backend or dependency-version changes.
- Desktop (768 px and above) uses a bounded 100dvh shell, shared toolbar and 340 px inspector with independent, contained workspace/inspector scrolling. Mobile uses normal page scrolling and a non-modal 75dvh bottom inspector with sticky tabs and close control; no drawer dependency or focus trap.
- Two equal visualization tracks appear only when the actual workspace container is at least 780 px wide. Otherwise a Floor plan / 3D switch shows one renderer. Both renderer components stay mounted, use their existing resize support and retain view state; the toolbar tracks reserve equal height.
- One shared room selector replaces duplicate room navigation. It controls 2D focus, 3D focus and room examples/library placement. Whole-flat mode preserves the existing single-tap/item-selected room as the library placement fallback, shown explicitly as Add to. Single-tap selection and free pan do not issue focus requests; double-tap and Fit keep their original meanings.
- Inspector tabs stay mounted. Only a changed non-null selected ID opens Selected item and scrolls the inspector to the top; editing/dragging the same item and deliberate tab navigation do not. Library-template choice is shared between adding and replacement. The optional look panel stays mounted even without selection so an existing photo job is not newly aborted by this UI rearrangement.
- Individual distance-lock removal already used document history; the UI now has destructive accessible names and a lightweight Undo notice, valid only while that deletion is the latest history entry. No furniture is repositioned. Position locks belong to Selected item; distance locks belong to Constraints.
- Static placements are called examples; empty checks are neutral, and successful checks explicitly refer only to implemented checks. Scenario information/limitations remain available inside a collapsed disclosure.
- Formal accessibility, physical-touch behavior and mobile renderer restoration remain team verification items in TEST_PLAN; the bounded browser smoke does not certify those.

## Revision 4 Team Decisions

The Revision 4 fixing prompt replaces the box look with furniture models (milestone 1) and adds an optional AI 3D look from a photo (milestone 2). Everything from Revision 3 still applies, except that FitIn now has three server route handlers for the optional AI look.

### Furniture 3D models (milestone 1)

- **Models are appearance only.** Each item's width x depth x height box remains the only geometry for collisions, locks, issues, the plan and Before/After. `fitObjectToBox(bounds, dimensions, rotationDeg)` stretches a model non-uniformly so its bounding box is exactly that box (cm to m), with its base on the floor and centred on the item position, inside the item's existing `threeRotation` group. Proportions are therefore distorted when an item's size differs a lot from the model's.
- **Model mapping** (Kenney Furniture Kit 2.0, CC0, GLB files copied under FitIn names into `public/models/furniture/` with the kit's `License.txt`):

  | FitIn kind | Kenney model | File |
  | --- | --- | --- |
  | sofa | loungeSofa | sofa.glb |
  | coffee-table | tableCoffee | coffee-table.glb |
  | tv-console | cabinetTelevision | tv-console.glb |
  | side-table | sideTable | side-table.glb |
  | dining-table | table | dining-table.glb |
  | chair | chair | chair.glb |
  | bed, width >= 120 cm | bedDouble | bed-double.glb |
  | bed, width < 120 cm | bedSingle | bed-single.glb |
  | wardrobe | bookcaseClosedDoors (tall closed cabinet with doors) | wardrobe.glb |
  | desk | desk | desk.glb |
  | kitchen-counter | kitchenCabinet | kitchen-counter.glb |
  | fridge | kitchenFridge | fridge.glb |
  | toilet | toilet | toilet.glb |
  | vanity | bathroomCabinetDrawer (drawer unit with a basin on top) | vanity.glb |

  Every kind has a match, so no kind keeps the box look in Models mode. `bathroomSink` is a pedestal basin and `bathroomCabinet` a small mirrored wall cabinet, so the kit's drawer-and-basin unit is the closer vanity. The kit's `sideTable` is a narrow console-style table; it is stretched to the 40 x 40 cm side-table box.
- **Facing rule.** glTF models face +Z (checked in the kit: sofa/chair backrests, bed headboard and toilet tank are at -Z; doors, drawers and fridge handle protrude at +Z). FitIn fronts face local -Z, as `SofaModel`'s backrest is at +Z, so every model turns 180 degrees before fitting. A test loads the real sofa and TV-console files and confirms they face each other in the suggested living room.
- **Suggested angles changed (geometry-neutral).** In the suggested set the sofa and TV console were both at 0 degrees, so under the facing rule the console faced the wall. The TV console, north dining chair, fridge, vanity and second-bedroom desk are now at 180 degrees and the west dining chair at 90 degrees, so each faces into its room or table. Every turned footprint is identical to its 0-degree footprint (tested), so warnings and fit are unchanged; only the displayed angle differs.
- **Lit materials.** The kit's materials are flagged unlit (`KHR_materials_unlit`), which renders every face of a model in one flat colour. Each unlit material gets one shared `MeshStandardMaterial` copy with the same colour, so the scene's existing ambient and directional lights shade it. No light was added.
- **Collision and selection.** A colliding model gets per-item cloned materials tinted the existing translucent red (#ba4c43, opacity 0.55, no depth write); the cached materials are never mutated, and the clones are disposed when the item stops colliding or unmounts. A selected or focused model also draws the exact box `Edges` outline, so the checked box stays visible.
- **Fallback.** Boxes mode, a model still loading (`Suspense`), a load failure (per-item error boundary) or a kind without a mapping draws today's box, or the composed sofa for sofas.
- **Models / Boxes toggle.** A bilingual two-button toggle in the 3D toolbar, defaulting to Models. Boxes shows the exact checked geometry. It is 3D view state: not undo history, not persisted, and back to Models after Reset Demo (the 3D view remounts).
- **Loading.** All fourteen files (about 250 KB in total) are preloaded once when the 3D view loads, cloned per item sharing geometry, and loaded without Draco or Meshopt decoders, so nothing is fetched from a CDN. Shadows, lights, demand rendering and the pixel-ratio cap are unchanged.

### AI 3D look from a photo (milestone 2)

- **Appearance only.** Any one item can have its own look, made by fal.ai TRELLIS from a product photo or uploaded as a `.glb`. It goes through the same `fitObjectToBox` path as the kind models, stretched to exactly the item's box, turned by the facing rule and then by the user's quarter turns. Collision tint and selection outline behave as for kind models. Boxes mode shows boxes for everything. Geometry and every check keep using the box.
- **Privacy statements** (footer, README, HACKATHON_COMPLIANCE): measurements, layout and checks never leave the device; only a photo the user explicitly chooses to send goes to fal.ai; FitIn stores nothing. The photo is resized on the device (at most 1024 px, JPEG 0.85, flattened on white) and sent only after the bilingual consent text and Confirm. The fal storage upload and the generated model are requested with a one-hour expiry. No photo, model, look or job is persisted by FitIn.
- **Server.** `POST /api/model3d` (exactly one JPEG/PNG/WebP form entry, at most 4 MB; the declared type must match the file's magic bytes), `GET /api/model3d/[id]` (`queued`/`running`/`done`/`failed`) and `GET /api/model3d/[id]/file` (GLB fetched server-side and streamed as `model/gltf-binary`, capped at 50 MB, `Cache-Control: no-store`). `FAL_KEY` is read only by these handlers through `createFalClient`; fal's generic proxy route is not used and no fal URL reaches the browser. Errors are returned as stable codes without upstream details.
- **Job ID.** The returned `jobId` is fal's queue request ID. It is not a URL or a credential and is useless without the server's key; the routes accept only `[A-Za-z0-9-]{8,64}`. Storing a server-side mapping instead would break across server instances.
- **Enabling.** All three routes return 503 unless `MODEL3D_ENABLED === "true"` and `FAL_KEY` is set; the panel then explains that AI looks are switched off and that a `.glb` can still be uploaded. `.env.example` lists both variables; `.env*` stays ignored except that example.
- **Rate limits.** In memory per server instance: 5 accepted photos per IP per sliding 10 minutes and 60 accepted photos per sliding 24 hours across all IPs. Only accepted submissions count (rejected uploads use no quota), and the limit is checked before the body is parsed. The IP is the first `X-Forwarded-For` hop, else `X-Real-IP`; without a trusted proxy it can be spoofed, which the global daily cap bounds. Status and file routes are not rate-limited.
- **Status mapping.** `IN_QUEUE` to queued, `IN_PROGRESS` to running, `COMPLETED` to done unless fal reports an error, anything else failed; a 4xx from fal (for example an unknown ID) is failed and other upstream errors are 502.
- **Client job.** Polls every 4 s, shows the phase, elapsed seconds and Cancel, tolerates two consecutive failed polls, and stops at 180 s from Confirm with a timeout message. Cancel only stops FitIn waiting; the fal job may still finish and is not fetched. One job runs at a time; it stays tied to the item it was started for even if the selection changes.
- **Session cache.** Finished GLBs are cached in memory by the SHA-256 of the resized photo for the session; choosing the same photo again reuses the model without sending anything. Where Web Crypto is unavailable (plain-HTTP LAN addresses), nothing is cached.
- **Looks state.** A `useLooks` hook outside the editor reducer holds `Map<itemId, Look>`, `Look = { source, object, quarterTurns, name, kind }`. Looks are not undo history and are not persisted. They are kept when an item is deleted or on Reset Demo, so undo brings the item back with its look, and are cleared only by an accepted library replacement (a lock-rejected replacement keeps the look) or Remove look. A look renders only for items that currently exist in the displayed snapshot, including the baseline in Before.
- **Kind guard (added).** `Look` also records the item kind it was made for, and renders only while the item still has that kind. Undo restores the item-ID counter, so an undone library item's ID can be reused by a new item; without the guard, for example, a new wardrobe could inherit an undone sofa's look. Suggested items keep stable IDs, so re-adding the suggested sofa after Reset Demo shows its earlier look again.
- **Starting turn (added).** The one real TRELLIS model faced +X with its long side along Z, so with no turn a sofa look would have appeared sideways and stretched across the wrong axes. A new look therefore starts at one quarter turn when its longer horizontal side clearly (by at least 1.2x) lies across the item's longer side, and at none otherwise. For that sofa, one turn also put its front toward FitIn's front. Front versus back cannot be inferred, so Turn 90 degrees remains the fix.
- **Turn 90 degrees** turns the look a quarter turn clockwise in the plan, matching item angles. A turned look is stretched to the same box, so its proportions change.
- **Upload .glb.** Binary glTF only, at most 30 MB, loaded with Three.js' `GLTFLoader` on demand, without Draco or Meshopt. A loading manager blocks every non-`data:`/`blob:` URL, so a model referencing external files fails instead of fetching them. A model with no geometry is rejected.
- **Materials.** Look materials are kept as authored (no unlit-to-lit conversion). A look's GPU resources are disposed about one second after it is removed or replaced.
- **Failures** keep the kind model or box: the panel shows a bilingual message plus "The item keeps its current look", and a look that throws while rendering falls back to the kind model through an error boundary.
- **Panel placement.** "3D look (optional)" sits under the selected-item panel. It is visible in Before but its actions are disabled there, matching the read-only baseline. The preview canvas shows the look inside the item's W x D x H outline from the item's front and can be orbited, but not zoomed.

## Revision 3 Team Decisions

The Revision 3 fixing prompt adds undo/redo, floor-plan zoom with a room focus shared by both views, and an empty start with team-prepared suggested furniture. It supersedes Revision 2's "no undo/redo" and "twenty items loaded at start" rules; everything else below still applies.

- **History contents and cap.** History stores document state only: current and baseline snapshots, locks and the item/lock ID counters. `past` is capped at 100 entries (oldest dropped). Any new entry clears redo.
- **One undo step each:** a whole plan drag (pointer down to up or cancel), a whole rotation-dial drag, consecutive typing in one field of one item, each add/replace/delete, each suggestion batch, each position-lock toggle and distance-lock create/edit/remove, Set current as baseline, and Reset Demo.
  - Field typing coalesces until the field blurs, the selection changes or a different action happens. Ceiling typing coalesces the same way and ends on blur.
  - Keyboard dial steps are individual steps.
- **No history entry for:** lock-bounced edits, incomplete drafts, no-ops (the document is compared by reference, then by deep equality), selection, room choice, language, Before/After, camera and plan zoom.
- **Undo/redo behaviour.** Undo/redo are disabled in Before. They keep the language, view, room and camera. They keep the selection if that item still exists (otherwise nothing is selected), rebuild the numeric draft and ceiling field, and clear transient notices.
- **Shortcuts.** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Shortcuts are ignored while focus is in an input, select or textarea, so the browser's own text undo still works there.
- **Reset Demo is undoable** and has no confirm dialog. It returns to the empty flat and empty baseline, and returns both views to the whole flat.
- **One shared room focus.** The room focus is set by the room chips, the toolbar room picker and a double-tap/click on a room's empty floor (two presses within 350 ms and 24 px). It fits the 2D plan to the room plus 30 cm at the stage aspect, and also selects that room for Add item. A single tap still only selects the room.
  - Revision 3.1: every chip, Whole flat or Fit tap (and every room-picker change or double-tap) is a new focus request with a sequence number. Each request re-fits the 2D plan and reframes the 3D camera, even when that room is already focused.
- **Free 2D zoom is 2D-only.** Zoom buttons (x1.25), pinch, wheel and pan never change the focus or the 3D camera.
- **Zoom button placement (Revision 3.1).** The plan's zoom in, zoom out and Fit buttons sit at the right end of the room-chip bar, outside the plan, so they never cover a room. They share a row with the chips when there is space and wrap below them on narrow screens.
- **Wheel gating.** The wheel zooms around the cursor only with Ctrl/Cmd held or once the plan is zoomed in. A non-passive listener calls `preventDefault` only when it zooms; otherwise the page scrolls.
- **Zoom and pan limits.** Zoom runs from the whole flat (zoom 1) to a 120 cm wide view, and zooming fully out snaps back to the exact whole-flat view. Panning keeps the view centre over the flat, so at least half of each axis, and at least a quarter of the view area, overlaps it.
- **Touch gestures.** A second finger during a furniture drag ends the drag as one undo step and becomes a pinch; furniture never moves with two fingers. After a pinch, the remaining finger does nothing until it is lifted.
- **No auto-pan** while dragging furniture past the edge of the zoomed view.
- **Reveal on selection.** Selecting from the list, 3D scene or Issues while zoomed pans, without zooming, to centre an item that is not fully inside the view. Plan selections never pan.
- **Readability at zoom.** Room names, issue value labels and the lock icon are scaled by 1/zoom. Room, furniture, selection, baseline, door-zone, highlight and leader outlines use non-scaling strokes. Walls, window bars, door arcs/leaves and fills scale with the plan.
- **View state.** Plan zoom and focus are view state: they are not undo history, are not reset by Before/After and are not persisted. The plan keeps the whole-flat aspect and size while zoomed.
- **3D room framing.** A focused room's orbit target is the room centre at 0.6 m. Camera distance is the larger room side in metres x 1.6, clamped to 2-10 m, along the current viewing direction. The whole flat keeps the original pose and 6-22 m. Pan stays disabled and polar/azimuth limits are unchanged.
- **3D Reset View** reframes the current focus (room or whole flat) from the default direction, and its zoom buttons respect the current focus limits. The jump is instant with the existing damping flush. There are no wall cutaways.
- **Suggested set.** The twenty hand-placed items are now `SUGGESTED_FURNITURE` (stable IDs, grouped by room). They are fixed example placements prepared by the team, labelled as not computed recommendations and not a guarantee of fit. There is no solver or AI.
- **Empty start.** Load and Reset Demo start with no furniture, an empty baseline, no selection and the living room selected.
- **Suggestion skip rules,** applied per item in order:
  1. Skip if the item ID is already present.
  2. Otherwise, skip if the first warning involving it is a furniture, wall, door-swing, envelope or height warning (the same analysis library placement uses).
  3. Otherwise, skip if a distance lock involving it, whose endpoints all exist, would be violated.
  4. Otherwise add it.
- **Suggestion batches.** Existing furniture is never moved. A batch is one undo step, and a batch that adds nothing creates no history entry. A bilingual status line lists skipped items by name and reason, and is cleared by the next layout change.
- **Suggestion controls.** Furnish whole flat is disabled once all twenty are present. Suggest for the selected room stays available so its "already present" report remains visible. Both are disabled in Before.
- **Empty-room hint.** Empty rooms show a plan hint in After only. Lock endpoint pickers fall back to existing items, so an empty start cannot submit blank endpoints.

## Revision 2 Team Decisions

The fixing prompt supersedes Revision 1's single-room, sofa-only, fixed-centre, 0/90, fixed clear-gap and gated-After rules. Their code/tests/text are removed or migrated. This revision implements exactly the listed whole-flat editor features; subsequent changes require another judge/fix prompt.

- Whole flat, no corridor; five rooms with walls, door openings/swing zones and visual windows, including an entrance.
- Every item is movable/rotatable/resizable/replaceable; a preset library and manual numeric dimensions are retained.
- Pointer Events for 2D mouse/touch movement and numeric X/Z; 3D remains view-only for dragging with existing camera controls.
- Continuous default-zero [0, 360) rotation, circular side-panel dial and numeric entry; exact oblique footprint geometry.
- Multiple position locks and optional user-created minimum edge-distance locks; no wall-distance rule or forced clearance.
- Lock-breaking edits bounce to the last accepted state; geometric overlap remains an allowed, visible warning.
- Immediate Before/After in both views, current changes/ghosts/issues, new baseline action and no separate Check gate.
- Complete English / Traditional Chinese data/control/messages; no backend, deployment, scanning, accounts, paid runtime API, analytics or undo/redo.

## Assumed Flat And Architecture

The generated envelope is 660 x 640 cm with uniform 10 cm walls and 20 initial zero-degree items. The two bedrooms have equal assumed area; master/second distinguish use, not certified sizes. The default is warning-free, with no locks. All dimensions are in FLAT_DEMO_DATA and sanity-tested.

Concord 1 Option 1, 2B is a scenario reference only. Its typical full-floor PDF does not supply reliable individual-flat dimensions. No extraction, exact-reconstruction claim, embedding or redistribution is performed. Code/UI/README label assumptions in both languages and retain official links and measurement caution.

Door openings are true gaps in wall rectangles. A conservative width-square swing zone sits inside the swing room, with a quarter-turn arc/open leaf for illustration. It is not an exact sweep or regulation. Windows are visual panels/marks with sill height and do not cut collision walls; window clearance is explicitly not modelled.

## Coordinates And Numerical Choices

Domain units are cm, global origin front-left floor corner, X right, Z depth and Y up. Positive angle is clockwise in the X-right/Z-down plan; Three.js uses negative Y radians. The 360 input alias becomes 0. A 0.000001 cm epsilon applies to contact and lock comparisons, not physical uncertainty. Change detection also ignores micro-degree/numeric noise of that magnitude; ceiling comparisons remain direct.

SAT, containment-correct translation/penetration, convex clipping/area and exact convex edge distance are pure functions returning codes, IDs and numbers. No render approximation or language string decides acceptance. Width/depth <=1000 cm, height <=500 cm and ceiling 220-350 are retained. Numeric positions are allowed outside the envelope but restricted to +/-10000 cm to avoid extreme finite-number rendering overflow. All bounds reject rather than clamp; minimum distances accept any finite nonnegative decimal.

## Lock Policy

All default locks are empty. Position locks fix only the centre; rotation/size still pass optional distance locks. Several locks may involve the same item or pair. Zero minimum permits overlap with a separate geometry warning. Only locks reject complete item proposals; all simultaneous violations are displayed.

Bounce-back uses an immediate snap, allowed by the prompt, rather than animation or undo history. Every drag proposal checks locks, so rejected proposals never replace accepted state and release/cancel cannot leave a bad pose. Numeric/rotation/preset replacement uses the same function and resets fields on rejection.

New/edited distance locks must already be satisfiable; otherwise old locks/layout remain unchanged and required/current numbers are reported. There is no automatic movement to create clearance. Deleting an endpoint removes its related locks, including position locks, so constraints cannot reference missing items. Editing lock drafts separately from their saved required/actual readout avoids presenting a rejected minimum as applied.

## Library And Comparison

New library items default to zero and probe a bounded 20 cm grid, room centre and edge candidates for a clear initial position. This places only the new item, imposes no wall margin, never moves existing items and is not a layout solver. Failure reports no placement and adds nothing. Preset replacement keeps ID/centre/rotation/room; manual dimensions are also replacement inputs.

Baseline stores independent copies of furniture/name/position and ceiling, not historical locks. Before is read-only; After is immediately editable. Setting baseline may include geometry warnings but is blocked by incomplete numeric drafts. Camera is unchanged by comparing/re-baselining. Switching views discards incomplete drafts without mutating accepted poses. Reset restores the original snapshots, locks/counters/transient forms and camera, keeping language.

Changed markers are value-derived: moved, rotated, resized, added, removed, plus replaced when preset kind/name changes. Manual dimension-only replacement is marked resized because no product identity exists. After draws all baseline footprint outlines; removed items remain marked in the list. Item room membership follows a real centre move into another room, not an unrelated room-picker choice.

Stable item IDs accompany names in the list and lock endpoint options so several identical library presets remain distinguishable in either language.

## Rendering And Existing Conventions

Existing header, bilingual toggle, reset actions, palette/font conventions and sofa composition are preserved. Walls are translucent full-height boxes so all five rooms remain inspectable; collision geometry stays opaque mathematically. Colliding models are translucent red so exact floor regions can be seen. Numeric labels sit below camera-toolbar stacking and use no postprocessing/shadows. The 3D scene is client-only with demand rendering and capped pixel ratio; camera reset still flushes damping.

No dependency upgrade was needed. Existing stable Next/React/R3F/Drei/Three/npm pins remain. ESLint 9 stays compatible with the pinned Next plugins despite its support-status warning; no peer bypass is used. The upstream Clock deprecation is not suppressed. No project licence or deployment config is added.

## Decisions Needing Team Review

- Generated dimensions/equal-sized bedrooms and conservative square door swings rather than exact arcs.
- Translucent walls/models as illustrative visibility aids, without changing physical collision geometry.
- Read-only Before; satisfiable-on-create locks; deletion cleans related locks; snap rather than a 200 ms animation.
- Bounded 20 cm initial-placement probing may miss a tight feasible spot; failure is not proof of impossibility.
- +/-10000 cm position input bound, 360 alias, incomplete-draft discard on comparison, and dimension-only replacement marker policy.
- Revision 3: the suggestion lock-skip rule is defensive. Under the pairwise lock model, adding an item cannot break an existing lock: deletion removes related locks, and history snapshots are consistent. The automated case therefore uses a constructed lock that references not-yet-placed items.
- Revision 3: non-scaling outlines are slightly thicker than before at whole-flat zoom on small screens. Double-tap thresholds (350 ms / 24 px), wheel sensitivity and the idle leftover finger after a pinch are untested on physical devices.
- Revision 3: the suggestion status clears on the next layout change, and Suggest for room is never disabled while editable.

- Revision 4: six suggested items were turned (180 or 90 degrees, footprints unchanged) so their models face into the room. The alternative was a per-kind facing exception, which would make the same angle mean different things for different kinds.
- Revision 4: the vanity uses the kit's drawer-and-basin unit rather than `bathroomSink`/`bathroomCabinet`, and the 40 x 40 cm side table stretches a narrow console-style `sideTable`. Strongly non-uniform stretching (for example the 180 cm sofa from a 98 x 41 cm model) changes the model's proportions by design.
- Revision 4: unlit kit materials are converted to lit ones for shading, and the Models / Boxes choice resets to Models after Reset Demo.

- Revision 4: the AI job ID is fal's request ID; rate limits are per instance, in memory, sliding windows, count only accepted photos, and trust `X-Forwarded-For`; status and file routes are not rate-limited.
- Revision 4: looks also record their item kind so a reused item ID of another kind never inherits a look; a re-added suggested item with the same ID and kind does show its earlier look.
- Revision 4: the fal upload and result are requested with a one-hour expiry; whether fal honours this for TRELLIS outputs is not verified.
- Revision 4: a new look's starting quarter turn is chosen from its shape (from one TRELLIS sample that faced +X); it may face backwards for other photos.
- Revision 4: Turn 90 degrees is clockwise; Cancel stops waiting but cannot stop a fal job already running; the look panel is visible but disabled in Before.

These are recorded smallest-scope choices for the team's next judgement, not blockers or newly advertised capabilities.