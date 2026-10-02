# Decisions

## One Living / Dining-Room Demo

One deterministic scenario makes the complete first-version task testable during the event. Multiple floor plans would increase measurement, attribution, UI, and verification obligations before the core task is established.

## Dimensions Are Assumptions

Concord 1 Option 1, 2B is a public scenario reference. Its typical full-floor PDF is not a dimensioned individual-flat plan. The 420 x 300 x 260 cm room and furniture positions come from the team's earlier demo specification, not pixel extraction or Housing Authority certification. The data includes an explicit `team-demo-assumptions` dimension source, and both UI languages carry the limitation.

## Sofa-Only Replacement

Replacing a known sofa is one complete household purchase task. Furniture categories and replaceable flags remain data-driven, but broader replacement controls or category-specific models are not silently implemented.

## Fixed-Centre Replacement

The replacement stays at X = 200, Z = 250. This avoids claiming to solve layouts or search alternative positions. The old sofa alone is excluded from obstacles; every other furniture item remains fixed. Corrections never recommend moving fixed furniture.

## Only 0 / 90 Degrees

These orientations support predictable product comparison while retaining exact axis-aligned footprint calculations. Arbitrary-angle collision detection would require different geometry and additional tests; it is out of scope.

## Input Strings and Incomplete Results

Text inputs with decimal input mode preserve blanks, malformed values, and pasted content for explicit validation. Automatic browser number-input sanitization could make malformed input indistinguishable from missing data. Width/depth/height and room height share the pure parser. Limits reject extreme values instead of silently clamping them. Invalid input is not evidence of an invalid spatial fit.

## No Backend or Persistence

The task needs only preset data, user-entered numbers, deterministic geometry, and local state. A backend, database, account, or API would add privacy and operational costs without helping this version. Reload may reset the app. Next is used for its App Router/toolchain and static page/assets, not server-side fit checking.

## No Photorealism or Scanning

Dimensionally accurate simplified boxes communicate the geometric task without implying recognition or measurement accuracy. There are no photos, OCR, AI models, camera permissions, AR, textures, or downloaded furniture models. Visual appearance is illustrative.

## Reserved Zones Are Preferences

Both entrance and sofa-table zones are configured demo preferences. In particular, the 27.5 cm sofa-table strip is not a building regulation, accessibility clearance, or universal safety standard. The checker enforces only the configured rectangles.

## Accepted Result Is Separate From Current Input

Editing any relevant input invalidates acceptance immediately. A previous successful scene must never be confused with unchecked new values. The reducer tests this contract independently of rendering. Current values are still recomputed for input feedback, and a new explicit Check is required to enable After again.

## Stable Compatible Dependencies

Stable Next.js 16.3.8 supports React 19.3.0. Stable R3F 9.8.1 supports this React version; Drei 10.7.9 targets R3F 9. All direct versions are pinned with an npm lockfile. No alpha R3F or force/legacy peer override is used.

ESLint 10 was checked but rejected: Next's bundled import/react/accessibility plugins declare peer ranges that exclude it. ESLint 9.39.5 resolves the actual peer graph, although npm reports this major as out of support. Upgrade the complete lint stack when stable compatible plugins/configuration are available rather than forcing the major. The upstream Three.js Clock deprecation warning is not suppressed and does not produce an application error.

## Lightweight, Inspectable Rendering

Centimetres convert to metres at the renderer boundary only. The sofa's composed bounding dimensions match the domain data. Demand rendering, capped pixel ratio, no shadows, one directional light, and no post-processing keep the scene restrained. Orbit is bounded to the open front, zoom distance/elevation are limited, and reset flushes damping so it is deterministic.

Local operating-system font families avoid font-network dependencies. Lucide supplies UI tool icons. The static FitIn icon is original project markup, not an external asset. Next-generated agent metadata and the floating dev indicator are disabled to avoid unintended root files and obstructed captions.

## No Repository Licence Added

The owner has not requested a software licence. Upstream libraries retain their own licences and attribution. The team must decide project licensing separately.

## No Deployment or Benchmark Claims

Only local development and production-build verification are included. There is no cloud deployment. Browser verification is not a household user study, an official event approval, or a measured comparison with the manual method.