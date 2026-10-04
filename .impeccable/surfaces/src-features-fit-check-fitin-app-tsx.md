---
version: 1
slug: "src-features-fit-check-fitin-app-tsx"
primary_target: "src/features/fit-check/fitin-app.tsx"
related_targets: []
---

# FitIn 放得落 editor (whole app)

Scope: the single editor screen and everything it swaps in (inspector tabs, flat menu, settings, Design assistant, trace wizard), desktop first at 1280–1600 px, with the mobile bottom sheet kept working. Visitor mode: **Operate**.

Audience and job: a Hong Kong public-housing household at a laptop at home, arranging furniture across their flat and reading exactly what does not fit, in English or Traditional Chinese. Secondary: HacKU judges on a booth laptop.

Constraints: every feature, behaviour, bilingual string, honesty label and data hook stays; one-screen shell from 768 px with a 340 px inspector; 44 px targets; no runtime font, model or texture fetches; plan labels scale by 1/zoom; 3D without post-processing or shadows. Must not feel toy-like or busy.

Build path: code-led (the user declined spending image credits). Chosen in a bolder re-roll.

## Direction contract

THESIS: The flat is printed as two bordered colour plates, the plan and the 3D view, set into a black-and-white lexicon page; every other surface is black type at a fixed measure, ranked by apparatus, not size. Refuses the category default of grey SaaS panels, tinted cards and a blue accent spread over everything.

OWN-WORLD: White paper ground, engraving-black ink for text, rules and controls, one graphite for secondary text. Structure is only hairline rules and a double head rule; no card fills, no shadows except the one lifted ply (menus, mobile sheet). Colour lives only inside plates, in chromolithograph inks: ultramarine selection and windows, chrome-yellow door swings, sepia, emerald, madder and violet furniture, vermilion collisions. Outside plates vermilion appears only as rubric: issues and errors. Serif text face with lining tabular figures; Traditional Chinese in 明體; small tracked capitals for guide words and section heads.

STORY: The household reads its flat as a plate it can edit, sees every problem rubricated in vermilion with its centimetres, and trusts the rest because it is plain black type; they arrange, read the errata, fix, compare Before and After, and accept or reject a proposal.

FIRST VIEWPORT: 1440×900. Header: serif wordmark "FitIn 放得落" left, language switch and Reset right, a double head rule beneath. One toolbar line of standard controls (flat, Flat menu, Before/After, undo/redo, area, settings, Design assistant) with the guide words of the area in view at its right end and the issue count in vermilion small capitals. Main: Plate I (floor plan) and Plate II (3D view) side by side, each in a thin black frame, tools in one rail inside the plate's top edge, a numbered plate caption beneath ("PLATE I · Floor plan · ~1,011 × 760 cm"). Right: the 340 px inspector, small-capital tabs over a rule, a tight black column with hanging heads; the primary action is the one ink-filled button in view ("Apply example layout").

FORM: Lexicon & Plate (rw-lexicon-shoulder-and-plate), competitive challenger from the bolder re-roll, ranked third of the dealt hand behind the lead and the winning alternate, chosen by the user; seed key 482ac048. Signature interaction: guide words and plate captions that follow the area and selection in view; colour quarantine as the state language (inside a plate means it is the flat; vermilion outside means it needs fixing). Motion grammar: a page passing, never a fade; state changes are instant or a 150 ms step.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- No approved comp (code-led); the QUALITY BAR board for rw-lexicon-shoulder-and-plate is the craft reference.
