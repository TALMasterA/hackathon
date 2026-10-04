# FitIn — Revision 3 fixing prompt

Repo: TALMasterA/hackathon, branch `main`. Follow `docs/DEVELOPMENT_METHOD.md`: fix only what is listed here, preserve working behaviour, record genuine ambiguities in `docs/DECISIONS.md` under "Decisions Needing Team Review", stop only on a real blocker.

Three changes, three milestones, one commit each, in this order:

1. **Undo / redo** (do first — milestones 2 and 3 should create history entries correctly from the start)
2. **Floor-plan zoom and room focus**
3. **Start with an empty flat + suggested furniture**

Run `npm run typecheck` and `npm run test:run` after each milestone, `npm run lint` before each commit, `npm run build` once before the final push. Fetch before pushing; stop on divergence. No force-push.

---

## 1. Undo / redo (replaces "Reset Demo is the only way back")

### Behaviour

- Add **Undo** and **Redo** buttons to `.layout-toolbar` in `src/features/flat-editor/workspace.tsx`, before the baseline button. Icons: lucide `Undo2` / `Redo2`. Disabled when the stack is empty or `view === "before"`. Tooltip/aria-label bilingual.
- Keyboard: Ctrl/Cmd+Z = undo; Ctrl/Cmd+Shift+Z and Ctrl+Y = redo. **Ignore the shortcut when focus is in an `<input>`, `<select>` or `<textarea>`**, so the browser's own text undo still works in fields.
- Reset Demo stays in the header, but becomes an undoable step (a misclick is recoverable). No confirm dialog.

### What one undo step is

History stores **document state only**:

```ts
interface EditorDocument {
  current: LayoutSnapshot;
  baseline: LayoutSnapshot;
  locks: LayoutLocks;
  nextItemNumber: number;
  nextLockNumber: number;
}
```

Add to `EditorState`: `past: EditorDocument[]`, `future: EditorDocument[]`, `gesture: EditorDocument | null`, `coalesceKey: string | null`. Cap `past` at 100 (drop oldest). Any new history entry clears `future`.

| User action | Undo steps |
|---|---|
| Whole plan drag (pointer down → up) | **1**, not one per pointermove |
| Whole rotation-dial drag | 1 |
| Typing into one numeric field of one item (consecutive edits, same item + field) | 1 — coalesce until the field blurs, the selection changes, or a different action happens |
| Ceiling-height typing | 1 (coalesce the same way, key `"ceiling"`) |
| Add / replace / delete item | 1 each |
| Suggestion batch (milestone 3) | 1 for the whole batch |
| Position-lock toggle, distance-lock create/edit/remove | 1 each |
| Set current as baseline | 1 |
| Reset Demo | 1 |
| Rejected edit (lock bounce), incomplete draft, no-op | **0** — never push a history entry when the document didn't change |
| Select, room change, language, Before/After view, camera | 0 — not history |

### Implementation notes

- In `src/features/flat-editor/state.ts`, wrap the existing reducer: snapshot the document before the action; after it, push the snapshot only if the document actually changed (compare by reference first — the reducer already returns the same objects for no-ops — then deep-equal only if needed).
- New actions: `{ type: "gesture-start" }`, `{ type: "gesture-end" }`, `{ type: "undo" }`, `{ type: "redo" }`.
  - `gesture-start` stores the pre-gesture document in `gesture`; while `gesture` is set, `propose` actions don't push entries.
  - `gesture-end` pushes the stored document once if the current document differs from it, then clears `gesture`.
  - Fire them from `FloorPlan` `startDrag` / `stopDrag` (including pointercancel) and from `RotationDial` pointerdown / stop. Keyboard dial steps are individual steps (no gesture).
- Coalescing: `draft` actions carry key `${selectedId}:${field}`; a matching `coalesceKey` means "don't push again". `normalise-draft` (blur), `select`, `view` and any non-draft action clear `coalesceKey`.
- `undo` / `redo`: swap the document between `past`/`future` and current. Then: keep `language`, `view`, `cameraRevision` (don't remount the plan or move the 3D camera); keep `selectedId` if that item still exists in the restored `current`, otherwise select `null`; rebuild `draft` from the restored item; clear `inputIssues`, `ceilingIssue`, `lockNotice`, `lockSetupIssue`, `libraryFullRoomId`, `gesture`, `coalesceKey`; set `ceilingInput` from the restored ceiling.
- `reset` currently returns `createEditorState()` — keep `past` (push the pre-reset document) and clear `future`.
- Bilingual strings in `src/i18n/editor.ts` (`editor.undo`, `editor.redo`; zh-Hant: 復原 / 重做).

### Tests (`state.test.ts`)

- 50 `propose` actions between one `gesture-start`/`gesture-end` → exactly one undo returns the pre-drag position.
- Typing "1","12","120" into width → one undo restores the original width; typing into width then depth → two steps.
- Lock-bounced proposal pushes nothing.
- Add → delete → undo → undo returns to the original layout; redo twice reapplies both.
- New action after undo clears redo.
- Undo after Reset Demo restores the pre-reset layout, locks and baseline.
- Undo/redo are no-ops in Before view.
- Undo when the selected item disappears selects `null` without crashing.
- `past` never exceeds 100.

---

## 2. Floor-plan zoom and room focus

The whole 660 × 640 cm flat in one SVG is too small to edit a single room on a phone. Add zoom/pan to the 2D plan, and make **room focus drive both views**: choosing a room zooms the 2D plan and moves the 3D camera to that room.

### Behaviour

- A **room focus bar** above the plan (inside the plan section heading or just under it): `Whole flat` + one chip per room (bilingual room names). Tapping a room chip:
  - animates/sets the plan view to that room's rectangle plus a 30 cm margin, fitted to the stage aspect;
  - also sets `selectedRoomId` (so "Add item" targets the room you're looking at).
  - `Whole flat` returns to the current full view.
- The existing toolbar room `<select>` does the same zoom when changed (one concept of "current room", not two).
- **Double-click / double-tap on an empty area of a room** zooms to that room. Single tap keeps today's behaviour (select room, no zoom).
- **Zoom in / Zoom out / Fit** icon buttons overlaid in a corner of the plan, reusing the 3D viewport's button style and the existing `scene.zoomIn` / `scene.zoomOut` strings; Fit = Whole flat.
- **Mouse wheel** zooms around the cursor only while Ctrl/Cmd is held or the plan is already zoomed in (otherwise the wheel must still scroll the page). Call `preventDefault` only when zooming (listener must be non-passive — attach with `addEventListener('wheel', …, { passive: false })` in an effect, not the React prop).
- **Two-finger pinch** zooms around the pinch centre and pans with the centroid.
- **One-pointer drag on empty floor pans** when zoomed in. One-pointer drag on furniture still moves furniture (unchanged). At whole-flat zoom, empty-floor drag does nothing new.
- If a second finger lands during a furniture drag, end the furniture drag (`gesture-end`) and switch to pinch; never move furniture with two fingers.
- Limits: from whole flat (zoom 1) down to a view ~120 cm wide. Clamp panning so at least 25% of the view always overlaps the flat.
- Selecting an item from the list, the 3D scene or the Issues panel while zoomed: if the item's footprint is outside the current view, pan (don't change zoom) so it is centred.
- Readability when zoomed: room names, issue value labels, the lock icon and stroke widths stay the **same on-screen size** at any zoom (scale font-size and icon size by `1/zoom`; use `vector-effect="non-scaling-stroke"` on outlines/strokes). Furniture fills, door arcs and walls scale with the plan normally.
- The SVG element keeps the whole-flat aspect ratio and size, so the page layout doesn't jump when zooming.
- No auto-pan while dragging furniture past the view edge (record in DECISIONS).
- View state is not undo history and is not reset by Before/After. Reset Demo returns both views to Whole flat.

### 3D follows room focus

- One shared `focusRoomId: string | null` (`null` = whole flat) in the workspace, driven by the room chips, the room `<select>` and double-tap. Pinch/wheel/pan in the 2D plan do **not** change it (free zoom is 2D-only).
- When `focusRoomId` changes, the 3D camera frames that room: orbit target = room centre at ~0.6 m height (convert with the existing `scenePositionCm` / `METRES_PER_CM`), camera distance chosen so the room's larger side fills the view (roughly `max(width, depth)` in metres × 1.6, then clamped). Keep the current viewing direction (same azimuth/polar angle as before the change) so the user isn't disoriented. `null` → today's whole-flat framing (`INITIAL_CAMERA_POSITION`, target `0, 0.6, 0`).
- Distance limits depend on focus: whole flat keeps `6–22 m`; a focused room uses roughly `2–10 m`, so a 2.2 m bathroom can actually be seen close up. Keep `enablePan={false}` and the existing polar/azimuth limits.
- The 3D **Reset View** button reframes to the **current focus** (room or whole flat), not always the whole flat. 3D zoom in/out buttons work within the current focus limits.
- Translucent walls already let you see in; don't add wall hiding or cutaways in this revision.
- An instant jump is fine; a short ease (≤300 ms) is optional. Keep the existing damping flush so the camera doesn't drift after the jump.

### Implementation notes

- Lift `focusRoomId` to `FlatEditorApp` (plain `useState`, not the reducer — it's view state, not document state). Pass it to `FloorPlan` and add it to `EditorSceneProps` so `RoomViewport` → `RoomScene` → `CameraControls` receive it. Extend `CameraCommand` with a `"focus"` action or react to the prop in an effect; your call, smallest change.
- Keep the 2D `{ minX, minZ, width, height }` view-box state in `FloorPlan`; when `focusRoomId` changes, set it from `fitRoomView`. Replace the fixed `box` with it everywhere: `viewBox`, `clientToPlan`, and the hit radius `22 / scale` (which must use the **current** scale, so the finger target stays ~22 px on screen at any zoom).
- Put the pure maths in `src/components/plan/interaction.ts`: `fitRoomView(room, margin, aspect)`, `zoomAt(view, factor, anchorPlanPoint, limits)`, `panBy(view, dx, dz, flatBounds)`, `clampView(...)`, `ensureVisible(view, polygon)`. No DOM in these.
- Track active pointers in a `Map<pointerId, point>` in the plan; 1 pointer → existing drag or pan, 2 pointers → pinch.
- `touch-action: none` is already set on `.flat-plan`; keep it.
- Bilingual strings: `plan.wholeFlat` (全屋), `plan.fit` (顯示全屋), `plan.zoomHint` if you add a hint.

### Tests

- `fitRoomView` for each preset room contains the room rectangle and the margin, at a wide and a tall aspect.
- `zoomAt` keeps the anchor point at the same screen position; respects min/max zoom.
- `panBy` / `clampView` keep ≥25% overlap with the flat.
- `clientToPlan` with a zoomed view maps a screen point to the right plan point (extend the existing test).
- `ensureVisible` leaves the view unchanged for a visible item and centres an off-screen one.
- Put the 3D framing maths in a pure function (e.g. `roomCameraFrame(room, currentDirection)` in `src/lib/geometry/oriented.ts` or a new `src/components/scene/camera.ts`) and test it: target equals the room centre in metres, distance within the focused limits, direction preserved, `null` gives the whole-flat frame.

---

## 3. Start with an empty flat + suggested furniture

### Behaviour

- On load (and after Reset Demo), the flat has **architecture only and no furniture**. Baseline is also empty. `selectedId` is `null`; `selectedRoomId` stays `"living"`.
- When a room has no furniture, the plan shows a light empty-room hint inside it (e.g. "Empty — tap Suggest"), not on top of furniture.
- A new **Suggested furniture** panel at the top of the sidebar (above the furniture details), bilingual:
  - **Furnish whole flat** — adds the full suggested set for every room. Hidden or disabled once every suggested item is present.
  - **Suggest for [selected room]** — adds that room's suggested set.
  - A one-line label that these are **example placements prepared by the team**, not computed recommendations or a guarantee of fit (the README says the app has no AI and no layout solver; keep that true).
  - Disabled in Before view.
- The suggested set is the **existing 20 hand-placed items in `FLAT_FURNITURE`**, grouped by `roomId`. Rename the export to `SUGGESTED_FURNITURE` (keep their stable IDs like `living-sofa`). They're already tested as warning-free, so a fresh "Furnish whole flat" gives a clean layout.
- Adding a suggestion to a room that already has furniture:
  - skip any suggested item whose ID is already present;
  - skip any suggested item that would overlap existing furniture, a wall, a door swing or break a lock (reuse `analyzeLayout` + lock checks, same as `placeLibraryItem` does);
  - add the rest; show a status line listing what was skipped and why (bilingual, using item names). Never move existing furniture.
- The whole batch is **one undo step** (milestone 1).
- Added suggestions get the "added" change marker against an empty baseline, like any other new item. After suggesting, the user can press "Set current as baseline" as today.
- Library add / replace / delete, locks, Before/After and everything else work as before on top of an empty or suggested layout.

### Implementation notes

- `createEditorState()` → `current.furniture = []`, `baseline` empty, `selectedId: null`, `focusedIds: []`, `draft: null`.
- New action `{ type: "suggest"; roomId: string | "all" }` in `state.ts`; the per-item fit check goes in `src/features/flat-editor/layout.ts` next to `placeLibraryItem`.
- Check every component that assumed a non-empty layout or `furniture[0]` (reducer `delete-item`, `view`, `ItemList`, `LocksPanel` endpoint selects, `FurniturePanel` with `item === null`, `RoomScene`) and give each a sensible empty state.
- Tests that assumed 20 starting items: add a `furnishedState()` test helper that dispatches `suggest all`, and use it. Don't delete coverage; migrate it.

### Tests

- Fresh state: 0 furniture, 0 issues, `selectedId === null`, Before/After both empty.
- `suggest all` → 20 items, 0 issues, one undo returns to empty.
- `suggest living` twice → second call adds nothing and reports all as already present.
- Suggest a room after placing a library item where the suggested sofa goes → sofa skipped with reason, others added.
- Suggest with a distance lock that a suggested item would break → that item skipped.
- Reset after suggesting → empty again; undo → furnished again.

---

## Docs (final milestone, same commit as milestone 3 or a small docs commit)

- `README.md`: update Current Workflow (empty start, suggestions, plan zoom, undo/redo). Remove undo/redo from Explicit Non-Goals. Keep "no automatic layout solving" true and say suggestions are fixed example placements.
- `docs/DECISIONS.md`: add a "Revision 3 Team Decisions" section; note the undo granularity rules, 100-step cap, shortcut-ignored-in-inputs, Reset undoable, wheel-zoom gating, no drag auto-pan, shared room focus driving both views (free 2D zoom does not move 3D), 3D Reset View reframing to the current focus, focused-room camera distance limits, suggestion skip rules, empty baseline at start.
- `docs/DEVELOPMENT_METHOD.md`: add revision 3 row to the log.
- `docs/TEST_PLAN.md`: new automated cases; add judge-checklist items (pinch on a real phone, wheel zoom on a laptop, undo across a drag, Ctrl+Z inside a text field doesn't trigger app undo); list anything not verified in a real browser under pending manual check.

## Out of scope for this revision

No 3D furniture dragging, no 3D panning or wall cutaways, no persistence of history or zoom, no new library items, no decor items, no layout solver, no backend.
