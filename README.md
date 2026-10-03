# FitIn

## Revision 2 Integration In Progress

Revision 2 follows the team's [judge-and-fix development method](docs/DEVELOPMENT_METHOD.md). The running page now exposes the five-room whole-flat plan and synchronized 3D editor: all 20 items can be selected, dragged in 2D, precisely moved/resized through numeric input, or rotated continuously with the side-panel dial. Before/After is immediate; geometric overlap is shown as live warnings rather than rejection. The old sofa-only checker and hard-coded clear gap have been removed.

The assumed flat, walls, doors, windows and item dimensions are documented in [docs/FLAT_DEMO_DATA.md](docs/FLAT_DEMO_DATA.md). Position and multiple user-defined distance locks are now exposed, including validated create/edit/remove and snap-back with attempted/required numbers. The default layout has no locks. Library controls, changed-item markers and re-baselining are the next milestone. The sections below describe historical Revision 1 and will be replaced with current complete documentation at the documentation milestone, not advertised as current functionality.

FitIn helps a non-expert household check whether a replacement sofa can occupy the position of an existing sofa before purchase. This is the first working development version for HacKU 2026, not a professional design tool or a guarantee of real-world fit.

The app is a mobile-first, English / Traditional Chinese website. It uses entered dimensions, a fixed preset room, deterministic geometry, and a simplified interactive 3D view. It does not use AI at runtime.

## HacKU Positioning

Deep Technology Problem Statement 4: **"The Capability That Hasn't Travelled."**

| Element | FitIn mapping |
| --- | --- |
| Capability | Expert spatial-fit and furniture-placement verification, simplified to explicit preset constraints |
| New setting | A normal household choosing replacement furniture |
| Adoption barrier | User expertise: interpreting measurements and spatial constraints |
| Complete task | Replace one sofa at its known centre, check the new dimensions, explain every relevant result, and compare the room visually |

This is a simplified proof of capability. It does not establish professional approval, building-code compliance, safe use, delivery feasibility, or guaranteed fit in an actual flat.

## First-Version Workflow

1. Confirm the preset room and enter its assumed height (220-350 cm).
2. Select the existing sofa. It is the only replaceable item in this version.
3. Enter the new sofa's width, depth, and height in centimetres, and choose 0 or 90 degrees.
4. Select **Check replacement**. The old sofa is excluded from obstacles; the new one stays at the old sofa's centre.
5. Read the result: incomplete input, valid at this preset position, or invalid at this position, with numeric explanations.
6. A valid check enables **After** and displays the replacement. **Before** restores the existing sofa.
7. Editing dimensions, room height, or orientation clears acceptance and returns to Before. Check again to accept revised values.

Reset Demo restores the preset and camera while retaining the selected language. Reset View changes only the camera.

## Implemented Features

- Responsive desktop and narrow-mobile layout, bilingual labels, errors, names, source information, and results.
- Decimal input validation, per-field accessible errors, keyboard interaction, and touch-sized controls.
- Room-boundary, furniture-collision, reserved-zone, and height checks returning all violations.
- Numeric overflow and overlap explanations and deterministic correction suggestions.
- Adjustable room height; 0/90-degree sofa orientations; fixed-centre replacement.
- Dimensionally bounded, reusable box-composition sofa; fixed furniture, floor, and three walls.
- Mouse/touch OrbitControls, wheel/pinch zoom, zoom buttons, reset camera, and guarded Before/After comparison.
- No external models, textures, fonts, expensive effects, or shadows.
- Browser-only state and calculations, with textual results independent of WebGL availability.
- Geometry, acceptance-state, and bilingual-message tests.

## Explicit Non-Goals

There is no camera access, upload, photo collection, OCR, AI image or style analysis, scanning, AR, photorealism, downloaded 3D asset, account, persistence, database, backend, API route, analytics, paid runtime API, or cloud deployment. The app does not solve layouts, search other positions, move fixed furniture, drag furniture, or analyse delivery routes, lifts, corridors, or doorways. No Vercel or other deployment was performed.

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
	components/            Header, progress, source panel, 3D viewport/models
	features/fit-check/     Reducer, orchestration, form, results
	lib/geometry/          Input parsing, footprints, placement checks
	data/                  Fixed demo assumptions and source links
	i18n/                  Typed English / Traditional Chinese dictionaries
	types/                 Domain contracts and discriminated results
docs/                    Architecture, decisions, test plan, compliance
```

Geometry never imports React, Three.js, or translation functions. The UI translates stable issue codes and numeric parameters. The 3D renderer consumes dimensions but never determines whether a placement is valid. Accepted results and live input are separate: data edits cannot keep an old valid After scene visible.

Further documentation:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md)
- [docs/HACKATHON_COMPLIANCE.md](docs/HACKATHON_COMPLIANCE.md)

## Geometry and Coordinates

Domain units are **centimetres**. The room origin is the front-left floor corner. X increases left to right, Y is vertical, and Z increases front to back. Furniture positions are footprint centres on X/Z. Every model rests on Y = 0. Rotation is around Y; at 90 degrees, footprint width and depth are swapped.

The room is X = 0-420 and Z = 0-300. A candidate remains at X = 200, Z = 250. Checks use axis-aligned rectangles after rotation. Boundary and zone/obstacle edge touching are allowed. A documented epsilon of **0.000001 cm** is used for boundary and overlap comparisons; positive overlap must exceed epsilon on both axes. Height uses candidate height <= entered room height.

Input must be a finite, positive decimal number. Blank, zero, negative, malformed, NaN, infinity, scientific notation, unit suffixes, and comma-separated values produce **incomplete**, not invalid fit. Width/depth above 1000 cm, height above 500 cm, and room heights outside 220-350 cm are also incomplete inputs. Values are rejected, never silently clamped.

All relevant placement checks run after input validation. Collision checks exclude only the replaced sofa, leaving the other furniture fixed. A boundary-only suggestion accounts for the fixed centre: an axis reduction must be twice the greatest side overflow on that axis. Clearing a boundary does not establish a maximum product size or guarantee that collision and reserved-zone checks will pass.

## Demo Data

**All dimensions below are team assumptions from the earlier specification, not Housing Authority-certified measurements.**

Room ID: `concord1-option1-2b-demo-living-room`. Room: 420 cm wide, 300 cm deep, default height 260 cm; editable height 220-350 cm. English name: Living / Dining Room Demo. Traditional Chinese name: 客飯廳示範空間.

| Item ID | Name (English / Traditional Chinese) | W x D x H (cm) | Centre X / Z (cm) | Rotation | Replaceable |
| --- | --- | --- | --- | --- | --- |
| `old-sofa` | Existing sofa / 現有梳化 | 180 x 80 x 82 | 200 / 250 | 0 | Yes |
| `coffee-table` | Coffee table / 茶几 | 100 x 55 x 42 | 200 / 150 | 0 | No |
| `tv-console` | TV console / 電視櫃 | 180 x 40 x 50 | 200 / 25 | 0 | No |
| `side-table` | Side table / 邊几 | 40 x 40 x 45 | 340 / 250 | 0 | No |

| Reserved zone | Centre X / Z (cm) | W x D (cm) | Meaning |
| --- | --- | --- | --- |
| `entrance-zone` | 45 / 50 | 90 x 100 | Entrance reserved zone / 入口預留區 |
| `sofa-table-clear-zone` | 200 / 191.25 | 220 x 27.5 | Configured sofa-table clear zone / 已設定梳化與茶几預留區 |

Both zones are configured demo preferences, not building regulations or universal safety standards.

The default replacement is **220 x 90 x 85 cm, orientation 0**. Its footprint is X = 90-310, Z = 205-295, so it touches the clear-zone edge without overlapping and is valid under current constraints.

Useful reproducible changes:

- Width 250: side-table collision, 5 cm in X and 40 cm in Z.
- Width 450: left overflow 25 cm and right overflow 5 cm, plus furniture collision.
- Depth 100: 5 cm entry into the configured sofa-table clear zone.
- Height 280 with room height 260: height excess 20 cm.
- Default dimensions at 90 degrees: back-wall overflow 60 cm, plus coffee-table and reserved-zone overlap.
- Blank depth: incomplete input.

## Official Floor-Plan Reference

Preset label:

- English: **Concord 1 Option 1 — 2B reference scenario (simplified demo dimensions)**
- Traditional Chinese: **康和一型第一款 — 2B 參考情境（簡化示範尺寸）**

[Hong Kong Housing Authority standard-block typical floor plans](https://www.housingauthority.gov.hk/tc/global-elements/estate-locator/standard-block-typical-floor-plans/index.html)

[Concord 1 official PDF](https://www.housingauthority.gov.hk/common/pdf/global-elements/estate-locator/standard-block-typical-floor-plans/01-Concord1.pdf)

Concord 1 Option 1, 2B is a scenario reference only. The PDF is a typical full-floor plan, not a dimensioned individual-flat plan. This room is a simplified approximation, not an exact reconstruction; no pixel-based measurements were extracted. Actual flats may differ. **Verify the dimensions of your own flat before making a purchase decision.**

## Testing

Run the required gates before committing:

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
```

The automated suite has **50 tests**: 33 geometry/input cases, 11 reducer-state cases, and 6 bilingual-message cases. It covers all required geometry cases, not just the valid demo. Browser verification used desktop and mobile-emulated Chromium, screenshots, canvas-pixel checks, keyboard input, real pointer clicks/drag, and live dimension changes. These checks are not a measured household user study. Physical-device pinch/zoom and Safari/Firefox verification remain unperformed. See [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Privacy, Data Flow, and Cost

All inputs and calculations stay in the browser. No photo is collected. No account is used. No data is sent to a FitIn backend because there is no backend. Nothing is persisted by the app; reload resets it. No analytics or tracking SDK is included. Fonts, models, and textures are not fetched externally.

Initial page/assets are served by the local Next.js server. Opening an official-source link visits the Housing Authority website; browser networking and that site's policies then apply. Normal browser and GitHub/npm network activity during development is outside the application workflow. Next CLI telemetry was disabled in the implementation environment; other developers can opt out with `npm exec -- next telemetry disable`.

The first version uses **no paid runtime API**. This is not a promise that every future version, infrastructure choice, or service will be free.

## Limitations and Error Statement

- The floor plan and furniture are simplified approximations. Actual flats may differ; user measurements can be wrong.
- Only rectangular footprints are checked. Irregular shapes and compressible furniture are not modelled.
- Doors, delivery routes, wall fixtures, skirting boards, pipes, and other unconfigured constraints are not modelled.
- Only the selected fixed position is checked. Invalid here does not mean the item cannot fit elsewhere in the flat.
- Reserved zones are demo preferences, not safety standards or regulations.
- The 3D appearance is illustrative, not photorealistic. WebGL availability and device performance vary; textual checking does not depend on rendering success.
- A valid result means only that the candidate satisfies the constraints currently implemented for this preset and selected position.
- This is not professional, structural, accessibility, or building-code advice, design approval, delivery-route verification, or a guarantee of real-world fit.

## AI Coding-Assistant Use

GitHub Copilot assisted with implementation, tests, documentation, and browser-based verification. AI assistance is not a runtime feature. Team members must review the generated code, numerical assumptions, translations, source attribution, dependency constraints, and HacKU rules. Passing automated checks is not a substitute for human or household usability review.

## Future Roadmap (Not Implemented)

Potential later work, subject to a new agreed scope: measured and versioned room scenarios; additional replaceable furniture categories; measurement uncertainty; accessibility and physical-device testing; and a timed comparison against the current tape-measure/product-specification/manual-reasoning method. Scanning, AI, AR, delivery analysis, or deployment would require separate requirements and validation. None is presented as working in this version.