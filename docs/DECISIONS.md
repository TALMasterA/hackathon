# Decisions

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

These are recorded smallest-scope choices for the team's next judgement, not blockers or newly advertised capabilities.