# Development Method

The team manually judges the running website, lists every problem or desired change, writes a fixing prompt, and the implementation agent fixes only those listed changes. The team judges again; the loop repeats until the website matches expectations.

Do not add unrequested features, redesign working surfaces, or broaden a refactor beyond what the fixing prompt needs. Preserve compatible existing behavior. For a genuine ambiguity, make the smallest reasonable decision, record it in DECISIONS, and flag it for team review; stop only for an actual blocker.

After meaningful changes, run type checking and the unit suite. Run lint before each commit and build only before a milestone push. Checks have a roughly three-minute limit. Browser automation is not the default: at most one bounded final smoke test per milestone, no screenshot loops, polling or pixel exploration, and no more than five browser calls. Record all unverified behavior under pending manual check in TEST_PLAN.

Work on the existing main branch, commit coherent checked milestones, fetch before every normal push, and stop on remote divergence or a push error. Never force-push, rewrite history, store secrets, deploy, or create another repository.

## Revision Log

| Revision | Team instruction | Scope / status |
| --- | --- | --- |
| 1 | First-version implementation prompt | Single-room fixed-centre sofa checker, delivered in commit 038ba1a |
| 2 | hackathon-2-fixing-prompt.md | Whole-flat, arbitrary-angle editor, live issues, generic locks, library and baseline comparison; implementation milestones in progress |

Revision 2 milestones: data/geometry/tests; plan drag/rotation; 3D sync/issues; locks/bounce; library/baseline; current documentation/final verification. A foundation commit does not imply that its future UI is already exposed.

Data/geometry is delivered in 84ac6f0, plan controls in 8fba37c, 3D sync in d09c866 and locks in bc4ac58. The library and baseline milestone completes add/delete/replace, free initial placement, both-view ghost outlines, changed-item markers and re-baselining without camera reset. All requested feature controls are integrated. Current documentation and the one bounded final smoke remain; this progress record does not claim physical-phone or household testing.