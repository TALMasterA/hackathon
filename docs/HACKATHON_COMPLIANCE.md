# HacKU Compliance and Evidence Notes

## Event Intent and Provenance

FitIn's implementation and Revision 2 upgrade are intended to be created during HacKU 2026 in the existing repository, preserving its history. Revision 2 follows the team's judge -> list -> fixing prompt -> scoped implementation -> judge loop. This records intent, not an official eligibility decision. The team must confirm event timing/rules, third-party allowance and AI disclosure requirements.

## Problem Statement Mapping

Deep Technology Problem Statement 4, **"The Capability That Hasn't Travelled."**

| Requirement | Implemented mapping |
| --- | --- |
| Capability | Explicit spatial-fit/furniture-placement checks, simplified from expert reasoning |
| New setting | A normal household selecting replacement furniture before purchase |
| Adoption barrier | Lack of expertise in spatial measurements and constraints |
| Complete current task | Edit or replace furniture in a whole-flat demo, inspect exact rotated warnings, apply optional user locks/bounce-back and immediately compare baseline/current layouts |

The demo is a simplified proof of capability, not proof of professional-level design reasoning or verified accuracy for all Hong Kong flats.

## Complete-Task Coverage

1. Load five assumed rooms with uniform walls, real door gaps/swing zones and visual windows, with no furniture and no corridor, or the user's own flat read from a Housing Authority floor plan (scale from the plan's scale bar, walls snapped to the drawing, optional AI reading of which rooms there are, reviewed by the user), or a saved flat file. On request, add twenty team-prepared example placements for the whole flat or one room, skipping blocked ones with reasons.
2. Select any item; drag in the pointer-based 2D plan or use numeric X/Z/dimensions and continuous-angle dial/input. The same state appears in 3D.
3. Resize or replace manually at the same centre/angle, or use one of fourteen library presets; add in a free initial spot or delete with related-lock cleanup.
4. Run pure SAT, penetration/translation, overlap clipping and convex-distance checks; show every furniture/wall/door/envelope/height issue in text and both views.
5. Allow temporary overlap; only optional position/distance locks reject edits and restore the last accepted pose with numeric bilingual messages.
6. Compare independent baseline/current snapshots immediately, with ghost outlines and changed/removed markers; set a new baseline without camera reset.
7. Optionally give one item its own 3D look from a confirmed product photo (fal.ai TRELLIS); the look is appearance only and every check still uses the item's box.
8. Keep all names, input/lock/issues/source messages bilingual. Reset returns to the empty flat with empty locks while keeping language, and can be undone like any other layout change.

There are no fake APIs, predetermined fit outcomes, hidden layout solving, or unimplemented features advertised as available.

## Open-Source Frameworks and Libraries

| Library | Purpose |
| --- | --- |
| Next.js | App Router, local asset serving, static page generation, build toolchain |
| React / React DOM | Client state and accessible interface |
| TypeScript / type definitions | Strict domain, geometry, and UI contracts |
| Tailwind CSS / PostCSS plugin | CSS tooling and responsive interface |
| Three.js | Simplified WebGL room and furniture primitives, glTF model loading |
| Kenney Furniture Kit (CC0 asset) | Low-poly furniture appearance, stretched to each checked box |
| React Three Fiber 9 | Stable React 19-compatible scene renderer |
| Drei / transitive three-stdlib | OrbitControls, edge rendering and cached glTF loading |
| fal.ai client (`@fal-ai/client`, MIT) | Server-side upload, queue status and result calls for the optional AI 3D look and the optional AI plan reading |
| pdf.js (`pdfjs-dist`, Apache-2.0) | Rendering a floor-plan PDF and reading its labels in the browser |
| Lucide React | Tool icons |
| Vitest | Automated deterministic tests |
| ESLint / eslint-config-next | Static quality checks |

The npm lockfile records direct and transitive dependencies and upstream licences. README contains versions and upstream credits. Fourteen CC0 furniture models from the Kenney Furniture Kit 2.0 are redistributed in `public/models/furniture/` with the kit's licence file and a README credit. No other externally downloaded model, texture, reference-plan image or PDF is redistributed, except the user-supplied isolated Harmony SVG reference in `public/plans/` that the Harmony preset links to; the Housing Authority plan used to verify the trace was kept outside the repository, and no traced flat is committed. No project software licence has been added without the owner's request.

## AI Coding-Assistant Disclosure and Review

GitHub Copilot assisted with code, geometry tests, translations, documentation, and local browser verification. Revisions 3 and 4 were implemented with Claude Code (Anthropic). Runtime AI is optional and reached only through fal.ai from FitIn's server route handlers after the user confirms sending: TRELLIS (image to 3D model) for a 3D look, and a vision language model (default `google/gemini-2.5-flash` through fal's OpenRouter router) that reads which rooms a floor plan shows. Neither computes or changes a fit check, and the vision model does not decide any measurement: the scale comes from the plan's scale bar and every wall position from the drawing, and the user reviews the result. The team must review all generated code and wording, validate the geometry independently, verify Traditional Chinese terminology, confirm source attribution, and disclose AI assistance according to event rules. Automated checks do not replace required human review.

## Cost Statement

Revision 4 has two optional paid runtime APIs, both through fal.ai: TRELLIS model inference for the AI 3D look (about US$0.02 per model at the time of writing), and the OpenRouter vision router for AI plan reading (billed by the model's tokens; a fraction of a US cent per reading with the default model at the time of writing, at most two requests per reading). Check fal.ai pricing. The look is disabled unless `MODEL3D_ENABLED=true` and limited per server instance to 5 accepted photos per IP per 10 minutes and 60 per day; plan reading is disabled unless `FLOORPLAN_ENABLED=true` and limited to 10 per IP per 10 minutes and 100 per day. There is no cloud deployment, database or paid asset; the Kenney models are CC0. Development equipment, internet and coding-assistant subscriptions are outside that runtime statement. Future versions may incur costs; no perpetual-free claim is made.

## Error and Limitation Statement

The demo floor plan is a simplified approximation using team demo assumptions. Housing Authority PDFs are typical full-floor plans with a metric scale bar but no dimension lines: a flat traced from one is measured approximately (within a fraction of a centimetre of the drawing's own lines on the tested plan), but the drawing is of a typical floor, individual flats and finishes vary, and the AI's reading of rooms can be wrong or incomplete until the user corrects it. Only axis-aligned walls are modelled. User measurements can be wrong.

Only rotated rectangular furniture footprints, rectangular walls, conservative configured door swings, envelope and ceiling are checked. Window sill/clearance, irregular shapes, compressible furniture, delivery routes, wall fixtures, skirting boards, pipes, plumbing and vertical door/lintel passage constraints are not modelled. Swing zones and user locks are configured constraints, not regulations or universal safety standards.

No issues means only that the displayed layout has no warning under currently implemented constraints. Issues do not prove impossibility elsewhere, and user locks do not certify safety. This is not professional, structural, accessibility or building-code advice, design approval, delivery verification or guaranteed real-world fit. An AI look is an approximate, appearance-only reconstruction from one photo and may have the wrong shape or facing. No automatic solver, wall-distance rule, scanning, AI measurement, AI layout or fit analysis, AR, account, database, deployment or 3D furniture dragging is presented as working.

## What Data Leaves the Device

**Measurements, layout and checks never leave the device**: they are local, transient React state. A floor-plan PDF or picture used for tracing is read only in the browser. **Only what the user explicitly chooses to send goes to fal.ai**: for optional AI plan reading, the cropped picture of the user's own flat shown on the consent screen (at most 1536 px), through FitIn's `/api/floorplan` route to fal.ai storage (one-hour expiry requested) and the vision model, with only the room reading returned; for the optional AI look, the photo is resized on the device and sent only after a bilingual consent message and Confirm, through FitIn's `/api/model3d` route to fal.ai storage and TRELLIS (a one-hour expiry is requested for the upload and the result). The finished model is fetched by the server and streamed back; fal URLs and the key never reach the browser. **FitIn stores nothing**: no photo, plan, model, look, layout, account or log of them is kept by the app or its server. The app has no persistence (apart from a flat file the user chooses to download) or analytics. fal.ai's own terms, and those of the model provider behind its router, apply to the pictures it receives.

The browser loads application code/assets from the local Next server. Choosing an official reference link visits the Housing Authority website, which receives normal browser requests; this is not a FitIn upload. Development uses ordinary npm/GitHub/browser networking, and an AI assistant may receive repository/tool context during implementation. Those development activities are outside the application workflow; no credentials or private household data should be supplied. Next CLI telemetry was disabled in the implementation environment.

## Evidence Still Needed From the Team

- Human code, assumption, and bilingual-terminology review and confirmation of event rules/provenance.
- A clear recorded current task, including arbitrary-angle overlaps, incomplete input, multiple locks/bounce, library add/delete/replace and immediate Before/After.
- Participant consent and a small non-expert usability study; no such study has been claimed as completed.
- A controlled comparison with the current manual method: tape measure, product specification, and manual spatial reasoning/sketch. Define matched tasks, success criteria, timing, explanation comprehension, and measurement/error rates before collecting results.
- Actual-room measurements, measurement uncertainty, and reference/source review before claiming relevance to a particular flat; for a traced flat, a tape-measure check of at least one room against its trace.
- Physical-device touch, accessibility, and broader browser testing.
- Screenshots and reproducible logs of the final checked commit for presentation, separate from temporary implementation-session screenshots.

No measured time saving, accuracy advantage over the manual method, household purchase outcome, professional approval, or official event acceptance is asserted by this version.