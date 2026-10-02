# HacKU Compliance and Evidence Notes

## Event Intent and Provenance

This first-version implementation is intended to be created during the HacKU 2026 event, starting from the existing repository's minimal README while preserving its Git history. This document records implementation intent, not an official eligibility or compliance decision. The team must retain Git timestamps and event records and verify the final event rules, timing, third-party-library allowance, and AI disclosure requirements.

## Problem Statement Mapping

Deep Technology Problem Statement 4, **"The Capability That Hasn't Travelled."**

| Requirement | Implemented mapping |
| --- | --- |
| Capability | Explicit spatial-fit/furniture-placement checks, simplified from expert reasoning |
| New setting | A normal household selecting replacement furniture before purchase |
| Adoption barrier | Lack of expertise in spatial measurements and constraints |
| Complete first-version task | Load one scenario, select sofa, enter replacement dimensions/orientation, check at old centre, explain results, and visually compare valid Before/After |

The demo is a simplified proof of capability, not proof of professional-level design reasoning or verified accuracy for all Hong Kong flats.

## Complete-Task Coverage

1. Preset living/dining room and existing furniture are loaded from explicit assumption data.
2. The user confirms height and selects the sofa from data-driven replaceable options.
3. Width/depth/height and 0/90-degree orientation are entered and validated.
4. The replacement centre is fixed at the old sofa centre; old-sofa is removed from collision obstacles.
5. Every implemented boundary, height, furniture, and reserved-zone check runs deterministically.
6. Incomplete input is distinct from invalid fit. Numeric explanations and suggestions are bilingual.
7. A valid check enables After and renders the new sofa. Before restores the original configuration.
8. Data edits clear acceptance until checked again. Reset Demo restores the demonstration.

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

GitHub Copilot assisted with code, geometry tests, translations, documentation, and local browser verification. There is no runtime AI service in FitIn. The team must review all generated code and wording, validate the geometry independently, verify Traditional Chinese terminology, confirm source attribution, and disclose AI assistance according to event rules. Automated checks do not replace required human review.

## Cost Statement

The first version uses no paid runtime API, cloud deployment, database, model inference, or paid asset. It runs locally with open-source dependencies. Development equipment, internet access, and coding-assistant subscriptions are outside that runtime statement. Future versions may incur costs; no perpetual-free claim is made.

## Error and Limitation Statement

The floor plan is a simplified approximation using team demo assumptions. The Housing Authority PDF is a typical full-floor plan, not a dimensioned individual-flat plan; actual flats may differ and user measurements can be wrong.

Only rectangular footprints, height, preset obstacles, and configured reserved rectangles at one selected position are checked. Irregular shapes, compressible furniture, doors, delivery routes, wall fixtures, skirting boards, and pipes are not modelled. Reserved gaps are demo preferences, not building regulations or universal safety standards.

Valid means only that the candidate satisfies the constraints currently implemented for this preset and selected position. Invalid means not valid here under those constraints, not impossible everywhere in the flat. This is not professional, structural, accessibility, or building-code advice, design approval, delivery verification, or a guarantee of real-world fit.

## What Data Leaves the Device

No entered measurement, fit calculation, photo, account, or private household data is sent to a FitIn backend: none exists. Inputs are local, transient React state. The app has no persistence or analytics.

The browser loads application code/assets from the local Next server. Choosing an official reference link visits the Housing Authority website, which receives normal browser requests; this is not a FitIn upload. Development uses ordinary npm/GitHub/browser networking, and an AI assistant may receive repository/tool context during implementation. Those development activities are outside the application workflow; no credentials or private household data should be supplied. Next CLI telemetry was disabled in the implementation environment.

## Evidence Still Needed From the Team

- Human code, assumption, and bilingual-terminology review and confirmation of event rules/provenance.
- A clear recorded demo of the complete task, including valid, invalid, incomplete, edited-data, and Before/After cases.
- Participant consent and a small non-expert usability study; no such study has been claimed as completed.
- A controlled comparison with the current manual method: tape measure, product specification, and manual spatial reasoning/sketch. Define matched tasks, success criteria, timing, explanation comprehension, and measurement/error rates before collecting results.
- Actual-room measurements, measurement uncertainty, and reference/source review before claiming relevance to a particular flat.
- Physical-device touch, accessibility, and broader browser testing.
- Screenshots and reproducible logs of the final checked commit for presentation, separate from temporary implementation-session screenshots.

No measured time saving, accuracy advantage over the manual method, household purchase outcome, professional approval, or official event acceptance is asserted by this version.