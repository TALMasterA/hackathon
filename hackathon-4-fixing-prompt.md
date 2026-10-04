# FitIn — Revision 4 fixing prompt

Follow `docs/DEVELOPMENT_METHOD.md`: build only what is listed, preserve working behaviour, record genuine ambiguities in `docs/DECISIONS.md` under "Decisions Needing Team Review", stop only on a real blocker.

Three milestones, one commit each, all on local `main`. **Don't push.**

1. **Furniture 3D models** (free CC0 Kenney kit) for every furniture kind.
2. **AI 3D look from a photo** (fal.ai TRELLIS) for any one item. This builds on milestone 1's model renderer.
3. **Trace your own floor plan** (e.g. a Housing Authority plan) into a flat the editor can use.

**Stop after milestone 2** and give me a summary. I'll test it with my real fal key before you start milestone 3.

Checks after each milestone: `npm run typecheck`, `npm run test:run`, `npm run lint`. Run `npm run build` once at the end of milestone 2 and again at the end of milestone 3.

## 0. Housekeeping (no commit)

- Run `git status`; the working tree must be clean apart from untracked prompt files. Run `git fetch`. If `origin/main` is ahead, run `git pull --rebase origin main` first.
- `feature/ai-3d-furniture` is empty; delete it (`git branch -d`). Ignore `feature/own-furniture-3d`: it is an obsolete, non-AI silhouette approach built on the old single-sofa screen. Don't port anything from it, and don't delete it.
- The fal.ai key is already in `.env.local` as `FAL_KEY`. Never print it, log it, commit it or send it to the client.

---

## Milestone 1 — Furniture 3D models (Kenney Furniture Kit, CC0)

The flat currently draws furniture as boxes, plus a box-built sofa. Replace that look with real low-poly models. **Geometry is unchanged**: collisions, locks, issues, the plan and Before/After keep using each item's width × depth × height box.

### Assets

- I've downloaded the Kenney Furniture Kit zip from kenney.nl into the repo root as `kenney_furniture-kit.zip`. If it's missing, stop and tell me.
- Unzip to a temp folder outside `src/`. Use the GLB/glTF files. If the kit has no GLB/glTF, stop and tell me; don't convert formats.
- Copy only the models you use into `public/models/furniture/`, with one file per FitIn mapping and a clear name like `sofa.glb`. Add the kit's `License.txt` there too. Don't commit the zip; add it to `.gitignore`.
- Map every `FurnitureKind` to the closest model by file name. Use these as a guide; the real file names may differ.

  | FitIn kind | Likely Kenney model |
  |---|---|
  | sofa | loungeSofa |
  | coffee-table | tableCoffee |
  | tv-console | cabinetTelevision |
  | side-table | sideTable |
  | dining-table | table |
  | chair | chair |
  | bed | bedDouble if width ≥ 120 cm, else bedSingle |
  | wardrobe | the closest tall closed cabinet or bookcase with doors |
  | desk | desk |
  | kitchen-counter | kitchenCabinet |
  | fridge | kitchenFridge (or a Large variant) |
  | toilet | toilet |
  | vanity | bathroomSink / bathroomCabinet |

  Record the final mapping in DECISIONS. Note any kind without a good match; it keeps the current box look.

### Rendering (`src/components/scene/`)

- New `FurnitureMesh` component used by `room-scene.tsx` for every item:
  - Load with drei `useGLTF`, preload all mapped models, and clone per item.
  - **Scale non-uniformly so the model's bounding box is exactly width × height × depth** (cm → m), sitting on the floor and centred on the item's position, using the existing `threeRotation`.
  - Facing: the existing `SofaModel` puts the backrest at local +Z, so its front faces local −Z. glTF models usually face +Z, so rotate by π about Y so the model's back matches `SofaModel`'s back. Verify this with the sofa and the TV console: in the default suggested living room they must face each other.
- **Colliding** items: tint every mesh translucent red, as boxes are tinted today (clone the materials; don't mutate cached ones). **Selected / focused** items: also draw the box `Edges` outline, so the exact checked box stays visible.
- **Fallback**: if a model fails to load, or a kind has no mapping, draw today's box/sofa. Wrap model loading in a `Suspense` fallback of the same box.
- Add a **"Models / Boxes"** toggle to the 3D toolbar, with bilingual labels. Boxes is today's look and lets a judge see exactly what is checked. Default: Models.
- Keep the scene light: no shadows, no extra lights, demand rendering, and the existing pixel-ratio cap.
- Write the scale-to-box and rotation maths as a pure function (e.g. `fitObjectToBox(bounds, dims, rotationDeg)`), and unit-test it: the output box equals the target dimensions and the base sits at y = 0.

### Docs

- README: remove "no external models" from Non-Goals, and credit the Kenney Furniture Kit (CC0) under libraries/assets.
- DECISIONS: the model mapping, that models are appearance-only, and the Boxes toggle.

---

## Milestone 2 — AI 3D look from a photo (fal.ai TRELLIS)

The user can give **any one furniture item** its own 3D look, made by AI from a photo of the product they want to buy, or by uploading a `.glb`. Appearance only: geometry and checks keep using the item's box. A look overrides the milestone 1 kind model for that item.

### Server (Next.js route handlers; `FAL_KEY` server-only)

1. Add `@fal-ai/client` and credit it in the README. Do **not** use fal's generic proxy route.
2. `POST /api/model3d` takes multipart with exactly one JPEG/PNG/WebP up to 4 MB. Validate the type and size, then `fal.storage.upload`, then `fal.queue.submit("fal-ai/trellis", { input: { image_url } })`. Return `{ jobId }`.
   - Return 503 unless `MODEL3D_ENABLED === "true"`.
   - Rate limit, in-memory: 5 per IP per 10 min, plus a global cap of 60 per server instance per day.
3. `GET /api/model3d/[id]` maps fal's queue status to `{ status: "queued" | "running" | "done" | "failed" }`.
4. `GET /api/model3d/[id]/file` gets the result (`data.model_mesh.url`), fetches the GLB server-side and streams it back as `model/gltf-binary`. Never send fal URLs or the key to the client.
5. Add `.env.example` with `FAL_KEY=` and `MODEL3D_ENABLED=true`.

### Client

6. Keep looks **out of the editor reducer**. Use a separate hook holding `Map<itemId, Look>`, with `Look = { source: "ai" | "file", object: THREE.Object3D, quarterTurns: 0–3, name }`.
   - **Undo compatibility:** looks are keyed by item ID and are **not** deleted when an item is deleted or on Reset Demo, so undo brings an item back with its look.
   - Render a look only for items that currently exist.
   - Clear a look only when the item is replaced from the library, or the user taps "Remove look".
   - Looks are not undo history and not persisted.
7. New sidebar section, **"3D look (optional)"**, under the selected-item panel, for the selected item:
   - **Make from photo (AI):**
     - Resize on the device to at most 1024 px, JPEG quality 0.85.
     - Before sending, show "Your photo will be sent to fal.ai to build the 3D model. FitIn does not store it." with a Confirm button.
     - POST, then poll every 4 s, showing the status and a Cancel button. Time out at 180 s.
     - Cache results by SHA-256 of the resized photo for the session.
   - **Upload .glb:** load with `GLTFLoader` (dynamic import), maximum 30 MB, no Draco.
   - **Turn 90°**, **Remove look**, and a small preview Canvas showing the model inside a W×D×H outline.
   - On any failure, keep the kind model or box and show a clear bilingual message. Add en + zh-Hant keys with matching placeholders.
8. In the scene, an item with a look renders the look through the same `fitObjectToBox` path, rotated by `quarterTurns × 90°` on top of the milestone 1 facing rule. Collision tint and selection outline behave the same as for kind models. Boxes mode shows boxes for everything.
9. Footer, README, DECISIONS and HACKATHON_COMPLIANCE must say:
   - Measurements, layout and checks never leave the device.
   - Only a photo the user explicitly chooses to send goes to fal.ai.
   - FitIn stores nothing.

### Tests and checks

10. Vitest, with fetch and fal mocked:
    - input validation (type, size, count)
    - 503 when disabled
    - per-IP and daily rate limits
    - status mapping
    - looks survive delete + undo and Reset + undo
    - looks are cleared on library replace and on Remove look
11. Then **one** real end-to-end call against the dev server using `.env.local`. Use `curl` with any furniture photo in the repo's test fixtures, or a rendered one; about $0.02. Record the time-to-model and the GLB size in TEST_PLAN. Don't make more real calls than that.

**Stop here and report.** I'll test with real product photos in the browser.

---

## Milestone 3 — Trace your own floor plan

The flat is currently the hard-coded `DEMO_FLAT`. Let a user build their own flat by tracing over a floor-plan picture, for example a Housing Authority standard-block plan. Then use it in the editor exactly like the demo flat. Everything runs in the browser, and the image never leaves the device.

### Flat becomes editor state

- Move the flat into `EditorState` as `flat: Flat`. Replace every direct `DEMO_FLAT` use in `state.ts` and `workspace.tsx` with `state.flat`; there are about six. `createEditorState(flat = DEMO_FLAT)`.
- New action `{ type: "use-flat"; flat: Flat }`. It replaces the flat and resets furniture, baseline, locks and counters to empty. It also **clears undo/redo history**, because furniture from one flat makes no sense in another. Ask for confirmation in the UI first, in both languages.
- Widen `dimensionSource` to `"team-demo-assumptions" | "user-traced"`. Add an optional `FlatRoom.kind: "living" | "bedroom" | "kitchen" | "bathroom" | "other"`, and add those kinds to the demo flat's rooms.
- The whole-flat 3D framing must come from the flat's real size, not the fixed initial camera, so a bigger flat still fits.
- A **Flat** picker in the toolbar offers:
  - Demo flat
  - any traced presets in `src/data/flats/*.json`, statically imported, listed by name
  - Trace my own…
  - Open flat file…

### Trace screen (new `src/features/floor-trace/`)

A step-by-step panel that replaces the editor view until the user taps "Use this flat" or "Cancel". The steps are tabs the user can revisit.

1. **Picture:** upload a PNG/JPG and show it as a pannable, zoomable underlay. Reuse the Revision 3 plan zoom maths (`zoomAt`, `panBy`, `clampView`). It's an object URL only and is never uploaded or saved.
   - Also accept a PDF: render page 1 in the browser with `pdfjs-dist`. Housing Authority plans are PDFs.
   - If pdf.js worker setup in Next fails after about 30 minutes, drop PDF support. Instead show "Screenshot the plan and upload the image", and record the decision.
2. **Scale.** Offer three methods, the first being the default:
   - **Scale bar (default):** Housing Authority standard-block plans have a metric scale bar in the lower-right corner. Its ticks run 2-1-0, then 2, 4, 6 and 8 m. The user zooms in, taps the **0** tick and the **8 m** tick, and the length field is pre-filled with 800 cm; it stays editable for other bars. Show both tap points as crosshairs that can be nudged by dragging, and a hint: "Zoom in so the ticks are sharp before tapping."
   - **Known length:** tap two points and type the real distance in cm, e.g. one wall measured with a tape. This is for plans without a scale bar, such as agency plans.
   - **Known area:** trace the flat's outer boundary as a rectangle, then type the internal floor area in m², e.g. from tenancy papers. Scale = √(known area ÷ traced area).
   - Show the resulting scale (cm per screen pixel at the current zoom, and cm per image pixel). Add a sanity line, "a typical door here would measure X cm", and an accuracy note: "±1 image pixel ≈ ±N cm". N comes from the image resolution, so users see that a sharper image gives a more accurate trace.
   - For PDFs, render page 1 with pdf.js at a high scale (at least 3× the PDF's default, capped at about 6000 px on the longer side), so the scale-bar ticks and wall lines are sharp when zoomed.
3. **Rooms.** Drag axis-aligned rectangles on the picture to mark each room's clear floor area: trace the **inner faces** of the drawn walls, not their centre lines. Pick a kind for each; names are automatic and bilingual, numbered if repeated ("Bedroom 2 / 睡房 2").
   - Snap to a 5 cm grid, and snap an edge to exactly one wall thickness away from a neighbouring room's edge.
   - Wall thickness defaults to 10 cm, editable.
   - Rooms can be moved, resized and deleted. Overlapping rooms are an error.
4. **Walls are generated automatically** from the rooms, as a pure, unit-tested function `wallsFromRooms(rooms, thickness)`.
   - Each room edge gives a wall centre line half a thickness outside the edge.
   - Collinear segments within 2 cm are merged into one wall.
   - A wall is `outer` if no room lies on its far side.
   - The user can **tap a generated wall to remove it**, for open-plan living/kitchen areas. An L-shaped room is two rectangles with the wall between them removed.
5. **Doors and windows.** Tap a wall to add a door (width 80 cm by default, editable 60–100) or a window (width 120, sill 100).
   - A door swings into the room on the side that was tapped, and `connects` records the rooms on both sides, or "outside".
   - Exactly one entrance door is required, on an outer wall.
   - A door or window must fit within its wall.
6. **Ceiling height:** the existing 220–350 cm input.
7. **Check and use.** Run validation with bilingual messages.
   - **Errors** block the flat: no rooms, overlapping rooms, a door outside its wall, no entrance.
   - **Warnings** don't block: a room that can't be reached from the entrance through doors or removed walls.
   - Then **Use this flat** applies `use-flat`.

The traced flat is normalised so its minimum wall extent is at x = z = 0. `width` and `depth` are the bounding box, so the existing envelope check works.

### Save and preload (no server)

- **Download flat file:** a `.json` of the `Flat` only, never the picture.
- **Open flat file:** validates the schema, then applies `use-flat`.
- Any JSON the team commits to `src/data/flats/` shows in the Flat picker. I'll trace a real Housing Authority flat in the app myself and commit the file, so the booth doesn't depend on live tracing.

### Suggested furniture on traced flats

`SUGGESTED_FURNITURE` only fits the demo flat. On a traced flat, the Suggested panel offers a set per room kind instead:

| Room kind | Suggested set |
|---|---|
| living | sofa, coffee table, TV console, dining table, 2 chairs |
| bedroom | double bed (first bedroom) or single bed, plus wardrobe and desk |
| kitchen | counter, fridge |
| bathroom | toilet, vanity |
| other | nothing |

- Items are placed one by one with the existing `placeLibraryItem` probe, plus one tweak: for sofa, bed, wardrobe, TV console, counter and fridge, try positions **closest to a wall first** instead of closest to the room centre.
- Label it "rough starting positions; drag to adjust". This is placement probing, not a layout solver; keep the README claim true.
- Items with no free position are skipped with the existing skip messages. The whole batch is still one undo step.

### Source panel

- On a traced flat, replace the demo-assumption text with: "Traced by you from [file name]; scale from [known length / known area]; accuracy depends on your calibration. Verify before buying." Bilingual.
- Don't bundle or redistribute Housing Authority PDFs or images. Only traced geometry is committed.

### Tests

- `wallsFromRooms`:
  - two adjacent rooms make one shared internal wall
  - an L-shape with a removed wall
  - outer flags
  - merge tolerance
- Scale from the scale bar (two taps 400 image px apart with 800 cm → 2 cm per image px), from known length and from known area.
- Normalisation to the origin.
- Validation: each error and warning case.
- Flat JSON round-trip, and rejection of a malformed file.
- `use-flat` clears furniture, locks and history.
- Traced-flat suggestions: the wall-first probe puts a bed against a wall in a simple rectangular bedroom.

### Docs

README (new workflow step, plus "trace is approximate"). Correct the existing claim, in DECISIONS, FLAT_DEMO_DATA and the bilingual `source.plan` text, that the Housing Authority PDF gives no usable dimensions: it has a metric scale bar, so a flat can be measured approximately from it, though it has no dimension lines and individual flats may vary. DECISIONS (all of the choices above), TEST_PLAN (manual checks: trace a Housing Authority PDF on a laptop and on a phone, known-area calibration, open-plan wall removal), and DEVELOPMENT_METHOD (revision 4 row).

## Out of scope

No floor-plan auto-detection by AI, no non-rectangular rooms other than rectangles joined by a removed wall, no saving pictures, no accounts or persistence beyond downloading a file, no deployment in this revision.
