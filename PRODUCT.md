# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A household in a Hong Kong public-housing flat (Housing Authority standard blocks, roughly 300–650 sq ft) planning or changing its furniture layout at home, on a laptop at a desk: mouse and keyboard, a big screen, an unhurried session, often with family looking on. They are not interior designers and cannot read a floor plan's notation fluently or picture whether a sofa, bed or wardrobe really fits. This household comes first whenever design choices pull apart (confirmed 4 Oct 2026).

Secondary: HacKU 2026 judges, who try the same editor on a booth laptop for a few minutes. Touch on a tablet or phone must keep working (pinch, drag, bottom-sheet inspector), but it is not the primary scene.

## Product Purpose

Let a non-expert household arrange or replace furniture across a whole flat and see, with exact numbers, what collides, what blocks a door swing, and what breaks their own spacing rules, before anything is bought or moved. Success is a layout the household understands and trusts, with every problem named and measured in centimetres, and no false promise of fit.

## Positioning

An expert's space-planning check, made usable by a family: deterministic in-browser geometry (rotated footprints, exact overlap polygons, edge distances, door-swing zones, user locks) on a shared 2D plan and 3D view of their own flat, read from the Housing Authority floor plan they already have. AI never measures or checks anything; it only ever changes appearance (a photo-to-3D look) or suggests which rooms a plan shows, and every size comes from the drawing. Nothing leaves the device unless the user explicitly sends it.

## Operating Context

- Home, laptop, indoor light, relaxed attention; sessions of minutes to an hour, returning to tweak.
- The flat is picked from **Flat plan**: Harmony 1 Option 4 preset (selected at start), the five-room demo flat, or the user's own flat traced from a Housing Authority PDF or picture in a five-step trace wizard.
- Core loop: choose a room, add example or library furniture, drag/rotate/resize in the 2D plan, read issues, lock what matters, compare Before/After, optionally ask the Design assistant for a proposal and accept or reject it.
- Booth: preset flat on a laptop, a judge driving for a few minutes.

## Capabilities and Constraints

- Next.js 16 / React 19 app; react-three-fiber 3D scene (orthographic, demand rendering, capped pixel ratio, no post-processing or shadows); SVG 2D plan with touch pinch/drag; pdf.js trace in the browser.
- One editor screen (no routes): header, toolbar, 2D plan + 3D cards, inspector with four tabs (Furniture, Selected, Constraints, Assistant); the trace wizard replaces the editor in place. From 768 px a one-screen shell with a 340 px inspector; below, page scroll and a non-modal bottom-sheet inspector.
- Every label, message, issue and consent screen exists in English and Traditional Chinese; the language switch is global.
- Optional AI services (fal.ai TRELLIS look, vision plan reading) are off unless enabled by env and always behind a bilingual consent screen.
- No accounts, no persistence beyond a downloaded `.fitin-flat.json`, no analytics, no externally fetched fonts, models or textures at runtime.
- Units are centimetres. 44 px touch targets are a code convention.

## Brand Commitments

- Name: **FitIn 放得落** (confirmed 4 Oct 2026); the Cantonese name is part of the brand.
- Honesty is part of the product voice and must stay visible: the demo flat is a "simplified demo assumption", the Harmony preset an "approximate, incomplete PDF trace" with "~" sizes, example placements are "not computed recommendations", the Design assistant's proposals are "Heuristic proposal · not AI · not applied", and "no issues" never means guaranteed fit.
- Must not feel cartoonish or toy-like (it would undermine trust in the measurements) or busy (confirmed 4 Oct 2026).

## Evidence on Hand

- Harmony 1 Option 4 preset (approximate page-4 PDF trace, twelve example placements) and the five-room demo flat (twenty example placements): `src/data/`.
- Kenney Furniture Kit low-poly models (CC0): `public/models/furniture/`.
- Housing Authority standard-block floor plans are referenced by official link; none are bundled.
- No user studies, testimonials, measured-flat accuracy figures or physical-phone testing exist yet; do not imply them.

## Product Principles

1. Measured, not guessed: every number shown comes from the geometry, and its limits are stated beside it.
2. The household's flat, the household's words: plain bilingual language, no designer or CAD jargon.
3. One flat, two views: the 2D plan and 3D scene always show the same truth, and the plan is where editing happens.
4. Nothing hidden, nothing sent: state and checks stay on the device; anything sent is shown and consented first.
5. Calm under complexity: many tools, but one task in focus at a time.

## Accessibility & Inclusion

- Bilingual EN / 繁中 throughout, with correct `lang` attributes.
- Keyboard operable (focus-visible outlines, accessible rotation dial and numeric inputs); 44 px targets for touch.
- A formal accessibility and contrast review is still pending (TEST_PLAN); aim for WCAG 2.2 AA contrast in the redesign.
- Respect `prefers-reduced-motion`.
