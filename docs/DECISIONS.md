# Decisions

## Design Assistant / 設計協作助手 (2026-10-03)

Built from `hackathon-4-designer-feedback-prompt.md` and its approved plan. Smallest reasonable choices where the brief left room; flagged for team review.

- **Placement.** A fourth inspector tab plus a toolbar button that opens it (the tabs become four columns, two by two under 360 px). No new screen or route.
- **Modes.** Interpretation is a fixed rule list (EN / 繁中 including Cantonese); generation is a deterministic bounded search. The UI and docs say "rule-based", "heuristic" and "not AI". The existing fal.ai routes are not used and nothing is sent.
- **Goals offered.** Only measurable ones: change little, keep an area open, two items closer, two items apart. "More walking space" for the whole room is reported as not measured, with a hint to choose an area, because no route or clearance model exists.
- **Areas.** Two kinds only: a door's approach on the room's side (door width × depth) and the space in front of an item's front face (item width × depth, moving with the item; area outside the room counts as blocked so turning an item to a wall cannot "clear" it). Depths 60 / 90 / 120 cm are the user's choice and labelled as not a standard; text that names an area uses 90 cm and says so.
- **Avoided spots and directions are filters, not costs**, and apply only to moved items (an item left at its original place is never pushed away by them). Radius: half the item's longer side, kept within 30–60 cm; direction tolerance 10°.
- **Repeats.** Arrangements within 15 cm and 10° per item count as the same, so a grid step or two of jitter is not "new". Every shown proposal is avoided, not only rejected ones.
- **"Too many changes"** sets a limit of the previous proposal's changed count minus one (at least one); a limit only ever tightens.
- **"Keep this item here"** was added as a reason chip with an explicit choice between the original place and the proposal's place, because "keep it here" is ambiguous. The proposal's place is a hard pin for later rounds; it is not carried over a restart.
- **Thresholds and ranking.** Area: improved by 0.05 m² or 25% (whichever is less, at least 0.01 m²), clear at 0.005 m². Pair: 10 cm, closer met at 1 cm. Ranking: goals improved, then gain minus the size of the change (×3 under "change little"), then a signature. These are internal and are not presented as design standards.
- **Search size.** Grid step = shorter room side / 16 within 10–25 cm, at most 600 positions per direction, four quarter turns, singles plus limited two-item combinations, 8 s deadline, 12 ms slices with a yield (no worker). About 0.5–0.8 s for the demo living room in Node.
- **Room membership.** An item whose stored room and centre disagree is excluded from moving and listed as unclear; moved items must stay inside the room polygon and keep their room id.
- **One undo step.** Applying uses a new `apply-layout` editor action that changes only position and orientation, refuses another layout revision and any lock violation, and is one history entry; undo reuses the editor's undo, allowed from the assistant only when nothing changed after applying.
- **Revision.** `layoutRevision` hashes the flat id, ceiling, every item's id, kind, size and pose (0.01 cm) and all locks, so any edit, lock change, reset or plan switch makes a session stale.
- **Editing during a preview** is paused (plan drag, fields, library, locks, ceiling, Set baseline, toolbar and keyboard undo/redo) instead of isolating edits on the draft.
- **Process.** The brief asked for no commit; the team's session instruction asked for a commit on a new branch `designer-feedback` and a push of that branch. That was done; main was not touched and nothing was deployed. The brief itself was added to the repository root like the earlier prompts.

## Read My Floor Plan: Rooms of Any Shape, Dragged Doors and Windows (2026-10-04)

The team found the AI reading too weak to rely on, so tracing by hand had to do the work, and it only allowed boxes. They asked for rooms drawn by joining lines, at any angle (team choice over horizontal and vertical only), doors placed by dragging along the wall with a choice of hinge and opening side, and windows sized by the drag instead of a fixed width.

- **A room is its corners.** `TraceRoom` holds `points` (clockwise on screen) and one `edges[i]` record per edge, instead of a box with four sides. A box room is four corners from the top-left, so the AI reading, **Box room** and every earlier rule still produce exactly the same rooms.
- **Draw room.** Each tap places a corner on the 0.5 cm grid faces already used. A line within 7° of a 45° step is turned onto it (Alt draws freely), and a straight line's end lines up with a nearby corner of the same room. Tapping the first corner, double-tapping or Enter closes the room; Backspace or the panel removes the last corner; Esc cancels. Corners do not snap to other rooms: rooms are traced on the inner faces, so neighbours sit a wall apart, and touching would mean no wall.
- **Snapping keeps to straight edges.** On finishing, each horizontal and vertical edge of a drawn room is matched to the drawn wall with the same `snapEdge` probe as box edges, and the corners are rebuilt as crossings of neighbouring edge lines, so an angled edge keeps its angle while its ends slide. Angled edges are not matched (the drawing analysis reads horizontal and vertical lines) and count as placed by the user.
- **Editing.** Square handles move an edge parallel to itself (re-snapped when straight). Round handles move a corner by moving its two edges parallel to themselves, so right and 45° angles survive; Alt moves the corner alone. Double-tapping an edge inside the selected room adds a corner; Delete or Remove corner takes one away. A shape whose edges would cross is refused with a notice.
- **Walls at any angle.** Wall generation runs per direction family (edges within 0.5° count as parallel) in that family's along/across frame. Horizontal and vertical walls come out exactly as before (the demo flat's eight walls are still reproduced). Outer corners are closed by extending a wall whose room-side face ends on another outer wall's room-side face along its centre line to that wall's outside face: at 90° this is the old corner square, at other angles the pieces overlap slightly.
- **Doors from a drag.** **Add door** is dragged along a room edge from one jamb to the other: the drag sets the width, and the hinge goes where the drag began. **Flip hinge** swaps the ends and **Opens into** picks the room the leaf opens into, or outside for an entrance. Every traced door now carries an explicit hinge (on the opening side's wall face), closing direction and opening direction, which `doorGeometry`, the plan and 3D already used for Harmony. A tap still takes the opening measured from the drawing; with nothing drawn there it asks for a drag. The silent 80 cm door and 120 cm window defaults are gone from tapping (an AI door with no drawn opening is still flagged for checking).
- **Windows from a drag**, the same way, on any outer edge including angled ones. End handles resize a selected door or window along its wall and its middle slides it.
- **The flat's outline.** When any room is not a box or any wall runs at an angle, the built flat gets `outline`: the union of its rooms, walls and the strips across open joins (`polygon-clipping`, MIT, the one new dependency). Furniture crossing it is reported as partly outside, as on Harmony. All-box traces get no outline and keep the bounding-box void check with its measured numbers. Shaped rooms get `FlatRoom.outline` with their bounding rectangle as position and size.
- **Harmony's look is keyed on its source, not its outline.** Now that traced flats can have outlines, the orthographic camera, hidden room floors, dashed areas, darker walls, "~" size and disabled Download follow `flat.source`. A traced flat keeps the editor's camera and coloured room floors, and gets Harmony's geometry: wall panels cut at door and window openings, the polygon floor and the outline check.
- **Suggestions in shaped rooms** walk the room's own edges (box rooms keep their top, bottom, left, right order), back each item onto an edge facing the edge's inward side, and skip spots outside the room's shape. The TV console prefers the edge facing the sofa; the largest bedroom is chosen by area.
- **Validation.** New error `room-shape` for a room whose edges cross. Overlap is the area two rooms share divided by its length (a mean thickness), so rooms touching along a snapped face (0.5 cm grid) are not flagged, as before. Narrow is under 40 cm across or under a 40 cm square of floor. Touching for reachability is facing edges under 5 cm apart, at any angle.
- **Flat file version 2** adds room and flat outlines (simple polygons, a room's matching its rectangle), angled walls, openings checked along the wall's own line, and door hinge, closing and opening directions. Version 1 files still open; files are written as version 2.

## Merging The Harmony Preset With Read My Floor Plan (2026-10-04)

The two sections below were built in parallel from the same base: the selectable demo/Harmony plans (2026-10-03) and Read my floor plan (2026-10-04). Both are kept. The team chose to keep the per-plan sessions and to open on Harmony.

- **Three plans in one picker.** **Flat plan** lists Current demo, Harmony 1 Option 4 and, once there is one, the user's own flat under its name. Each keeps its own document and history across switching (the 2026-10-03 behaviour). The Flat menu keeps Read my floor plan…, Open flat file… and Download this flat; its Demo flat button went, since the picker does that.
- **The own flat is one slot.** A trace or an opened file replaces the own flat as a fresh document (the `use-flat` rule below), asking first only when that flat has furniture, a baseline or history; the built-in plans are never touched. Replacing it clears only the own flat's AI looks, since looks are keyed by plan plus item ID.
- **`EditorState.flat` is the flat.** Each session carries its flat rather than a scenario id, so all three kinds share one reducer. The first room is selected by `defaultRoomId` (first living room, else first room), which gives "living" on the demo and "central" on Harmony, so the scenario list no longer stores it.
- **Outline beats voids.** A flat with a traced `outline` (Harmony) is checked against that polygon only; `flatVoids` returns nothing for it. The bounding-box voids would otherwise flag Harmony's 45-degree bay as outside and double-report its notch.
- **Fixed examples by id and source.** The demo and Harmony offer the team's fixed placements; any other flat gets per-room-kind suggestions. A flat counts as built-in only when both its id and `dimensionSource` match, so a traced flat reusing a built-in id is still treated as traced.
- **No download on Harmony.** A flat file holds straight-walled flats with no outline (version 1), so Download this flat is disabled there; Harmony is built in anyway.
- **3D.** Outline flats use the orthographic camera; every other flat uses the perspective camera scaled by its size.

## Revision 4 Milestone 3: Read My Floor Plan (2026-10-04)

Milestone 3 of `hackathon-4-fixing-prompt.md` asked for a hand trace of a floor-plan picture. The team then asked, in the implementation session, for something stricter: a user who uploads a Housing Authority standard-block plan (the reference was Harmony 1, `02-Harmony1.pdf`) should get a rather accurately dimensioned 3D model of their own flat, with an AI vision model through fal.ai reading the plan (team choice), a flat file to save and open, and per-room-kind suggestions; the committed presets picker was dropped. The demo flat is unchanged.

### What this supersedes in the milestone 3 spec

- **AI detection is added.** The spec's "no floor-plan auto-detection by AI" is replaced by an optional AI reading of the rooms. The AI never measures: see the core rule below. Tracing by hand still works without any AI or key.
- **The picture can leave the device, only on consent.** The spec's "the image never leaves the device" still holds for tracing by hand. For AI reading, only the cropped picture of the user's own flat is sent, after a bilingual consent screen that shows that exact picture.
- **Known-area calibration is replaced** by an optional internal floor area from tenancy papers, used only as a cross-check: a warning when the traced internal area (rooms plus internal partitions) is more than 5% off. Scaling a whole flat from its area would hide errors in one direction behind errors in the other, and Housing Authority plans always have a scale bar.
- **No committed presets picker.** The Flat menu offers Demo flat, Read my floor plan…, Open flat file… and Download this flat. No traced flat is committed under `src/data/flats/`. (Since the merge above, the **Flat plan** picker carries the team's two built-in plans and the user's own flat; traced flats are still never committed.)
- **Every PDF page.** Housing Authority PDFs hold up to ten options, so the Picture step has a page picker instead of rendering page 1.
- **Rendering.** Instead of one render at 3x capped at 6000 px, the overview is rendered at up to 15 MP (the iOS canvas limit), and the user's flat is re-rendered from the PDF's vectors at about 0.5 cm per pixel (at most 4096 px a side and 16 MP). The PDF's coordinates are quantised to 0.12 pt (about 0.86 cm), so finer analysis gains nothing.
- **Snapping to the drawing, not a 5 cm grid.** Room faces snap to the drawn wall lines and are kept on a 0.5 cm grid, so every generated wall centre is an exact multiple of 0.25 cm. A 5 cm grid would add up to 2.5 cm of error per face.
- **Wall thickness is measured, not a 10 cm default.** An internal wall is the gap between the facing rooms' faces; an outer wall takes the thickness measured from its drawn line pair, else the median measured thickness, else 20 cm.
- **Opening a wall, not removing a generated wall.** In the review step the user opens the wall between two rooms (an open plan, or an L-shaped room as two rectangles; since the shaped-rooms change above, an L can also be drawn as one room); generated walls are not edited directly.
- **Doors and windows from the drawing.** A tapped door or window takes the width of the drawn opening and the swing side from the drawn leaf and arc; 80 cm is only the fallback, flagged for checking, and widths are editable 50-200 cm (doors) and 20-1000 cm (windows). Window sill and height come from the room kind, following the demo flat (living and bedroom 100/90 cm, kitchen 110/85, bathroom 140/60).
- **Suggestions.** "Double bed in the first bedroom" became "double bed in the largest bedroom". Traced-flat suggestions use a wall-first probe of their own (below) rather than `placeLibraryItem`.
- **Source panel** also says who read the rooms (AI with its model, or the user) and how many edges were not matched to a drawn wall.

### The core rule: the AI never decides a measurement

- **Scale** comes from the plan's own scale bar. On a PDF, the scale bar is found from the text layer (`2 0 2 4 6 8 m`), and markers are placed on the 0 and 8 m ticks; every tap snaps to a tick's line centre, weighted by darkness, to a fraction of a pixel. Harmony 1 measures about 1:202, not 1:200, so a nominal scale is never assumed. A known length is the fallback for other plans.
- **The AI supplies meaning and a rough layout only:** room boxes and kinds, rough door positions with which rooms they join, which door is the entrance, and windows.
- **Every edge is snapped to the drawn walls** by deterministic image analysis (below). Edges the drawing does not confirm are drawn dashed and counted; before **Use this flat** the user must tick "I have checked the dashed edges against the plan."
- **Without the AI** (switched off, failed, or declined) the same review step is a manual trace.

### Drawing analysis (`src/lib/floorplan/`, pure functions on greyscale pixels)

- **Pens.** Housing Authority plans use three pens: thin 0.36 pt (fixtures and glazing), medium 0.72 pt (partitions, about 7 cm thick walls) and heavy 1.44 pt (structural walls, 20-30 cm). The pen widths are measured from a histogram of dark-run lengths, not assumed.
- **Faces sit at line centres.** A wall is drawn as two outline lines; its face is the centre of the line on the room side, not the edge of the dark band. Using the band edge would make each room about 10 cm too small.
- **Snapping an edge.** Ink profiles are taken across the edge's middle 70%, within a search radius of 25-80 cm. Line candidates are wall-pen pairs, groups of glazing lines (window walls) and solid bands, scored on coverage along the edge, pairing, pen, clear floor inside and distance. An edge is **verified** only when its band covers at least half the edge, it is paired and it beats the next candidate by a clear margin; otherwise it stays where it was placed, **unverified**. A second pass and consistency rules follow: open pairs share a face, a face derived from the other side of a wall must itself be drawn along at least 30% of the edge, collinear neighbours adopt a verified face, and faces within 2 cm are merged.
- **Openings.** A wall is present where the drawn stroke thickness on both faces is at least 1.4 thin pens. An opening's width runs from jamb centre to jamb centre, found across the whole band. For wide openings, or when fewer than two jambs are drawn, the door leaf is measured instead (Housing Authority entrances are 160 cm openings holding a 90 cm leaf and a fixed panel). The swing side is the side with more ink (leaf and arc). An opening with glazing and no leaf is a window; breaks between glazing lines inside a window wall are that window, not doors.
- **Text is masked.** The PDF's text boxes are whited out before analysis so letters are not read as wall stubs, and the flat type (1P/1B/2B/3B) is read from the single label inside the user's box.
- **Rotation.** A flat drawn at an angle (Harmony has 45-degree wings) is straightened as a whole from the dominant line angle. Angled walls are not modelled.

### Walls, openings and validation (pure, unit-tested)

- **`wallsFromRooms`.** Facing edges 0-35 cm apart (with more than 1 cm overlap) make an internal wall centred in the gap, as thick as the gap; a gap under 5 cm, or an opened pair, is an opening with no wall. Leftover edges become outer walls. Collinear pieces of the same thickness join across gaps of up to 35 cm, outer walls extend to the far face at corners, and pieces under 5 cm are dropped. The demo flat's eight walls are reproduced exactly from its rooms (regression test).
- **Doors** attach to the wall whose centre line is within half its thickness plus 10 cm, clamped to fit; `connects` lists the rooms on both sides or "outside"; a door wider than 200 cm is an error.
- **Errors** (block Use): no rooms, overlapping rooms, a room narrower than 40 cm, a flat over 30 m, a door off every wall or too wide, not exactly one entrance on an outer wall, or a built flat that fails the strict flat-file check. **Warnings** (do not block): a room unreachable from the entrance through doors or open walls, unmatched edges, bedroom count against the flat type, internal area more than 5% off the tenancy figure, a window off every wall.
- **Build.** The flat is normalised so its walls start at x = z = 0, ids are deterministic, `dimensionSource` is `"user-traced"` and `trace` records the source file name, scale method, cm per unit, reader, model and unchecked-edge count. The built flat must pass the same strict validator as an opened flat file.

### AI reading

- **Endpoint.** fal's `openrouter/router/vision` with the existing `FAL_KEY`, reached only from `POST /api/floorplan`. The default model is `google/gemini-2.5-flash` at temperature 0 with reasoning off; `FLOORPLAN_MODEL` changes it. `google/gemini-2.5-pro` refuses to run without reasoning, so `FLOORPLAN_REASONING=true` exists for such models; on Harmony 1 it read the rooms worse than flash, so flash stays the default.
- **Picture.** The crop is downscaled on the device to at most 1536 px with the padding outside the user's box dimmed, and shown on the consent screen. Coordinates in the reply are 0-1000, y first, as Gemini models are trained to give them.
- **Prompt.** The model is told to box clear floor inside the inner wall faces, to split non-rectangular rooms into rectangles joined by `open_to`, to leave out corridors, lift lobbies, pipe ducts and bay-window recesses, and to infer kinds from fixtures (Housing Authority plans have no room labels). The flat type from the label is passed as a soft hint only: a firm bedroom count made flash call a kitchen and a bathroom bedrooms.
- **Parsing.** Code fences and prose around the JSON are tolerated, then a hand-written validator checks it (the repo has no schema library). Rooms are strict; invalid doors and windows are dropped and counted. An unusable reply gets one repair request quoting up to 10 problems; a second unusable reply is "unreadable".
- **Placement.** AI rooms are snapped like hand-drawn ones. AI doors are matched to openings found in the drawing by global nearest distance (within 120 cm, using the AI's "outside" hint for the entrance), and matched doors are placed first. An unmatched AI door is kept only where it fits a room face, flagged; other drawn openings are added only if they join two rooms and show a swing or two jambs. Windows come from the drawing, falling back to the AI's.
- **Route.** `POST /api/floorplan?type=2B` checks, in order: enabled (`FLOORPLAN_ENABLED === "true"` and `FAL_KEY`), its own in-memory rate limiter (10 per IP per 10 minutes, 100 per instance per day, counting accepted requests only), body size, then exactly one PNG/JPEG/WebP entry of at most 4 MB through the AI look's `validatePhotoForm` (the flat type travels in the query because the form must have exactly one entry). It times out after 100 s. Responses: 503 disabled, 429 rate-limited, 400/413/415 invalid, 502 upstream or unreadable, 504 timeout; no fal URL, upstream detail or key is returned. The client waits up to 120 s and can cancel.

### Editor changes

- **The flat is editor state.** `use-flat` is handled before history: it starts a fresh document (no furniture, baseline, locks or undo history), keeps the language, selects the first living room and bumps the camera revision. Reset Demo keeps the current flat. A flat switch also clears AI looks, because item ids restart (since the merge, only the replaced own flat's looks).
- **L-shaped flats.** The envelope check uses the bounding box, so `flatVoids` (the box minus rooms, walls and the strips between facing rooms) adds an `outside` issue for furniture in a notch, hatched on the plan and tinted in 3D. The demo flat has no voids, so its behaviour is unchanged, and Harmony's outline replaces voids (see the merge above).
- **Camera.** The whole-flat pose and distance limits are scaled by the flat's size against 660 cm (clamped 0.6-2), so the demo pose is exactly as before.
- **Suggestions on traced flats.** Living: sofa, coffee table, TV console, dining table, 2 chairs; bedroom: bed (double only in the largest bedroom), wardrobe, desk; kitchen: counter, fridge; bathroom: toilet, vanity; a flat with no bedroom adds a single bed to the living room. Wall-backed items (sofa, TV console, bed, wardrobe, desk, counter, fridge, toilet, vanity) try the room's walls longest first (the TV console tries the wall facing the sofa first), middle first along each wall, backed against it and turned to face into the room; the first position with no issue is kept. Other items use the existing probe. Ids are `${roomId}-${templateId}`, so a re-run reports them as present. Labelled "rough starting positions; drag to adjust".
- **Flat files.** `{ format: "fitin-flat", version: 1, flat }` (now version 2, see the top section), at most 1 MB, never the picture. Opening checks every id, number, wall (axis-aligned, start before end, at most 80 cm thick), door and window reference and fit, `connects` value, and that rooms lie inside a flat of at most 30 m; any failure rejects the whole file.
- **Trace history.** The trace screen has its own undo/redo (100 steps), separate from the editor's; the editor's shortcuts are ignored while it is open.
- **PDF support.** pdf.js 6.3.289 runs its worker from `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` and is loaded only with the trace screen. It worked in Next 16 dev and build, so the "screenshot instead" fallback was not needed.

### Known limits

- **Axis-aligned walls only** in a traced flat at the time (superseded by the shaped-rooms section at the top: rooms and walls may now run at any angle, though only straight edges snap to the drawing). A whole flat at an angle is straightened, but a partly diagonal room (some 1P units beside Harmony's 45-degree core) must be approximated by rectangles. Real angled walls would need changes to wall pieces, door geometry and the 3D wall boxes.
- **A typical floor.** The plan shows a typical floor; individual flats, plaster and tiles vary, so the Source panel asks users to tape-measure one room before buying.
- **The AI's reading** of Harmony 1 was incomplete: it found the kitchen and bathroom correctly but missed one bedroom and called part of the L-shaped living room a bedroom. The review step is where the user fixes this; it is not hidden.

## Selectable Demo And Harmony Plans (2026-10-03)

- Latest user scope retains the current five-room demo and its exact twenty example placements. Harmony 1 Option 4 is a second selectable demonstration, initially selected; it is not a replacement. Both use the shared editor/library/lock/history behavior.
- Canonical Harmony source: user-supplied isolated SVG, raw PDF paths and starter envelope from `02-Harmony1.pdf`, page 4. Metres are converted to centimetres at preset construction. Plan X is right/Z down; Three.js uses centred X/Z in metres, Y vertical, and negative Y rotation for clockwise plan angles. Both renderers consume identical segment/opening IDs.
- Envelope: approximately 1011.43 x 760 cm, 60.65 square metres including wall envelope, not net/saleable area or surveyed dimensions. Isolation envelope is not an exact interior-floor polygon. Wall widths are approximate visual outline estimates, not PDF stroke-width measurements; the oblique window-host thickness is a demo estimate.
- Bounded overlay comparison used source paths 467-471, 479-489, 492, 500-506 and 639-644: corrected the starter's southwest divider to a short pier, retained open east partition passages, added service horizontal partitions/door hosts and top/window bands. Five approximate door symbols and five window bands are represented, not claimed to be a complete inventory. Bay-wall closure, service/vent details and further window mapping remain unresolved; missing mapping is not zero windows. The clipped isolated reference is linked in the source disclosure.
- Six neutral approximate editing zones aid navigation/library/example actions; they are not verified rooms or inferred bedrooms from the 3B text. Harmony's twelve example placements are separate team-prepared furniture positions, not extracted from the source. Both whole-flat and area example actions work with the original skip rules and never reposition existing furniture.
- Canonical outline uses Three.js polygon triangulation, including full-footprint overlap-area containment. This catches notch-crossing footprints even with all corners inside. An irregular-boundary issue highlights the complete affected footprint, without fabricating a centimetre penetration value; legacy rectangular excess measurements are unchanged.
- Harmony has a shallow polygon floor with no bounding slab in its notch, rotated panels, explicit hinges, and real height-split door/window openings. Orthographic framing accounts for projected envelope dimensions, height and viewport aspect. Below-sill wall footprints still collide; wall transparency (~0.18) changes display only. The current demo retains its camera/geometry path.
- Heights are assumptions: walls 260 cm, doors 205 cm, sill 90 cm, window 120 cm, floor 10 cm. Source-derived architecture is visibly approximate and incomplete in both languages; checks cover only represented geometry. User-entered furniture measurements still require independent verification.
- Independent in-memory `EditorState` per plan preserves current/baseline snapshots, ceiling, counters, locks, selection, drafts, comparison and 100-entry histories. Switching is not a document edit; an active gesture is closed before switching. Reset/undo affect only the active plan. Language is global. Focus and inspector/view/template choices are cached; incoming cameras may refit. No disk/server persistence or permanently duplicated scenario GPU scenes.
- Optional look storage and job targets are keyed by scenario plus item ID. The panel stays mounted across switching, so a pending job is not cancelled or attached to another plan's identically named item. Existing consent/cache/privacy behavior is retained. No live fal request was made.
- Existing checkout limitation: only the model3d POST route is present; status/file handlers referenced by older generated route types are absent. No API/backend changes were authorized or made. Regenerating Next types through the production build resolved the stale typecheck failures; live photo completion and historical GLB-upload claims remain unverified, not newly certified functionality.
- No dependencies, commits, pushes or deployments. Verification and remaining manual checks are recorded in TEST_PLAN.

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

The Revision 4 fixing prompt replaces the box look with furniture models (milestone 1) and adds an optional AI 3D look from a photo (milestone 2). Everything from Revision 3 still applies, except that FitIn now has a server route handler for the optional AI look (and, from milestone 3, one for the optional AI plan reading).

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

- **Appearance only.** Any one item can have its own look, made by fal.ai TRELLIS from a product photo. (The `.glb` upload was later removed from the panel; the current panel accepts JPEG, PNG and WebP photos only.) It goes through the same `fitObjectToBox` path as the kind models, stretched to exactly the item's box, turned by the facing rule and then by the user's quarter turns. Collision tint and selection outline behave as for kind models. Boxes mode shows boxes for everything. Geometry and every check keep using the box.
- **Privacy statements** (footer, README, HACKATHON_COMPLIANCE): measurements, layout and checks never leave the device; only a photo the user explicitly chooses to send goes to fal.ai; FitIn stores nothing. The photo is resized on the device (at most 1024 px, JPEG 0.85, flattened on white) and sent only after the bilingual consent text and Confirm. The fal storage upload and the generated model are requested with a one-hour expiry. No photo, model, look or job is persisted by FitIn.
- **Server (as now implemented).** One route, `POST /api/model3d`: exactly one JPEG/PNG/WebP form entry, at most 4 MB, the declared type matching the file's magic bytes. While the client waits on that one response, the route uploads the photo, submits the job, follows its status every second and streams each phase as an NDJSON line (`queued`, `running`, `downloading`), then the finished GLB as base64 in the last line, or an error code. The GLB is fetched server-side and capped at 30 MB. A client that disconnects stops the wait, and a job still in fal's queue is cancelled. `MODEL3D_MODEL` picks `trellis` (default) or `trellis-2`. `FAL_KEY` is read only on the server; fal's generic proxy route is not used, and no fal URL or job ID reaches the browser. Errors are stable codes without upstream details. (The first version had separate `GET /api/model3d/[id]` status and `/file` routes with a job ID; they were replaced by this stream.)
- **Enabling.** The route returns 503 unless `MODEL3D_ENABLED === "true"` and `FAL_KEY` is set; the panel then explains that AI looks are switched off. `.env.example` lists both variables; `.env*` stays ignored except that example.
- **Rate limits.** In memory per server instance: 5 accepted photos per IP per sliding 10 minutes and 60 accepted photos per sliding 24 hours across all IPs. Only accepted submissions count (rejected uploads use no quota), and the limit is checked before the body is parsed. The IP is the first `X-Forwarded-For` hop, else `X-Real-IP`; without a trusted proxy it can be spoofed, which the global daily cap bounds.
- **Status mapping.** `IN_QUEUE` to queued, `IN_PROGRESS` to running, `COMPLETED` to done unless fal reports an error, anything else failed; a 4xx from fal is failed and other upstream errors are `upstream`.
- **Client job.** Reads the stream, shows the phase, elapsed seconds and Cancel, and stops at 180 s from Confirm with a timeout message. Cancel closes the response, which cancels a job still queued at fal; a job already running may still finish and is not fetched. One job runs at a time; it stays tied to the item it was started for even if the selection changes.
- **Session cache.** Finished GLBs are cached in memory by the SHA-256 of the resized photo for the session; choosing the same photo again reuses the model without sending anything. Where Web Crypto is unavailable (plain-HTTP LAN addresses), nothing is cached.
- **Looks state.** A `useLooks` hook outside the editor reducer holds `Map<itemId, Look>`, `Look = { object, quarterTurns, name, kind }`. Looks are not undo history and are not persisted. They are kept when an item is deleted or on Reset Demo, so undo brings the item back with its look, and are cleared only by an accepted library replacement (a lock-rejected replacement keeps the look) or Remove look. A look renders only for items that currently exist in the displayed snapshot, including the baseline in Before.
- **Kind guard (added).** `Look` also records the item kind it was made for, and renders only while the item still has that kind. Undo restores the item-ID counter, so an undone library item's ID can be reused by a new item; without the guard, for example, a new wardrobe could inherit an undone sofa's look. Suggested items keep stable IDs, so re-adding the suggested sofa after Reset Demo shows its earlier look again.
- **Starting turn (added).** The one real TRELLIS model faced +X with its long side along Z, so with no turn a sofa look would have appeared sideways and stretched across the wrong axes. A new look therefore starts at one quarter turn when its longer horizontal side clearly (by at least 1.2x) lies across the item's longer side, and at none otherwise. For that sofa, one turn also put its front toward FitIn's front. Front versus back cannot be inferred, so Turn 90 degrees remains the fix.
- **Turn 90 degrees** turns the look a quarter turn clockwise in the plan, matching item angles. A turned look is stretched to the same box, so its proportions change.
- **GLB loading.** The returned binary glTF is parsed with Three.js' `GLTFLoader` on demand, without Draco or Meshopt. A loading manager blocks every non-`data:`/`blob:` URL, so a model referencing external files fails instead of fetching them. A model with no geometry is rejected. (The first version also let users upload their own `.glb`; that button was later removed.)
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

Concord 1 Option 1, 2B is a scenario reference only. Its typical full-floor PDF has a metric scale bar but no dimension lines, so a flat can be measured from it only approximately (milestone 3's Read my floor plan does this for the user's own flat), and individual flats may vary. No extraction for the demo flat, exact-reconstruction claim, embedding or redistribution is performed. Code/UI/README label assumptions in both languages and retain official links and measurement caution.

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

- Revision 4: rate limits are per instance, in memory, sliding windows, count only accepted photos, and trust `X-Forwarded-For`.
- Revision 4: looks also record their item kind so a reused item ID of another kind never inherits a look; a re-added suggested item with the same ID and kind does show its earlier look.
- Revision 4: the fal upload and result are requested with a one-hour expiry; whether fal honours this for TRELLIS outputs is not verified.
- Revision 4: a new look's starting quarter turn is chosen from its shape (from one TRELLIS sample that faced +X); it may face backwards for other photos.
- Revision 4: Turn 90 degrees is clockwise; Cancel stops waiting but cannot stop a fal job already running; the look panel is visible but disabled in Before.

- Revision 4 milestone 3: the team's request for AI reading and accuracy replaced parts of the written spec (listed at the top). Known-area calibration became a cross-check; the presets picker and committed traced flats were dropped by team choice.
- Revision 4 milestone 3: thresholds tuned on one real plan (Harmony 1): verification margin 0.15, wall shadow at 0.35 coverage, derived faces drawn along at least 30% of the edge, a wall present at 1.4 thin pens, door matching within 120 cm. Other standard blocks may need retuning; an edge the analysis is unsure about is left unverified rather than guessed.
- Revision 4 milestone 3: AI doors that match no drawn opening are kept only where they fit a room face, and flagged; drawn openings the AI did not mention are added only when they join two rooms and look like doors. A real door the AI missed and the drawing shows faintly must be added by tapping.
- Revision 4 milestone 3: the AI plan reader uses the photo validator of the AI look (4 MB, one PNG/JPEG/WebP entry), so its limits match.

These are recorded smallest-scope choices for the team's next judgement, not blockers or newly advertised capabilities.