# FitIn

FitIn Revision 4 is an English / Traditional Chinese furniture-layout editor for non-expert households. All measurements, layout and checks run in the browser. A whole flat is shared by a touch-capable, zoomable 2D plan and a view-only-for-dragging 3D scene. The flat is either the five-room demo or **the user's own flat, read from a Housing Authority floor plan** (PDF or picture) and measured with the plan's own scale bar. It starts empty: example placements or preset library items can be added, and every item can then be moved, rotated, resized, replaced or deleted, with undo/redo. Furniture is drawn with low-poly models stretched to each checked box, and any one item can optionally get its own 3D look, made by AI from a product photo.

The demo flat is a **simplified demo assumption**, not a measured reconstruction. A traced flat is measured from the plan's scale bar and drawn walls, so it is only as accurate as the plan and the user's check, and Housing Authority plans show a typical floor. Neither is a guarantee of real-world fit. Geometry is deterministic. Runtime AI is optional and never measures or checks anything: the photo-to-3D look (fal.ai TRELLIS) changes appearance only, and a vision model can say which rooms a plan shows, while every size comes from the drawing. Development follows the team's [judge-and-fix loop](docs/DEVELOPMENT_METHOD.md), not unrequested feature expansion.

## HacKU Positioning

Deep Technology Problem Statement 4: **"The Capability That Hasn't Travelled."**

| Element | FitIn mapping |
| --- | --- |
| Capability | Expert spatial-fit and furniture-placement verification, simplified to explicit preset constraints |
| New setting | A normal household choosing replacement furniture |
| Adoption barrier | User expertise: interpreting measurements and spatial constraints |
| Complete task | Arrange or replace furniture across one assumed flat, inspect exact rotated-footprint issues, apply optional locks, and compare the baseline/current layout immediately |

This is a simplified proof of capability. It does not establish professional approval, building-code compliance, safe use, delivery feasibility, or guaranteed fit in an actual flat.

## Current Workflow

1. Start from the assumed whole flat, which has architecture only, no furniture and an empty baseline, or switch to your own flat (see **Using your own flat** below). Confirm the shared ceiling height (220-350 cm).
2. Optionally use **Suggested furniture** to add example placements, for the whole flat or for the selected room: on the demo flat the team's fixed placements; on a traced flat a set per room kind (living: sofa, coffee table, TV console, dining table, 2 chairs; bedroom: bed, wardrobe, desk, with a double bed only in the largest bedroom; kitchen: counter, fridge; bathroom: toilet, vanity), probed one by one against the walls first and turned to face into the room. These are not computed recommendations or a guarantee of fit. Suggestions that are already present, or that would overlap existing furniture, a wall, a door swing or the envelope, exceed the ceiling or break a distance lock, are skipped with a bilingual reason. Existing furniture is never moved.
3. Choose a room with the room chips above the plan, the toolbar room picker or a double-tap on the room's empty floor. The 2D plan zooms to that room and the 3D camera frames it from the same viewing direction; **Whole flat** or Fit returns both views. Repeating a chip or Fit reframes both views again. Zoom the plan freely with the zoom buttons at the right end of the room-chip bar, a two-finger pinch or Ctrl/Cmd + wheel (the plain wheel zooms only once the plan is zoomed in; otherwise it scrolls the page), and drag empty floor to pan. Free 2D zoom does not move the 3D camera.
4. Select any item in the plan, 3D scene or list. After is the editable current layout; Before is the read-only baseline. Selecting from the list, 3D scene or Issues pans a zoomed plan to an item that is out of view.
5. Drag in the 2D plan with mouse or touch, or enter precise global X/Z coordinates. Rotate with the side-panel circular dial, numeric degree field or reset-to-0 button.
6. Edit width/depth/height manually to resize or replace dimensions without changing centre or rotation. Incomplete input retains the last accepted pose and shows field errors; values are not silently clamped.
7. Inspect live Issues: furniture, wall, door-swing, envelope and height warnings. Overlap is allowed and appears in both views; there is no Check button or valid-After gate.
8. Optionally lock positions or create several minimum edge-distance locks. A lock-breaking move/rotation/resize/replacement snaps to its last accepted state with required/attempted numbers.
9. Choose a room and library type to add a default-zero-degree item in a free initial position. Replace the selected item from a preset while keeping pose, or delete it and its related locks.
10. Toggle Before/After immediately in both views without resetting the camera. After includes faint baseline outlines and moved/rotated/resized/added/removed/preset-replaced markers.
11. Set current layout as baseline to take a new independent snapshot. Geometric warnings may be included; incomplete drafts may not. Switching comparison views discards incomplete drafts, not accepted layout changes.
12. Undo/Redo (toolbar buttons, or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y outside text fields) step through up to 100 layout changes. A whole drag or dial drag is one step, as is typing into one field until it loses focus, a suggestion batch, a lock change, a new baseline and Reset Demo. Rejected or incomplete edits, selection, room choice, language, Before/After, zoom and camera are not history.

13. Optionally give the selected item a **3D look** in the "3D look (optional)" section under the selected-item panel. **Make from photo (AI)** resizes the product photo on the device (at most 1024 px), shows "Your photo will be sent to fal.ai to build the 3D model. FitIn does not store it." and sends it only after Confirm; progress and Cancel are shown, and FitIn stops waiting after 3 minutes. The look is stretched to the item's box like the furniture models (Turn 90° and Remove look adjust it, with a small preview inside the W x D x H outline); checks still use the box. Looks are not undo history and are not saved; they survive Delete and Reset Demo so Undo restores the item with its look, and a library replacement clears the item's look.

Reset Demo empties the current flat (demo or traced): empty baseline, the flat's default ceiling and empty locks; it resets transient controls, returns both views to the whole flat and keeps the language; Undo restores the previous layout. Reset View reframes the 3D camera on the current room focus, or the whole flat. Nothing is persisted, except a flat file the user chooses to download.

### Using your own flat

The toolbar's **Flat** menu offers **Demo flat**, **Read my floor plan…**, **Open flat file…** and **Download this flat**. Switching flats starts a fresh document: furniture, locks and undo history are cleared (after a bilingual confirmation when there is anything to lose), and AI looks are cleared. **Read my floor plan…** replaces the editor with five steps until **Use this flat** or Cancel:

1. **Picture.** A PDF (a Housing Authority standard-block plan works best; a page picker shows every floor option) or a PNG/JPEG/WebP picture. It is rendered in the browser and never uploaded.
2. **Scale.** On a Housing Authority PDF, FitIn finds the scale bar from the PDF's text and places both markers on its 0 and 8 m ticks; otherwise tap the two ticks (each tap snaps to the tick's centre) or the two ends of a length you measured, and type the length. The step shows centimetres per pixel and what ±1 pixel means.
3. **Your flat.** Drag a box around your flat. The flat type (1P/1B/2B/3B) is read from the label inside the box, and a flat drawn at an angle is offered straightened.
4. **Rooms.** FitIn renders a sharp crop of your flat (about 0.5 cm per pixel on PDFs). Either **Read rooms with AI**, after a consent screen showing the exact picture that will be sent to fal.ai, or **Trace by hand**. Every room edge is snapped to the walls actually drawn and shown by its evidence: solid when matched to a drawn wall, dashed amber when not, dotted when open to the next room. Drag edge handles (they re-snap), add or delete rooms and change their kinds, tap to add doors and windows (measured from the drawn opening), use **Find doors and windows in the drawing**, open a wall for an open plan or an L-shaped room, set the ceiling height and, optionally, the internal floor area from tenancy papers as a cross-check. Undo/redo work here too.
5. **Use.** Walls are generated from the rooms, doors and windows are attached, and the flat is checked. Errors (overlapping rooms, a room narrower than 40 cm, a door off every wall or too wide, not exactly one entrance on an outer wall) block it; warnings (unreachable rooms, unmatched edges, bedroom count against the flat type, floor area more than 5% off the tenancy figure) do not. Unmatched edges must be confirmed with a tick before **Use this flat**.

A traced flat can be downloaded as a `.fitin-flat.json` file (geometry and names only, never the picture) and opened later; opened files are checked strictly. The scenario panel then states how the flat was measured and who read its rooms.

## Implemented Features

- Five directly connected rooms, 10 cm-thick walls, real door gaps, configured swing zones, entrance door and visual windows; no corridor.
- The flat is editor state: the demo flat, a flat traced from a floor plan, or a validated flat file. Furniture in the notch of an L-shaped flat is reported as outside the flat (hatched on the plan, tinted in 3D), and the whole-flat camera adapts to the flat's size.
- Floor-plan tracing from a PDF (pdf.js, in the browser) or picture: scale from the plan's scale bar or a measured length, room edges snapped to the drawn walls (stroke centres to a fraction of a pixel, wall thickness from the line pair, partitions and window walls recognised), walls generated from the rooms, doors and windows measured from the drawing, validation, and an optional AI reading of which rooms there are.
- Empty start, twenty team-prepared suggested placements on the demo flat and per-room-kind suggestions on traced flats (whole flat or per room, with skip reasons), and fourteen bilingual library presets; every placed item is movable/replaceable.
- Floor-plan zoom buttons, pinch, gated wheel zoom and empty-floor panning, plus a room focus shared by the 2D plan and 3D camera; labels, lock icons and outlines keep their on-screen size at any zoom.
- 100-step document undo/redo with one step per drag, dial drag or field-typing session, and an undoable Reset Demo.
- Pointer-captured mouse/touch plan dragging, expanded finger hit areas, numeric dimensions/positions, and accessible rotation dial/degree input.
- Continuous clockwise angles stored in [0, 360); input 360 is normalised to 0.
- SAT collisions, containment-correct minimum translation/penetration, convex overlap clipping, and exact polygon edge distance.
- Live red item tint, floor overlap polygons and numeric labels in 2D/3D; issue clicks select the item and outline all involved furniture.
- Multiple position and user-defined distance locks, editable/removable lists, zero-distance locks, no forced wall spacing, and lock-only snap-back.
- Immediate baseline/current comparison, both-view ghost outlines, change markers and user re-baselining.
- Adjustable shared ceiling height, open ceiling and translucent full-height walls for inspection.
- Low-poly furniture models (Kenney Furniture Kit, CC0) for every furniture kind, each stretched to exactly its item's width x depth x height box. Models are appearance only: collisions, locks, issues, the plan and Before/After use the box. A **Models / Boxes** toggle in the 3D toolbar shows the exact checked boxes (and the previous box/sofa look); a model that fails to load falls back to its box.
- English / Traditional Chinese labels, object names, numeric errors/issues, lock messages, sources and limitations.
- Preserved orbit, wheel/pinch zoom, zoom buttons, Reset View and Reset Demo; room focus frames the 3D camera with 2-10 m distance limits; no furniture dragging in 3D.
- Optional AI 3D look for any one item from a confirmed product photo (fal.ai TRELLIS through FitIn's own route handler, rate-limited, disabled unless `MODEL3D_ENABLED=true`); appearance only, with bilingual progress, cancel, timeout and failure messages.
- Optional AI plan reading for the trace (a vision model through fal.ai's OpenRouter router and FitIn's own route handler, rate-limited, disabled unless `FLOORPLAN_ENABLED=true`): room boxes, kinds and rough doors only; every measurement comes from the drawing.
- No externally fetched models, textures or fonts in the browser, and no expensive effects or shadows; the bundled models are served with the app.
- Browser-only state and calculations, with textual results independent of WebGL availability.
- Pure geometry/input/lock/editor/baseline/history/suggestion, plan-zoom and camera-framing maths, floor-plan analysis on synthetic drawings, trace building/validation, flat files, AI reply parsing and routes, and bilingual-message tests.

## Explicit Non-Goals

No corridor, database/account, persistence beyond a downloaded flat file, deployment, camera scanning, AI measurement, AI layout or fit analysis, AR, external textures, 3D furniture dragging, automatic layout solving, wall-distance locks, persistence of history or zoom, 3D panning or wall cutaways, delivery/lift/corridor/doorway-passage analysis, analytics, angled walls, non-rectangular rooms (other than rectangles joined by an open wall), committed traced flats or bundled Housing Authority plans is added. The only server code is the `/api/model3d` route for the optional AI look and the `/api/floorplan` route for the optional AI plan reading, and the only paid runtime service is fal.ai for those two. Initial placement probes only the requested new library item, and suggestions only add the team's fixed example placements while skipping blocked ones; neither rearranges existing furniture or solves a layout. No deployment was performed.

## Local Setup

Use **Node.js 22.12 or newer** and npm. Node 22 is recommended; `.nvmrc` selects major 22. Implementation verification used Node 22.23.2 and npm 10.9.8.

From the existing repository root:

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. If port 3000 is already used:

```sh
npm run dev -- --port 3001
```

For a local production check:

```sh
npm run build
npm run start
```

The editor, including tracing a floor plan by hand, needs no environment variables. The optional AI features need a fal.ai key: copy `.env.example` to `.env.local` and set `FAL_KEY=`, then `MODEL3D_ENABLED=true` for AI 3D looks and `FLOORPLAN_ENABLED=true` for AI plan reading. `FLOORPLAN_MODEL` picks the vision model (an OpenRouter model ID, default `google/gemini-2.5-flash`); a model that refuses to run without reasoning, such as `google/gemini-2.5-pro`, also needs `FLOORPLAN_REASONING=true`. Without them the AI routes return 503, the panels say the AI feature is switched off, and everything else works. Never commit `.env.local`; `.env*` is ignored except `.env.example`. Next.js serves the application and assets and runs the `/api/model3d` and `/api/floorplan` route handlers; it does not receive measurements or layouts. Keep the committed npm lockfile.

## npm Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js development server |
| `npm run build` | Production compilation, type checks, and static page generation |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Next.js ESLint rules for the project |
| `npm run typecheck` | Strict TypeScript checking without emitting code |
| `npm test` | Vitest watch mode |
| `npm run test:run` | Run the automated tests once |

## Technology and Credits

Direct dependencies are pinned; exact transitive versions are in the lockfile. These are stable releases, not alpha React Three Fiber packages.

| Library | Version | Purpose / upstream |
| --- | --- | --- |
| Next.js | 16.3.8 | [App Router and build tooling](https://nextjs.org/) |
| React / React DOM | 19.3.0 | [Client interface and state](https://react.dev/) |
| TypeScript | 5.9.3 | [Strict domain and component types](https://www.typescriptlang.org/) |
| Tailwind CSS / PostCSS plugin | 4.3.3 | [CSS tooling and stylesheet integration](https://tailwindcss.com/) |
| Three.js | 0.186.1 | [WebGL scene primitives](https://threejs.org/) |
| React Three Fiber | 9.8.1 | [React 19-compatible Three.js renderer](https://r3f.docs.pmnd.rs/) |
| Drei | 10.7.9 | [OrbitControls and edges](https://drei.docs.pmnd.rs/) |
| Lucide React | 1.50.0 | [Interface icons](https://lucide.dev/) |
| Vitest | 5.0.3 | [Pure TypeScript tests](https://vitest.dev/) |
| fal.ai client | 1.10.1 | [`@fal-ai/client`](https://github.com/fal-ai/fal-js), MIT: server-side upload, queue and result calls to fal.ai TRELLIS (`fal-ai/trellis`) for the optional AI look, and to fal's OpenRouter vision router (`openrouter/router/vision`) for the optional plan reading |
| pdf.js (`pdfjs-dist`) | 6.3.289 | [PDF rendering in the browser](https://mozilla.github.io/pdf.js/) by Mozilla, Apache-2.0: renders a floor-plan PDF page and crops of it, and reads its text labels; loaded only when the trace screen opens |
| Kenney Furniture Kit (asset) | 2.0 | [Low-poly furniture models](https://kenney.nl/assets/furniture-kit) by Kenney (www.kenney.nl), CC0 1.0; the fourteen used files are in `public/models/furniture/` with the kit's `License.txt` |
| ESLint / Next config | 9.39.5 / 16.3.8 | [Static checks](https://eslint.org/) |

ESLint 9 is retained because the selected stable Next lint configuration includes plugins whose peer ranges exclude ESLint 10. npm marks ESLint 9 as out of support; a compatible lint-stack upgrade remains maintenance work. No force or legacy-peer-dependency flags are used. Three.js emits an upstream `THREE.Clock` deprecation warning through R3F; browser verification found no application console errors. See [docs/DECISIONS.md](docs/DECISIONS.md).

The Housing Authority is credited as the public scenario reference, not as the source or certifier of demo measurements. The PDF is linked, not embedded or redistributed; a plan the user opens for tracing stays on their device. No software licence has been added to this repository.

## Architecture

```text
src/
	app/                   App Router shell, stylesheet, static icon
	app/api/model3d/       Optional AI look: one streaming photo-to-GLB route handler (server-only fal key)
	app/api/floorplan/     Optional AI plan reading: one route handler (server-only fal key)
	components/            Header/source, zoomable pointer plan, dial, 3D models/overlays/camera framing
	features/flat-editor/  Single reducer with undo history and the flat, item/lock/library/suggestion panels, Flat menu
	features/floor-trace/  Trace screen: PDF/picture source, scale, flat box, AI consent, room review, check
	features/model-looks/  3D-look state outside the reducer, photo job client, sidebar panel and preview
	features/fit-check/    Thin client entry retained for the App Router page
	lib/geometry/          Decimal parsing, SAT/clipping/distance, walls, locks
	lib/model3d/           AI-look contract, photo validation, rate limiter, fal server helpers
	lib/floorplan/         Drawing analysis (pens, wall snapping, openings, scale ticks), walls from rooms,
	                       flat building/validation, flat files, AI contract/prompt/parsing/server
	data/                  Whole-flat assumptions, library and official links
	i18n/                  Typed English / Traditional Chinese dictionaries
	types/                 Domain contracts and discriminated results
docs/                    Architecture, decisions, test plan, compliance
```

Geometry never imports React, Three.js or translation functions. Stable warning/lock codes, object IDs and unrounded numbers are translated in the UI. The reducer owns the flat, the current layout, independent baseline, drafts, selection, locks and a bounded undo/redo history of document snapshots. Plan zoom and room focus are view state outside the reducer, and so are 3D looks (keyed by item ID) and the Models / Boxes choice. Both views consume one displayed snapshot; rendering never decides whether an edit is accepted. Only locks can reject a complete pose proposal.

Further documentation:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md)
- [docs/HACKATHON_COMPLIANCE.md](docs/HACKATHON_COMPLIANCE.md)
- [docs/FLAT_DEMO_DATA.md](docs/FLAT_DEMO_DATA.md)
- [docs/DEVELOPMENT_METHOD.md](docs/DEVELOPMENT_METHOD.md)

## Geometry and Coordinates

Domain units are **centimetres**. The global origin is the front-left outer-envelope floor corner. X increases right, Z increases toward the back, and Y increases upward. Item positions are footprint centres and models rest on Y = 0. Positive angles are clockwise in the X-right/Z-down plan. Three.js receives the negative Y angle, tested against the same corner transform.

Rectangles have four rotated corners, not a swapped-axis approximation. SAT tests all edge normals; penetration is the containment-correct smallest separating translation. Sutherland-Hodgman clipping returns the actual overlap polygon and its area. Minimum edge distance uses containment/overlap checks and point-to-segment minima for the convex polygons; overlapping or touching distance is zero. A **0.000001 cm** epsilon handles geometric touching/noise and lock comparisons, not real measurement tolerance.

Wall rectangles are split at door openings. Door swings reserve conservative width-square bounds inside the swing room. Windows are visual only; they do not cut collision walls or create clearance rules. The demo envelope is X = 0-660, Z = 0-640; a traced flat's envelope is its bounding box, and the parts of that box outside every room and wall (the notch of an L-shaped flat) report furniture placed there as outside the flat. Height is compared directly with the shared ceiling. All relevant warnings are collected; geometry does not block edits.

Product dimensions remain finite positive plain decimals: width/depth <= 1000 cm, height <= 500 cm. Ceiling is 220-350 cm. Positions accept negative/outside-envelope values but are limited to +/-10000 cm to prevent extreme renderer overflow; this is an input bound, not wall spacing. Rotation accepts 0-360 with 360 normalised to 0. Distance-lock minimums are finite >= 0. Blank, malformed, nonfinite, units, commas and exponent text produce input errors; values are never silently clamped.

Each item mutation validates all its applicable locks. Position locks block centre changes but allow other edits unless distance locks reject them. Several distance locks may share an item or pair. Creation/editing must already satisfy the current layout, rather than moving furniture automatically. A violated edit restores the last accepted pose continuously during dragging, so it cannot rest in violation after release. A minimum-zero lock permits overlap; geometry warnings still remain.

## Demo Data

**All demo-flat dimensions are generated team demo assumptions, not Housing Authority-certified measurements.** A traced flat's dimensions come from the user's trace (see **Using your own flat**). The flat is 660 x 640 cm gross (42.24 square metres), with default ceiling 260 cm and uniform 10 cm walls. Five rooms total 38.21 square metres of assumed usable area: living/dining, kitchen, bathroom, master bedroom and second bedroom. There is no corridor.

The flat starts empty. Twenty suggested placements span all rooms (six wall-backed or seated items are turned 180 or 90 degrees so their models face into the room; each turned footprint is unchanged), and fourteen library presets include sofa, tables/chairs, beds, wardrobes, desks, counter, fridge, toilet and vanity. Even kitchen/bathroom boxes are editable; plumbing is not modelled. The empty default has no warnings or locks, and the full suggested set is also warning-free. The old entrance rectangle is replaced by the front-door swing zone and the sofa-table clear strip is removed.

All room/wall/opening/window/item dimensions and centres are recorded in [docs/FLAT_DEMO_DATA.md](docs/FLAT_DEMO_DATA.md), with data-sanity tests. New library items use a bounded 20 cm candidate grid plus room centre/edge candidates; if none is clear, nothing is added and a bilingual message identifies the room. Existing items are never moved by this process.

## Official Floor-Plan Reference

Preset label:

- English: **Concord 1 Option 1 — 2B reference scenario (simplified demo dimensions)**
- Traditional Chinese: **康和一型第一款 — 2B 參考情境（簡化示範尺寸）**

[Hong Kong Housing Authority standard-block typical floor plans](https://www.housingauthority.gov.hk/tc/global-elements/estate-locator/standard-block-typical-floor-plans/index.html)

[Concord 1 official PDF](https://www.housingauthority.gov.hk/common/pdf/global-elements/estate-locator/standard-block-typical-floor-plans/01-Concord1.pdf)

Concord 1 Option 1, 2B is a scenario reference only for the demo flat, which is a simplified approximation, not an exact reconstruction; no measurements were extracted for it. Housing Authority PDFs are typical full-floor plans with a metric scale bar but no dimension lines, so a flat can be measured from them approximately with **Read my floor plan**; individual flats and finishes may differ from the typical floor. No Housing Authority PDF or picture is bundled or redistributed. **Verify the dimensions of your own flat before making a purchase decision.**

## Testing

Run the required gates before committing:

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
```

The current suite has **377 tests in 29 files**, covering the floor-plan trace (drawing analysis on synthetic plans: pens, scale ticks, wall faces, openings, orientation; walls from rooms; build and validation; frames; the trace reducer; flat files; AI reply parsing, the `/api/floorplan` route with fal mocked and its client), flats as editor state (switching, voids, camera scaling, per-room-kind suggestions), furniture-model fitting/facing/mapping (including loading the committed model files), the AI-look routes with fal and fetch mocked (validation, 503 when disabled, per-IP and daily limits, status mapping, GLB streaming), the AI-look job client (polling, timeout, cancel), GLB parsing without external fetches, looks across delete/Reset/undo/replace/Remove, undo/redo granularity and limits, empty start and suggestion skip rules, plan zoom/pan/fit maths, 3D room-framing maths, rotated SAT at 0/30/45/90/135/360 degrees, contact/epsilon, penetration and clipping area, convex distance, walls/door openings/swings/envelope/height, locks and bounce-back, generic manual validation, library/baseline/change detection, flat sanity, transform consistency and bilingual templates. The latest type, unit and lint gates pass; builds pass at every pushed milestone.

Revision 2 uses cheap verification: typecheck/tests after meaningful changes, lint before commits, build only at milestone pushes, and roughly three-minute check limits. One bounded final browser smoke is recorded separately; any unperformed behavior stays under pending manual check in [docs/TEST_PLAN.md](docs/TEST_PLAN.md). Revision 1 browser evidence is not claimed for this editor. The Revision 3 and Revision 4 milestone 1-2 implementation sessions had no browser tools, so no browser smoke was run for them; their UI behaviour is listed under pending manual check. Revision 4 milestone 2 made one real fal.ai call through the dev server with `curl`. Milestone 3 (floor-plan tracing) was measured against the vector data of a real Housing Authority PDF, made real fal.ai plan-reading calls, and ran short headless-Edge smokes of the trace screen (see TEST_PLAN). Physical-phone touch/pinch, broader browsers, accessibility users and household studies still need team testing.

## Privacy, Data Flow, and Cost

**Measurements, layout and checks never leave the device.** They are browser state only. A floor-plan PDF or picture used for tracing stays on the device too, and tracing by hand sends nothing. **Only what the user explicitly chooses to send goes to fal.ai.** For AI plan reading, that is the cropped picture of the user's own flat, shown on the consent screen (at most 1536 px): it goes through FitIn's `/api/floorplan` route to fal.ai storage (one-hour expiry requested) and the vision model, and only the room reading comes back; the scale, wall positions and sizes are measured on the device. For an AI look, the resizes it on the device and sends it only after the user reads the consent text and taps Confirm. It passes through FitIn's `/api/model3d` route to fal.ai storage and TRELLIS, with a one-hour expiry requested, and the finished model comes back through the same route; no fal URL or key reaches the browser. **FitIn stores nothing**: no photo, plan, model, look, layout or account is kept by the app or its server, and reload resets everything (the session's model cache is browser memory only), apart from a flat file the user chooses to download. No analytics or tracking SDK is included. Fonts, models and textures are not fetched from third parties by the browser.

Initial page/assets are served by the local Next.js server. Opening an official-source link visits the Housing Authority website; browser networking and that site's policies then apply. Normal browser and GitHub/npm network activity during development is outside the application workflow. Next CLI telemetry was disabled in the implementation environment; other developers can opt out with `npm exec -- next telemetry disable`.

Revision 4 has **two optional paid runtime APIs, both through fal.ai**: TRELLIS for the AI 3D look, roughly US$0.02 per model at the time of writing, and the OpenRouter vision router for AI plan reading, charged by the model's tokens (a fraction of a US cent per reading with the default `google/gemini-2.5-flash` at the time of writing; at most two requests per reading). Check fal.ai pricing. The look is off unless `MODEL3D_ENABLED=true` and limited in memory to 5 accepted photos per IP per 10 minutes and 60 per server instance per day; plan reading is off unless `FLOORPLAN_ENABLED=true` and limited to 10 per IP per 10 minutes and 100 per server instance per day. Everything else uses no paid service. This is not a promise that every future version, infrastructure choice, or service will be free.

## Limitations and Error Statement

- The demo floor plan and furniture are simplified approximations. Actual flats may differ; user measurements can be wrong.
- A traced flat is as accurate as the plan, the scale calibration and the user's review. Housing Authority plans show a typical floor; individual flats, plaster and tiles differ (often 1-3 cm per face). Only axis-aligned walls are modelled: a flat drawn at an angle is straightened as a whole, but a partly diagonal room is approximated by rectangles. The AI's reading of rooms can be wrong or incomplete (in testing it mislabelled and missed rooms); edges that do not match a drawn wall are flagged, but room kinds and missing rooms must be checked by the user.
- Only rectangular footprints and wall rectangles are checked. Irregular shapes and compressible furniture are not modelled.
- Window sill/clearance, delivery routes, wall fixtures, skirting boards, pipes, plumbing and door lintel/vertical passage constraints are not modelled.
- Door swing squares are conservative demo constraints, not safety standards, building rules or exact sweep geometry.
- Only the displayed layout's implemented constraints are checked; no alternative layout or delivery route is solved.
- The 3D appearance is illustrative, not photorealistic. Furniture models and AI looks are stretched to the checked box, so proportions can be distorted; an AI look is an approximate reconstruction from one photo and may have the wrong shape, missing parts or the wrong facing (Turn 90° adjusts facing). It never affects a check. WebGL availability and device performance vary; textual checking does not depend on rendering success.
- No issues means only that no currently implemented constraint reports a warning for the displayed layout, not guaranteed fit. Temporary warnings are allowed unless an optional lock is violated.
- This is not professional, structural, accessibility, or building-code advice, design approval, delivery-route verification, or a guarantee of real-world fit.

## AI Coding-Assistant Use

GitHub Copilot assisted with implementation, tests, documentation, and browser-based verification. Revisions 3 and 4 were implemented with Claude Code (Anthropic). Coding assistance is not a runtime feature; the only runtime AI is the optional fal.ai TRELLIS look and the optional plan reading by a vision model through fal.ai. Team members must review the generated code, numerical assumptions, translations, source attribution, dependency constraints, and HacKU rules. Passing automated checks is not a substitute for human or household usability review.

## Next Judge / Fix Cycle

The team judges this running revision and lists desired fixes. Only a subsequent fixing prompt authorises further changes. Measured flat accuracy, physical-phone testing, accessibility review and a consent-based comparison with the current manual method are evidence tasks, not already completed claims. Scanning, AI layout analysis, AR, delivery analysis, angled walls and deployment remain unimplemented and require separate scope.