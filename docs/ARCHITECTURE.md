# Architecture (Revision 4, milestone 3)

## Module Boundaries

| Area | Responsibility |
| --- | --- |
| Domain | Localised names, flat/room (with kind)/wall/door/window/item contracts, the traced-flat record, snapshots, lock and warning unions |
| Data | Generated five-room assumptions, twenty suggested placements, fourteen templates, official links |
| Geometry input/edit | Shared strict decimal parser, draft validation, pose-preserving dimension replacement |
| Oriented geometry | Rotated corners, SAT, penetration/translation, convex clipping/area, convex distance, plan/3D transforms |
| Architecture geometry | Door-gap wall segments, conservative swing rectangles, room membership, flat voids (the parts of the bounding box outside every room and wall) |
| Layout analysis | All furniture/wall/door/envelope/outside/height warnings with IDs and unrounded values |
| Lock geometry | Validated minimums and all applicable lock violations; accept or return last accepted item |
| Flat-editor state/layout | One reducer holding the flat, with undo/redo history, numeric drafts, baseline copies, bounded new-item placement, suggestion fit checks (fixed demo set, or per-room-kind sets with a wall-first probe) and changed-item detection; Flat menu |
| Plan/dial | Pointer capture, touch-friendly hit selection, zoom/pan/pinch view box and room fit, SVG view conversion, numeric and circular rotation controls |
| 3D | Client-only dimensions, generated furniture/architecture, floor polygons, ghost outlines, labels and room-focused camera framing |
| i18n | Typed core/editor dictionaries and UI-only formatting of stable codes/numbers |
| 3D looks | `useLooks` map of item ID to look outside the reducer, look panel, photo resize/hash, streaming job client, GLB parsing and preview canvas |
| AI look server | `POST /api/model3d`: photo validation, in-memory rate limits, fal upload/submit, status mapping and server-side GLB download, streamed back as NDJSON |
| Floor-plan analysis | `lib/floorplan/`, pure: pen widths, scale-tick snapping, dominant angle, wall-face snapping, opening measurement, frames between PDF points, crop pixels and centimetres, scale-bar and flat-type labels |
| Flat building | `lib/floorplan/`, pure: trace model, walls from rooms, door/window attachment, validation, naming, normalisation, flat files |
| Trace screen | `features/floor-trace/`: pdf.js or picture source, steps (picture, scale, flat box, AI or hand, review, check), its own reducer and undo history, analysis glue and the AI client |
| AI plan server | `POST /api/floorplan`: picture validation, its own rate limits, fal upload and vision request, reply parsing with one repair; with the AI look route, the only code that reads `FAL_KEY` |

The App Router page retains a thin client entry. The only server code is the `/api/model3d` route for the optional AI look and the `/api/floorplan` route for the optional AI plan reading; there is no server action, database or calculation backend, and no layout data reaches the server. Geometry imports no React, Three.js or translations.

## Single Source Of Truth

The reducer owns the flat, current furniture and ceiling, an independent baseline snapshot, selected item/room, focus IDs, language, numeric drafts/errors, position/distance locks, library/lock notices and ID counters. Panel-local state is limited to unsubmitted lock/library choices; it is not a second furniture layout.

1. Initial current/baseline snapshots are both empty (architecture only). Suggestions append fixed example items without moving existing ones. The editable view defaults to After and has no locks.
2. Complete draft edits and pointer/dial proposals call the same lock acceptance function. Geometry warnings do not reject a proposal.
3. An accepted edit updates the current item immediately. A rejected edit returns the previous accepted item and resets its displayed draft, with every applicable lock violation.
4. Dragging proposes continuously. Position locks prevent drag start; distance failure keeps the last accepted pose, including at pointer release/cancel.
5. Incomplete numeric text stays a draft; its last complete pose remains displayed with field errors. Comparison switching discards incomplete drafts without changing accepted geometry.
6. Before chooses the baseline snapshot in both views and is read-only. After chooses current. Neither action remounts the camera.
7. Re-baseline deep-copies the current accepted numeric layout, including ceiling. Geometric warnings are permitted; incomplete drafts block this action. Current locks remain current, not historical snapshot data.
8. Deletion removes an item and its related position/distance locks. Reset restores the empty current/baseline data, empty locks and transient controls, retaining language and remounting the camera/plan; it is itself an undoable step.
9. A wrapper around the reducer records document snapshots (current, baseline, locks, ID counters) in a 100-entry undo stack. Plan and dial drags are bracketed by gesture start/end actions so that each is one entry, and field typing coalesces by item and field. Unchanged documents never create entries.

Switching the flat (`use-flat`) is handled before history: it starts a fresh document on the new flat, with no furniture, baseline, locks or undo history, and keeps the language. Reset keeps the current flat.

Plan zoom/pan and the shared room focus are view state held outside the reducer. Each room-focus request carries a sequence number; it fits the plan's view box and drives a 3D "focus" camera command, even for the already-focused room; free plan zoom stays local to the plan.

## Geometry And Locks

All item footprints are oriented rectangles. Positive degrees rotate local X/Z clockwise in the plan; the same points are obtained by negative Three.js Y rotation. All stored proposals are normalised to [0, 360), with 360 accepted as an input alias for zero.

SAT projects both polygons onto every edge normal. Edge/corner contact within 0.000001 cm is not collision. Minimum separating translation includes containment, rather than using just the projection intersection width. Sutherland-Hodgman clips the convex polygons for the true floor overlap region/area. Minimum edge distance is zero for contact/overlap; otherwise it is the minimum vertex-to-segment distance. Polygons produced by the kernel have consistent winding.

Wall segments are axis-aligned rectangles (10 cm on the demo flat, measured thicknesses on a traced flat) with doors removed as actual gaps. Door swings are conservative width-square rectangles inside their configured room. Window marks have positions/widths/sills but do not cut collision rectangles or impose clearance rules. Envelope overflow is measured per side and clipped for floor highlighting; furniture overlapping a void of an L-shaped flat is reported as outside; height excess uses the shared ceiling.

Every relevant warning is retained. Furniture pairs are reported once; wall-segment warnings retain parent wall IDs. No warning is converted to a guarantee or an edit barrier. The pure lock function alone rejects complete edits and returns all position/distance failures. A minimum-zero distance lock permits overlap. New/edited locks must be satisfiable immediately; no item is moved to satisfy one.

## Plan And Rotation Flow

The SVG plan uses the same corner/architecture helpers as validation. Client pointer coordinates are converted through its aspect-preserving viewBox, including letterboxing. The initial grab offset is preserved. Pointer capture follows mouse/touch release outside the item; `touch-action: none` prevents page scroll during the plan/dial gesture. An expanded hit radius makes small footprints selectable; keyboard selection and numeric fields remain available.

The dial maps pointer angle about its centre, supplies slider semantics and arrow-key rotation, and offers reset to zero. Position fields are disabled for a position-locked item; angle/dimensions stay enabled and still pass distance-lock checks.

## Rendering Flow

The client viewport dynamically loads R3F Canvas with SSR disabled. Both renderers consume the displayed snapshot and the same issue list. Three.js converts cm to metres and shifts the envelope centre for framing. Boxes use half-height offsets, so their bases are Y = 0; the composed sofa retains exact overall bounds.

All rooms, physical-height wall segments, open door leaves and visual windows are generated locally. Furniture uses bundled low-poly Kenney models (CC0) mapped by kind; `fitObjectToBox` turns each model half a turn (glTF fronts face +Z, FitIn fronts face local -Z) and stretches it non-uniformly to exactly the item's box, so the model is appearance only. Selected/focused models also draw the exact box outline. Boxes mode, loading, load failure or a missing mapping draws the generated box/sofa. Walls are translucent for inspection but retain their full collision geometry. Colliding furniture is translucent red so highlighted floor intersections remain visible through it. Convex regions are triangulated with tested upward winding just above the floor; labels show numeric cm values. Both involved furniture items receive selection/focus outlines after issue selection.

After additionally draws faint baseline footprint outlines, including removed baseline items. Added/current items and change markers are derived from snapshot values, not mutable flags. Changing Before/After or baseline preserves camera state. Reset View clears damping and reframes the current room focus, or the shared initial whole-flat pose; orbit/elevation limits are retained, and distance limits follow the focus (6-22 m whole flat, 2-10 m for a room). The whole-flat pose and limits scale with the flat's size against the 660 cm demo (0.6-2x), so the demo pose is unchanged.

Rendering is demand-driven, caps pixel ratio at 1.5, uses one directional plus ambient light, and has no shadows, textures or postprocessing. An item with a 3D look renders the look through the same `fitObjectToBox` path, turned by the facing rule and its quarter turns, with the same collision tint and box outline; a failing look falls back to the kind model. Model files are preloaded once, cloned per item (sharing geometry) and given shared lit copies of their unlit materials; collision tints clone materials per item and never mutate the cache. A scene error boundary leaves the plan/numeric editor available. Unsupported-device fallback still needs physical-device verification.

## Translation And Privacy

Core and editor English keys define typed key unions; Traditional Chinese dictionaries must cover identical keys and placeholders. Furniture/room/wall/door/window names are language-indexed data. Geometry carries IDs/codes/numbers only; UI formatting translates names and numeric messages without changing decisions. Language updates document title/lang and every new control.

Inputs and calculations remain transient browser state. There are two optional uploads, each after a bilingual consent. A photo for an AI look is resized on the device, posted to `/api/model3d`, forwarded to fal.ai storage and TRELLIS with a one-hour expiry requested, and the finished GLB is fetched server-side and streamed back. A cropped plan of the user's flat for AI reading (at most 1536 px) is posted to `/api/floorplan`, forwarded to fal.ai storage and the vision model, and only the parsed room reading comes back. fal URLs and the key never reach the browser. A floor-plan PDF or picture is otherwise read only in the browser, and its scale and wall positions are measured there. Looks, the session model cache and jobs live only in browser memory; nothing is persisted and there are no accounts or analytics. Next only serves static application code/assets. Optional official-reference links leave the app when selected; no PDF is embedded, bundled or downloaded by the app. A flat file the user downloads holds geometry and names only.

## Why Separation Matters

Validation and lock acceptance cannot depend on camera framing, model colour, WebGL support or React timing, and a traced flat's measurements cannot depend on the AI: the AI's boxes are only starting points for the same snapping a hand trace uses. Pure geometry/state tests exercise the numerical claims; 3D illustrates, rather than approves, the same data. Browser verification is a bounded smoke check, not a substitute for the team's judge/fix loop or real-flat measurements.