# Development Method

The team manually judges the running website, lists every problem or desired change, writes a fixing prompt, and the implementation agent fixes only those listed changes. The team judges again; the loop repeats until the website matches expectations.

Do not add unrequested features, redesign working surfaces, or broaden a refactor beyond what the fixing prompt needs. Preserve compatible existing behavior. For a genuine ambiguity, make the smallest reasonable decision, record it in DECISIONS, and flag it for team review; stop only for an actual blocker.

After meaningful changes, run type checking and the unit suite. Run lint before each commit and build only before a milestone push. Checks have a roughly three-minute limit. Browser automation is not the default: at most one bounded final smoke test per milestone, no screenshot loops, polling or pixel exploration, and no more than five browser calls. Record all unverified behavior under pending manual check in TEST_PLAN.

Work on the existing main branch, commit coherent checked milestones, fetch before every normal push, and stop on remote divergence or a push error. Never force-push, rewrite history, store secrets, deploy, or create another repository.

## Revision Log

The three completed Revision 3, Revision 4 and designer-feedback working briefs were removed from the repository root during submission cleanup. Their original contents remain in Git history at `a2b93ae`; filenames below identify archived instructions, not current files. No source, tests, assets or licences were removed.

| Revision | Team instruction | Scope / status |
| --- | --- | --- |
| Designer feedback (2026-10-03) | Archived hackathon-4-designer-feedback-prompt.md and its approved plan | Design assistant / 設計協作助手: rule-based interpretation, bounded heuristic proposals, isolated preview, rejection rounds, apply/undo, stale detection; development Skill at `.github/skills/fitin-layout-design/`; docs in DESIGN_ASSISTANT.md. Initially committed and pushed on `designer-feedback`; subsequently merged to main in `a2b93ae` on 2026-10-04. No deployment was performed by that session. Verification record in TEST_PLAN. |
| 3 UI polish (2026-10-03) | hackathon-3-ui-polish-prompt.md | Incremental shell, aligned views, tabbed inspector, truthful bilingual status/examples and lock deletion/history coverage; no commit/push/deployment requested or performed. Verification record in TEST_PLAN. |
| 1 | First-version implementation prompt | Single-room fixed-centre sofa checker, delivered in commit 038ba1a |
| 2 | hackathon-2-fixing-prompt.md | Whole-flat arbitrary-angle editor, live issues, generic locks/bounce, library and immediate baseline comparison; all feature milestones implemented |
| 3 | hackathon-3-fixing-prompt.md | Document undo/redo, floor-plan zoom with room focus shared by 2D and 3D, empty start with team-prepared suggested furniture; all milestones implemented |
| 3.1 | Team follow-up (two fixes) | Plan zoom buttons moved into the room-chip bar; every room-chip/Fit request reframes the 3D camera; one commit, not browser-verified |
| 4 | hackathon-4-fixing-prompt.md | Kenney furniture models stretched to each checked box with a Models / Boxes toggle (milestone 1); optional AI 3D look from a confirmed photo via fal.ai TRELLIS, or an uploaded .glb, later removed (milestone 2); floor-plan tracing (milestone 3) |
| 4, milestone 3 (2026-10-04) | hackathon-4-fixing-prompt.md milestone 3, changed by the team's request in the session | Read my floor plan: a Housing Authority PDF or picture becomes the user's own flat, scaled from the plan's scale bar, with walls snapped to the drawing, doors and windows measured, an optional AI reading of the rooms via fal.ai, validation, flat files and per-room-kind suggestions; deviations from the written spec are listed in DECISIONS |

Revision 2 milestones: data/geometry/tests; plan drag/rotation; 3D sync/issues; locks/bounce; library/baseline; current documentation/final verification. A foundation commit does not imply that its future UI is already exposed.

Checked feature milestones: 84ac6f0 (data/geometry), 8fba37c (plan/dial), d09c866 (3D sync/issues), bc4ac58 (locks/snap-back), cbbe46b (library/baseline). Documentation now describes the current revision. The one final smoke completed within five browser calls; results and all pending checks are in TEST_PLAN. This log does not claim physical-phone or household testing.

Revision 3 milestones, each type-checked, unit-tested and linted before commit: undo/redo (0c820c8), plan zoom and shared room focus (28510ee), empty start and suggested furniture (1b0ba6a), then this documentation commit. A production build ran once before handing over. The implementation session had no browser automation tools, so no Revision 3 browser smoke was performed. All Revision 3 UI behaviour is listed under pending manual check in TEST_PLAN. This log does not claim physical-phone or household testing.

Revision 4 milestones 1 and 2 were each type-checked, unit-tested and linted before commit, and milestone 2 also passed a production build. One real fal.ai call was made through the dev server with `curl`, as the prompt allowed. The session had no browser automation tools, so no browser smoke was performed; all Revision 4 UI behaviour is listed under pending manual check in TEST_PLAN. Nothing was pushed.

Revision 4 milestone 3 was delivered in seven commits (32bdd3c flat as state, 7938b00 walls and build, 7aac46b drawing analysis, 45929d6 tuning on the real plan, ddee75e trace screen, 3d20dc2 AI reading, then this documentation), each type-checked, unit-tested and linted; production builds passed with the trace screen and before the documentation commit. The analysis was measured against the vector data of a real Housing Authority PDF kept outside the repository, real fal.ai plan-reading calls were made from a scratchpad script, and short headless-Edge smokes covered the manual trace flow and the AI consent and switched-off paths. Results and the remaining manual checks are in TEST_PLAN. Nothing was pushed.
