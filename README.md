# FitIn

FitIn Revision 2 is a browser-only English / Traditional Chinese furniture-layout editor for non-expert households. A five-room whole-flat demo is shared by a touch-capable 2D plan and a view-only-for-dragging 3D scene. Every furniture item can be moved, rotated, resized, replaced or deleted; a preset library adds new items.

The flat is a **simplified demo assumption**, not a measured reconstruction or a guarantee of real-world fit. Geometry is deterministic; the app does not use AI at runtime. Development follows the team's [judge-and-fix loop](docs/DEVELOPMENT_METHOD.md), not unrequested feature expansion.

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

1. Confirm the assumed whole flat and shared ceiling height (220-350 cm).
2. Select any item in the plan, 3D scene or list. After is the editable current layout; Before is the read-only baseline.
3. Drag in the 2D plan with mouse or touch, or enter precise global X/Z coordinates. Rotate with the side-panel circular dial, numeric degree field or reset-to-0 button.
4. Edit width/depth/height manually to resize or replace dimensions without changing centre or rotation. Incomplete input retains the last accepted pose and shows field errors; values are not silently clamped.
5. Inspect live Issues: furniture, wall, door-swing, envelope and height warnings. Overlap is allowed and appears in both views; there is no Check button or valid-After gate.
6. Optionally lock positions or create several minimum edge-distance locks. A lock-breaking move/rotation/resize/replacement snaps to its last accepted state with required/attempted numbers.
7. Choose a room and library type to add a default-zero-degree item in a free initial position. Replace the selected item from a preset while keeping pose, or delete it and its related locks.
8. Toggle Before/After immediately in both views without resetting the camera. After includes faint baseline outlines and moved/rotated/resized/added/removed/preset-replaced markers.
9. Set current layout as baseline to take a new independent snapshot. Geometric warnings may be included; incomplete drafts may not. Switching comparison views discards incomplete drafts, not accepted layout changes.

Reset Demo restores the original furniture, ceiling, baseline and empty locks, resets transient controls and camera, and keeps the language. Reset View changes only the camera. Nothing is persisted.

## Implemented Features

- Five directly connected rooms, 10 cm-thick walls, real door gaps, configured swing zones, entrance door and visual windows; no corridor.
- Twenty existing movable/replaceable items and fourteen bilingual library presets.
- Pointer-captured mouse/touch plan dragging, expanded finger hit areas, numeric dimensions/positions, and accessible rotation dial/degree input.
- Continuous clockwise angles stored in [0, 360); input 360 is normalised to 0.
- SAT collisions, containment-correct minimum translation/penetration, convex overlap clipping, and exact polygon edge distance.
- Live red item tint, floor overlap polygons and numeric labels in 2D/3D; issue clicks select the item and outline all involved furniture.
- Multiple position and user-defined distance locks, editable/removable lists, zero-distance locks, no forced wall spacing, and lock-only snap-back.
- Immediate baseline/current comparison, both-view ghost outlines, change markers and user re-baselining.
- Adjustable shared ceiling height, simplified dimensionally bounded sofa/box models, open ceiling and translucent full-height walls for inspection.
- English / Traditional Chinese labels, object names, numeric errors/issues, lock messages, sources and limitations.
- Preserved orbit, wheel/pinch zoom, zoom buttons, Reset View and Reset Demo; no furniture dragging in 3D.
- No external models, textures, fonts, expensive effects, or shadows.
- Browser-only state and calculations, with textual results independent of WebGL availability.
- Pure geometry/input/lock/editor/baseline and bilingual-message tests.

## Explicit Non-Goals

No corridor, backend/API/database/account, persistence, deployment, photo/camera/scanning/OCR/AI analysis, AR, external models/textures, 3D furniture dragging, automatic layout solving, wall-distance locks, undo/redo, delivery/lift/corridor/doorway-passage analysis, analytics or paid runtime service is added. Initial placement probes only the requested new library item; it never rearranges existing furniture or solves a layout. No deployment was performed.

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

No environment variables, credentials, or external services are required. Next.js serves the static application and assets; it is not a FitIn data-processing backend. Keep the committed npm lockfile.

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
| ESLint / Next config | 9.39.5 / 16.3.8 | [Static checks](https://eslint.org/) |

ESLint 9 is retained because the selected stable Next lint configuration includes plugins whose peer ranges exclude ESLint 10. npm marks ESLint 9 as out of support; a compatible lint-stack upgrade remains maintenance work. No force or legacy-peer-dependency flags are used. Three.js emits an upstream `THREE.Clock` deprecation warning through R3F; browser verification found no application console errors. See [docs/DECISIONS.md](docs/DECISIONS.md).

The Housing Authority is credited as the public scenario reference, not as the source or certifier of demo measurements. The PDF is linked, not embedded or redistributed. No software licence has been added to this repository.

## Architecture

```text
src/
	app/                   App Router shell, stylesheet, static icon
	components/            Header/source, pointer plan, dial, 3D models/overlays
	features/flat-editor/  Single reducer, item/lock/library panels, baseline logic
	features/fit-check/    Thin client entry retained for the App Router page
	lib/geometry/          Decimal parsing, SAT/clipping/distance, walls, locks
	data/                  Whole-flat assumptions, library and official links
	i18n/                  Typed English / Traditional Chinese dictionaries
	types/                 Domain contracts and discriminated results
docs/                    Architecture, decisions, test plan, compliance
```

Geometry never imports React, Three.js or translation functions. Stable warning/lock codes, object IDs and unrounded numbers are translated in the UI. The reducer owns the current layout, independent baseline, drafts, selection and locks. Both views consume one displayed snapshot; rendering never decides whether an edit is accepted. Only locks can reject a complete pose proposal.

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

Wall rectangles are split at door openings. Door swings reserve conservative width-square bounds inside the swing room. Windows are visual only; they do not cut collision walls or create clearance rules. The envelope is X = 0-660, Z = 0-640. Height is compared directly with the shared ceiling. All relevant warnings are collected; geometry does not block edits.

Product dimensions remain finite positive plain decimals: width/depth <= 1000 cm, height <= 500 cm. Ceiling is 220-350 cm. Positions accept negative/outside-envelope values but are limited to +/-10000 cm to prevent extreme renderer overflow; this is an input bound, not wall spacing. Rotation accepts 0-360 with 360 normalised to 0. Distance-lock minimums are finite >= 0. Blank, malformed, nonfinite, units, commas and exponent text produce input errors; values are never silently clamped.

Each item mutation validates all its applicable locks. Position locks block centre changes but allow other edits unless distance locks reject them. Several distance locks may share an item or pair. Creation/editing must already satisfy the current layout, rather than moving furniture automatically. A violated edit restores the last accepted pose continuously during dragging, so it cannot rest in violation after release. A minimum-zero lock permits overlap; geometry warnings still remain.

## Demo Data

**All dimensions are generated team demo assumptions, not Housing Authority-certified measurements.** The flat is 660 x 640 cm gross (42.24 square metres), with default ceiling 260 cm and uniform 10 cm walls. Five rooms total 38.21 square metres of assumed usable area: living/dining, kitchen, bathroom, master bedroom and second bedroom. There is no corridor.

Twenty zero-degree existing items span all rooms, and fourteen library presets include sofa, tables/chairs, beds, wardrobes, desks, counter, fridge, toilet and vanity. Even kitchen/bathroom boxes are editable; plumbing is not modelled. The default has no geometry warnings or locks. The old entrance rectangle is replaced by the front-door swing zone and the sofa-table clear strip is removed.

All room/wall/opening/window/item dimensions and centres are recorded in [docs/FLAT_DEMO_DATA.md](docs/FLAT_DEMO_DATA.md), with data-sanity tests. New library items use a bounded 20 cm candidate grid plus room centre/edge candidates; if none is clear, nothing is added and a bilingual message identifies the room. Existing items are never moved by this process.

## Official Floor-Plan Reference

Preset label:

- English: **Concord 1 Option 1 — 2B reference scenario (simplified demo dimensions)**
- Traditional Chinese: **康和一型第一款 — 2B 參考情境（簡化示範尺寸）**

[Hong Kong Housing Authority standard-block typical floor plans](https://www.housingauthority.gov.hk/tc/global-elements/estate-locator/standard-block-typical-floor-plans/index.html)

[Concord 1 official PDF](https://www.housingauthority.gov.hk/common/pdf/global-elements/estate-locator/standard-block-typical-floor-plans/01-Concord1.pdf)

Concord 1 Option 1, 2B is a scenario reference only. The PDF is a typical full-floor plan, not a dimensioned individual-flat plan. This flat is a simplified approximation, not an exact reconstruction; no pixel-based measurements were extracted. Actual flats may differ. **Verify the dimensions of your own flat before making a purchase decision.**

## Testing

Run the required gates before committing:

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
```

The current suite has **113 tests in seven files**, covering rotated SAT at 0/30/45/90/135/360 degrees, contact/epsilon, penetration and clipping area, convex distance, walls/door openings/swings/envelope/height, locks and bounce-back, generic manual validation, library/baseline/change detection, flat sanity, transform consistency and bilingual templates. The latest type, unit and lint gates pass; builds pass at every pushed milestone.

Revision 2 uses cheap verification: typecheck/tests after meaningful changes, lint before commits, build only at milestone pushes, and roughly three-minute check limits. One bounded final browser smoke is recorded separately; any unperformed behavior stays under pending manual check in [docs/TEST_PLAN.md](docs/TEST_PLAN.md). Revision 1 browser evidence is not claimed for this editor. Physical-phone touch/pinch, broader browsers, accessibility users and household studies still need team testing.

## Privacy, Data Flow, and Cost

All inputs and calculations stay in the browser. No photo is collected. No account is used. No data is sent to a FitIn backend because there is no backend. Nothing is persisted by the app; reload resets it. No analytics or tracking SDK is included. Fonts, models, and textures are not fetched externally.

Initial page/assets are served by the local Next.js server. Opening an official-source link visits the Housing Authority website; browser networking and that site's policies then apply. Normal browser and GitHub/npm network activity during development is outside the application workflow. Next CLI telemetry was disabled in the implementation environment; other developers can opt out with `npm exec -- next telemetry disable`.

Revision 2 uses **no paid runtime API**. This is not a promise that every future version, infrastructure choice, or service will be free.

## Limitations and Error Statement

- The floor plan and furniture are simplified approximations. Actual flats may differ; user measurements can be wrong.
- Only rectangular footprints and wall rectangles are checked. Irregular shapes and compressible furniture are not modelled.
- Window sill/clearance, delivery routes, wall fixtures, skirting boards, pipes, plumbing and door lintel/vertical passage constraints are not modelled.
- Door swing squares are conservative demo constraints, not safety standards, building rules or exact sweep geometry.
- Only the displayed layout's implemented constraints are checked; no alternative layout or delivery route is solved.
- The 3D appearance is illustrative, not photorealistic. WebGL availability and device performance vary; textual checking does not depend on rendering success.
- No issues means only that no currently implemented constraint reports a warning for the displayed layout, not guaranteed fit. Temporary warnings are allowed unless an optional lock is violated.
- This is not professional, structural, accessibility, or building-code advice, design approval, delivery-route verification, or a guarantee of real-world fit.

## AI Coding-Assistant Use

GitHub Copilot assisted with implementation, tests, documentation, and browser-based verification. AI assistance is not a runtime feature. Team members must review the generated code, numerical assumptions, translations, source attribution, dependency constraints, and HacKU rules. Passing automated checks is not a substitute for human or household usability review.

## Next Judge / Fix Cycle

The team judges this running revision and lists desired fixes. Only a subsequent fixing prompt authorises further changes. Measured flat accuracy, physical-phone testing, accessibility review and a consent-based comparison with the current manual method are evidence tasks, not already completed claims. Scanning, AI, AR, delivery analysis and deployment remain unimplemented and require separate scope.