# Architecture

## Module Boundaries

| Area | Responsibility | Must not do |
| --- | --- | --- |
| Domain types | Room, dimensions, furniture, zones, inputs, checks, violations, discriminated FitResult | Depend on React or rendering |
| Preset data | Team demo assumptions, localized names, default inputs, official source URLs | Claim Housing Authority-certified measurements |
| Geometry | Decimal parsing, rotated AABBs, overlap, placement validation, boundary reductions | Format user-facing text or determine 3D appearance |
| i18n | Typed dictionary keys, templates, localized numeric explanations | Change geometric outcomes |
| Fit-check feature | Reducer, current-input recomputation, acceptance, form, result presentation | Reimplement geometry |
| Scene components | Unit conversion, dimensionally bounded models, camera controls, Before/After rendering | Treat a rendered mesh as evidence of a valid fit |
| App Router shell | Static metadata, CSS, home page, client entry | Process user measurements on a backend |

## State Flow

The client orchestrator owns one reducer. Form values remain strings so blank or malformed input cannot be lost through a browser's number-input sanitization. The reducer also owns language, selected furniture ID, the accepted result, comparison view, validation visibility, and a demo revision used to remount/reset the camera.

1. Every input render calls the same pure replacement checker with current values.
2. A Check action stores that current result; only valid results enable and select After.
3. A field, orientation, or selection change clears the stored result and sets Before. No stale accepted dimensions reach the scene.
4. Once checking has been attempted, current incomplete-input errors update as fields are corrected. The first bad field receives focus on submission.
5. Language changes retranslate existing numeric results without discarding acceptance.
6. Reset Demo restores inputs and Before, clears results, resets the camera, and keeps the language.

The default sofa is selected in the radio list. Replaceable options come from preset data, not a duplicated UI list. Only sofa replacement is implemented; another category would require an explicit rendering/form extension.

## Geometry Flow

Input parsing rejects missing, malformed, nonfinite, nonpositive, or out-of-range values and returns all input issues as `incomplete`. The domain model restricts orientation to 0 or 90 degrees. Preset configuration errors, such as an unknown replaceable ID, throw rather than pretending the placement is valid.

For complete input, the checker copies the selected old sofa's X/Z centre. Rotation 90 swaps width/depth for the footprint. It collects per-side room overflow, candidate height excess, overlap with all non-replaced furniture, and overlap with all reserved zones. No check short-circuits another relevant placement check.

Overlap must exceed 0.000001 cm on both axes. Boundary comparisons use the same epsilon. Touching edges is allowed. Height is compared directly. Checks expose pass/fail for boundary, collision, reserved zones, and height; violations retain IDs, localized domain names, and unrounded numeric values. FitResult is a discriminated `incomplete | valid | invalid` union.

Boundary suggestions are geometry-derived: twice the maximum side excess on the relevant footprint axis. i18n maps that axis back to width or depth according to orientation. Suggestions explicitly do not certify an exact maximum product size when other checks can still fail.

## Rendering Flow

The viewport is a client component. Its scene is dynamically imported with server rendering disabled, so WebGL and browser-dependent code do not execute during Next's static prerender. The outer app contains no API route or server action.

The domain stays in centimetres. Rendering uses 0.01 metres per cm and offsets the room origin to a convenient Three.js visual centre. Floor upper surface and every furniture base are Y = 0. Box centres are placed at half height. The reusable sofa composes base, back, arms, and cushions whose combined outer bounds exactly equal its width/depth/height.

Before renders all existing furniture. After removes the replaced ID and renders only the candidate from a stored valid result. Invalid results have textual explanations and keep Before; there is no ambiguous invalid red preview.

The room has a floor, back/left/right walls, an open front and ceiling, ambient light, one directional light, translucent reserved-zone markers, and no shadows or downloaded assets. R3F uses demand rendering and caps device pixel ratio at 1.5. OrbitControls restrict distance, elevation, and azimuth; panning is off. Explicit camera commands clear pending damping before moving the camera, so Reset View returns to the same initial framing.

A React error boundary keeps form/result use available if the scene fails. Native canvas fallback text is not used, preventing a misleading unavailable message in the accessibility tree when WebGL is healthy. The DOM includes a textual item legend, dimensions, model disclaimer, and results.

## Translation Approach

English keys define the `TranslationKey` union. The Traditional Chinese dictionary must satisfy `Record<TranslationKey, string>`. Domain furniture/zone names use language-indexed names. Input and violation codes select typed templates in the UI layer; centimetre values are formatted separately with Intl.NumberFormat.

The language switch updates labels, validation associations, explanations, source information, furniture names, document title, and the HTML language attribute. No internationalization framework or server language routing is needed.

## Why Geometry and 3D Are Separate

Rendering, lights, camera angle, and visual overlap are not reliable placement validation. Independent geometry makes the result deterministic, testable without WebGL, and inspectable by the team. A scene failure cannot turn an invalid placement into a valid one, and a valid-looking illustration cannot bypass the checker.

## Data and Network Boundaries

There are no uploads, accounts, databases, API calls, persistence, analytics, external fonts, or runtime AI services. Measurements are React state only. Next serves the static page and assets. Official-source links navigate outside the app only when selected; no PDF is fetched as part of scene rendering.