# Test Plan

## Automated Gates

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Vitest runs pure TypeScript tests in Node; it needs no DOM, GPU, backend, account, or secret. The committed suite contains **50 cases across three test files**: 33 geometry/input, 11 reducer, and 6 translation/message cases.

## Required Geometry Outcomes

| Case | Expected result |
| --- | --- |
| Default 220 x 90 x 85, orientation 0 | Valid, four passing checks, centre 200 / 250 |
| Replacement overlaps the old sofa's footprint | Valid because old-sofa is excluded |
| Blank or whitespace-only dimension | Incomplete with missing-field issue |
| Zero or negative dimension | Incomplete with positive-value issue |
| NaN, infinity, malformed text, units, comma, scientific notation | Incomplete, never accepted as a fit |
| Value above UI maximum | Incomplete; no silent clamp |
| Multiple missing fields | All input issues returned |
| Width 450 | Left overflow 25 cm, right overflow 5 cm, other relevant violations retained |
| Height 280 with room height 260 | Height excess 20 cm |
| Width 250 | Side-table collision, X overlap 5 cm, Z overlap 40 cm |
| Depth 100 | Configured clear-zone entry, Z overlap 5 cm |
| Width 240 | Exact side-table edge touch allowed |
| Depth 100 with no reserved zones | Exact back boundary touch allowed |
| Candidate matches room footprint at centred test location | All four room-side touches allowed |
| Orientation 90 | Footprint dimensions swap; default back overflow 60 cm |
| Width 500, depth 260, height 280 | Boundary, collision, reserved, and height violations all returned |
| Sub-epsilon edge overlap / larger real overlap | First accepted; latter rejected |
| Height 250 with room height 260 then 220 | Valid then invalid by 30 cm |
| Room height outside 220-350 or missing/nonfinite | Incomplete |
| Decimal dimensions | Preserved without silent rounding |
| Boundary reduction at fixed centre | Twice maximum side overflow, not just overflow |
| Entrance-zone overlap in a focused alternate test fixture | Reserved violation with zone ID |
| Exact configured-zone edge contact | Allowed |

Additional reducer tests ensure After cannot be enabled without acceptance; all relevant edits clear acceptance and select Before; language changes preserve results; invalid checks retain Before; and Reset Demo restores defaults/language/camera revision correctly.

Translation tests assert nonempty identical keys, identical template parameters, localized input fields and obstacle names, numeric explanations, and orientation-correct correction wording.

## Desktop Checklist

1. Start with `npm run dev`; load the room and confirm all four furniture items and both reserved-zone markers are visible from Reset View.
2. Submit defaults; check four passes and a visible replacement in After.
3. Toggle Before/After; check original width 180 vs replacement 220 and distinct canvas output.
4. Change width to 250; confirm immediate loss of acceptance/After, then numeric collision after checking.
5. Change width to 450; confirm every applicable failure and the boundary-specific 50 cm reduction, without claiming other checks will pass.
6. Blank depth and try malformed text; confirm incomplete, field association, focus, and correction.
7. Change orientation and room height; confirm genuinely recomputed outcomes.
8. Reset Demo; confirm defaults, Before, cleared result, camera reset, and preserved language.
9. Use keyboard to reach controls and submit; inspect visible focus, labels, and text-based success/failure.
10. Open scenario details and inspect source links and limitations without embedding the PDF.

## Mobile and Bilingual Checklist

- Check 320 and 375 px widths: no horizontal overflow, toolbar collision, cut-off button, or mid-word step label.
- Check 768 and 1440 px as additional breakpoints.
- Confirm button height is at least 44 px and numeric fields use decimal input mode.
- Enter values, correct errors, and submit in both English and Traditional Chinese.
- Change language while a valid, invalid, or incomplete result is visible; names, explanations, source disclaimers, and document language/title must change.
- Inspect long text, field errors, result lists, and expanded source details in the narrow layout.
- Verify data edits disable After regardless of language.

## 3D Interaction Checklist

- Demand-rendered canvas is nonblank at desktop/mobile sizes; sample screenshot pixels, not just the canvas element's existence.
- Mouse drag changes view; front-facing azimuth bounds and elevation limits prevent an unusable behind-wall/below-floor view.
- Zoom buttons change framing; wheel and touch pinch are supplied by OrbitControls.
- Reset View restores the same original angle, target, and distance even following damped motion.
- Before shows old-sofa only; After shows the accepted candidate only.
- Room-height changes update the room model; furniture sits on the floor and respects domain dimensions.
- No external texture/model assets are requested and no application console errors occur.
- If WebGL fails, form and result checking should remain available with a textual scene error.

## Verification Performed During Implementation

Implementation-session browser checks on Windows used Chromium through VS Code browser tools. These are engineering smoke checks, not a household user study.

- Desktop and mobile-emulated screenshots were inspected; the initial camera was corrected to expose all four items.
- Playwright-driven keyboard/input checks covered the default valid result, Before/After rendering and pixel differences, stale acceptance, collision, numeric boundary reduction, missing/malformed input, reserved-zone failure, orientation, height, language, source details, and Reset Demo.
- Layout and nonblank canvas-pixel checks passed at 320, 375, 768, and 1440 px. English/Traditional Chinese step labels were measured at 320 px; toolbar overlap and touch target heights were checked.
- Real Chrome pointer clicks validated default acceptance; a canvas drag changed the camera. Zoom and Reset View were inspected in screenshots; pending damping was fixed so reset restores original framing.
- After adding the static icon, browser checks reported no application console errors or external requests during the measured replacement workflow. One upstream THREE.Clock deprecation warning remains visible.
- Runtime dependency audit reported zero vulnerabilities at implementation time.

The integrated browser's element screenshot capture can temporarily alter its emulated viewport; verification forced fresh viewport sizes and measured layout before pixel capture. Stable Chrome screenshots provided an independent visual check. One full-page mobile capture timed out; viewport capture and live canvas/context checks succeeded. Screenshots are session artifacts, not a committed benchmark dataset.

## Known Untested Areas

- Physical Android/iOS touch gestures, pinch zoom, small-device performance, virtual keyboards, and orientation changes.
- Safari/Firefox, screen-reader user testing, browser zoom extremes, and a formal accessibility audit.
- Forced WebGL context loss or unsupported-GPU fallback on real hardware.
- Delivery access, structural/building/accessibility compliance, irregular furniture, measurement uncertainty, and actual-flat accuracy. These are not implemented features to certify.
- Household usability, comprehension of the disclaimers, purchase outcomes, and timed comparison against the current manual method.

Browser checks are not a committed automated E2E runner. Re-run this checklist when changing UI, rendering, or framework versions, and retain team-reviewed evidence before presentation.