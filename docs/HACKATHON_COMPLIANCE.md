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

1. Load five assumed rooms with uniform walls, real door gaps/swing zones and visual windows, with no furniture and no corridor. On request, add twenty team-prepared example placements for the whole flat or one room, skipping blocked ones with reasons.
2. Select any item; drag in the pointer-based 2D plan or use numeric X/Z/dimensions and continuous-angle dial/input. The same state appears in 3D.
3. Resize or replace manually at the same centre/angle, or use one of fourteen library presets; add in a free initial spot or delete with related-lock cleanup.
4. Run pure SAT, penetration/translation, overlap clipping and convex-distance checks; show every furniture/wall/door/envelope/height issue in text and both views.
5. Allow temporary overlap; only optional position/distance locks reject edits and restore the last accepted pose with numeric bilingual messages.
6. Compare independent baseline/current snapshots immediately, with ghost outlines and changed/removed markers; set a new baseline without camera reset.
7. Keep all names, input/lock/issues/source messages bilingual. Reset returns to the empty flat with empty locks while keeping language, and can be undone like any other layout change.

There are no fake APIs, predetermined fit outcomes, hidden layout solving, or unimplemented features advertised as available.

## Open-Source Frameworks and Libraries

| Library | Purpose |
| --- | --- |
| Next.js | App Router, local asset serving, static page generation, build toolchain |
| React / React DOM | Client state and accessible interface |
| TypeScript / type definitions | Strict domain, geometry, and UI contracts |
| Tailwind CSS / PostCSS plugin | CSS tooling and responsive interface |
| Three.js | Simplified WebGL room and furniture primitives |
| React Three Fiber 9 | Stable React 19-compatible scene renderer |
| Drei / transitive three-stdlib | Existing OrbitControls and edge rendering |
| Lucide React | Tool icons |
| Vitest | Automated deterministic tests |
| ESLint / eslint-config-next | Static quality checks |

The npm lockfile records direct and transitive dependencies and upstream licences. README contains versions and upstream credits. No externally downloaded model, texture, reference-plan image, or PDF is redistributed. No project software licence has been added without the owner's request.

## AI Coding-Assistant Disclosure and Review

GitHub Copilot assisted with code, geometry tests, translations, documentation, and local browser verification. Revision 3 was implemented with Claude Code (Anthropic). There is no runtime AI service in FitIn. The team must review all generated code and wording, validate the geometry independently, verify Traditional Chinese terminology, confirm source attribution, and disclose AI assistance according to event rules. Automated checks do not replace required human review.

## Cost Statement

Revision 2 uses no paid runtime API, cloud deployment, database, model inference or paid asset. It runs locally with unchanged open-source dependencies. Development equipment, internet and coding-assistant subscriptions are outside that runtime statement. Future versions may incur costs; no perpetual-free claim is made.

## Error and Limitation Statement

The floor plan is a simplified approximation using team demo assumptions. The Housing Authority PDF is a typical full-floor plan, not a dimensioned individual-flat plan; actual flats may differ and user measurements can be wrong.

Only rotated rectangular furniture footprints, rectangular walls, conservative configured door swings, envelope and ceiling are checked. Window sill/clearance, irregular shapes, compressible furniture, delivery routes, wall fixtures, skirting boards, pipes, plumbing and vertical door/lintel passage constraints are not modelled. Swing zones and user locks are configured constraints, not regulations or universal safety standards.

No issues means only that the displayed layout has no warning under currently implemented constraints. Issues do not prove impossibility elsewhere, and user locks do not certify safety. This is not professional, structural, accessibility or building-code advice, design approval, delivery verification or guaranteed real-world fit. No automatic solver, wall-distance rule, scanning/AI/AR/account/backend/deployment or 3D furniture dragging is presented as working.

## What Data Leaves the Device

No entered measurement, fit calculation, photo, account, or private household data is sent to a FitIn backend: none exists. Inputs are local, transient React state. The app has no persistence or analytics.

The browser loads application code/assets from the local Next server. Choosing an official reference link visits the Housing Authority website, which receives normal browser requests; this is not a FitIn upload. Development uses ordinary npm/GitHub/browser networking, and an AI assistant may receive repository/tool context during implementation. Those development activities are outside the application workflow; no credentials or private household data should be supplied. Next CLI telemetry was disabled in the implementation environment.

## Evidence Still Needed From the Team

- Human code, assumption, and bilingual-terminology review and confirmation of event rules/provenance.
- A clear recorded current task, including arbitrary-angle overlaps, incomplete input, multiple locks/bounce, library add/delete/replace and immediate Before/After.
- Participant consent and a small non-expert usability study; no such study has been claimed as completed.
- A controlled comparison with the current manual method: tape measure, product specification, and manual spatial reasoning/sketch. Define matched tasks, success criteria, timing, explanation comprehension, and measurement/error rates before collecting results.
- Actual-room measurements, measurement uncertainty, and reference/source review before claiming relevance to a particular flat.
- Physical-device touch, accessibility, and broader browser testing.
- Screenshots and reproducible logs of the final checked commit for presentation, separate from temporary implementation-session screenshots.

No measured time saving, accuracy advantage over the manual method, household purchase outcome, professional approval, or official event acceptance is asserted by this version.