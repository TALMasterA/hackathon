You are the implementation agent for FitIn in the existing repository
opened in VS Code.

Implement a new feature:

“Designer Feedback Loop” / “設計協作助手”

Also create a reusable workspace Agent Skill for implementing and reviewing
this workflow, and organize the application logic into clear internal tools.

This is an incremental extension of the working application.
Do not rebuild the app.


1. PRODUCT GOAL

Help ordinary users improve their current furniture arrangement without
needing interior-design knowledge.

Required interaction:

Current layout
→ User describes daily-life needs
→ System interprets supported requirements
→ User confirms the interpretation
→ System proposes a revised arrangement
→ User previews the proposal and its reasoning
→ User accepts OR rejects and explains why
→ System accumulates feedback and proposes another arrangement
→ Repeat through explicit user-triggered rounds
→ User accepts or ends the session.

The system should answer:
- What should change?
- Why should it change?
- What trade-offs does the change create?

A chat interface with generic advice is NOT sufficient.
The feature must generate real position/rotation changes when a suitable
alternative can be found.

Do not implement an autonomous infinite loop.
Every generation round requires explicit user action.


2. DEVELOPMENT APPROACH

Use the team's established workflow:

bounded implementation
→ focused verification
→ report
→ manual team acceptance.

Before editing:
- Read existing project/agent instructions.
- Read package.json and relevant documentation.
- Inspect the canonical room/furniture/layout model.
- Inspect geometry validation, locks, rotation, editor state,
  Before/After, translations, and existing UI components.
- Check the current branch and working tree.
- Identify existing user changes and preserve them.
- Identify any already implemented parts of this feature.

Do not assume the repository still matches an earlier revision.
Adapt to the actual current code.

Give a short execution plan, then implement.
Do not stop after producing a plan or a Skill file.

Preserve:
- Furniture editing and replacement.
- Dragging and horizontal rotation.
- Position locks and distance constraints.
- Collision indicators.
- Shared 2D/3D state.
- Existing Before/After behavior.
- English / Traditional Chinese support.
- Current desktop and mobile interactions.

Do not:
- Perform a broad redesign or unrelated refactor.
- Upgrade dependencies unnecessarily.
- Delete or revert existing user changes.
- Initialize a new application or repository.
- Commit, push, or deploy.
- Create a checkpoint commit automatically.

If unrelated agents or processes appear to be editing the same files,
report the conflict instead of overwriting their changes.


3. TOOLING AND SETUP POLICY

Use:
- Existing VS Code file and terminal tools.
- Existing project dependencies.
- Existing geometry and state utilities.
- Plain TypeScript application functions for the proposal workflow.

For the first working implementation:
- Use a functional heuristic proposal generator.
- Use structured feedback controls.
- Use bounded, transparent rule-based free-text interpretation.

Do not install:
- A new MCP server.
- Blender or a Blender addon.
- A new AI SDK/provider.
- A new database.
- A new authentication system.
- A new rendering engine.

Do not add an MCP server merely to connect functions inside this application.
Internal function calls are sufficient for this version.

If the repository already has an AI integration:
- Identify it in the report.
- Keep its existing behavior intact.
- Do not make the new workflow depend on it.
- Do not add new external data transmission without separate approval.

MCP and AI-provider setup must not block implementation.

Use an already configured browser tool only to diagnose a specific blocking
issue or perform one bounded smoke test.
Do not launch broad browser exploration.

If a genuinely necessary dependency is missing, explain why before adding it.


4. CREATE A WORKSPACE AGENT SKILL

Create:

.github/skills/fitin-layout-design/SKILL.md

Use valid Skill frontmatter:

---
name: fitin-layout-design
description: Implement and review FitIn furniture-layout proposals, geometry validation, user-feedback revisions, isolated previews, and accepted-layout application.
---

The Skill is for the coding agent's development workflow.
It is NOT the runtime implementation.
It does not confer professional interior-design certification.

Include these instructions in the Skill:
- Inspect the actual layout model and validators first.
- Translate daily-life needs into supported structured preferences.
- Separate hard constraints from soft preferences.
- Preserve existing locks and fixed building elements.
- Generate bounded layout candidates.
- Validate before presenting a candidate as feasible.
- Ground explanations in actual transforms and evaluated metrics.
- Accumulate rejection feedback.
- Avoid repeating rejected arrangements.
- Keep proposal drafts isolated from committed state.
- Require user approval before applying.
- Detect stale proposals.
- Report unsupported needs and search limitations honestly.
- Preserve English / Traditional Chinese support.
- Use focused tests and time-boxed verification.

Reference the actual implementation files once created.
Do not duplicate the geometry engine in the Skill.
Do not invent universal clearance standards.

Add one short example covering:
request → interpretation → proposal → rejection reason → revision
→ acceptance → undo.

If the repository already has an equivalent Skill:
update or extend it instead of creating conflicting instructions.

The Skill file must not contain credentials or instructions to install
unapproved services.


5. FEATURE SCOPE

A generated proposal may change only:
- Positions of existing movable furniture.
- Horizontal rotations supported by the existing app.

It must NOT:
- Change furniture dimensions.
- Add, remove, or replace furniture.
- Change walls, rooms, doors, or windows.
- Move fixed building elements.
- Move furniture between rooms automatically.
- Relax locks or distance constraints silently.
- Claim regulatory, accessibility, or construction compliance.
- Claim accurate daylight, lighting, material, or structural analysis.

Keep furniture in its current room.

If room membership is unclear:
- Derive it conservatively from existing geometry if possible.
- Otherwise exclude ambiguous items from automatic movement.
- Explain the limitation.

Do not expand the furniture catalog or build room scanning for this feature.


6. APPLICATION INTERNAL TOOLS

Organize the workflow around typed functions/services with responsibilities
equivalent to:

getLayoutContext()
interpretUserNeeds()
generateLayoutCandidates()
validateLayout()
evaluatePreferences()
recordRejectionFeedback()
previewProposal()
applyAcceptedProposal()
undoAppliedProposal()

Adapt names to the codebase.
Reuse existing utilities rather than wrapping everything unnecessarily.

Responsibilities:

getLayoutContext:
- Read room/furniture data, current revision, existing constraints,
  baseline information, and session preferences.

interpretUserNeeds:
- Convert structured controls and supported text into preferences.
- Return unresolved or unsupported requirements explicitly.

generateLayoutCandidates:
- Produce bounded candidate transforms.
- Never mutate committed editor state.

validateLayout:
- Reuse existing geometric validation.
- Return structured issues, not only a boolean.

evaluatePreferences:
- Evaluate only implemented, measurable objectives.
- Return metric changes and trade-offs.

recordRejectionFeedback:
- Preserve the user's explanation.
- Add confirmed actionable preferences.
- Record rejected layout signatures.

previewProposal:
- Show an isolated draft in synchronized 2D/3D.

applyAcceptedProposal:
- Check freshness and validity.
- Atomically apply the accepted draft.

undoAppliedProposal:
- Restore the pre-application layout when safe.

Keep these tools internal for this version.
Do not expose them as network endpoints or MCP tools unnecessarily.


7. STATE AND SESSION MODEL

Keep these concepts distinct:

committedLayout:
The real layout currently in the editor.

baselineLayout:
A snapshot of committedLayout when the design session starts.

proposalLayout:
An isolated draft, not yet applied.

preferences:
Confirmed user goals and session-specific requirements.

feedbackHistory:
Initial needs and rejection explanations across rounds.

proposalHistory:
Drafts, metrics, validation, explanations, and dispositions.

layoutRevision:
A version/hash for detecting external edits.

Proposal records should include:
- ID and version.
- Input layout revision.
- Changed furniture IDs.
- Position and rotation transforms.
- Grounded reasons.
- Evaluated metrics.
- Trade-offs.
- Validation issues.
- Interpretation/generation mode.
- Status: preview, rejected, accepted, or discarded.

Keep history bounded and reasonably small.
Reuse existing persistence if appropriate.
Do not add a database solely for this feature.

BASELINE SEMANTICS

Generate revisions from the baseline and accumulated preferences.
A rejected draft must not become the real or implicit baseline.

Interpret references carefully:
- “Original position” means baseline position.
- “This proposed position” means the displayed draft position.
- “Keep it here” requires the intended position to be clear.

Ask for clarification through UI controls when the distinction matters.

EXTERNAL EDITS

If the real layout or relevant constraints change during the session:
- Mark the session/proposal stale.
- Prevent applying stale changes.
- Offer restart from the latest layout.
- Preserve the user's feedback for review where practical.
- Do not overwrite newer manual edits.

Do not change the global Before/After baseline merely to preview a proposal.


8. USER INTERFACE

Add an entry point using the existing UI style:

“Design assistant” / “設計協作助手”

A. INITIAL REQUEST

Provide:
- Target-room selector.
- Free-text needs field.
- Supported goal chips.
- Furniture selection for item-specific requests.
- “Keep in place” selection.
- Interpreted-request summary for confirmation.

Example placeholder:
“想客廳易行啲，梳化唔好郁，其他傢俬可以調整。”

Supported goal examples:
- Change as little as possible / 盡量少改動
- Keep a selected area open / 指定位置保持空曠
- Bring two selected items closer / 兩件傢俬近啲
- Increase distance between selected items / 兩件傢俬遠啲

Only enable goals the implementation can evaluate.

Do not expose raw coordinates or optimization weights as the main interface.

If “More walking space” is not backed by a real route/clearance model,
do not offer it as a verified whole-room objective.
Use an honestly named local open-zone goal instead.

Before generation, show:
- Confirmed needs.
- Preserved furniture.
- Assumptions.
- Unsupported or unresolved requirements.

Button:
“Generate proposal” / “產生方案”

B. PROPOSAL

Show:
- Version number.
- Clearly labeled proposed-layout preview.
- Current/proposed view toggle.
- Changed furniture list.
- Why each change addresses the request.
- Trade-offs.
- Validated checks.
- Unverified aspects.

Actions:
- “Accept and apply” / “接受並套用”
- “Not satisfied” / “唔滿意”
- “Discard proposal” / “放棄方案”

C. REJECTION

Require a reason, using structured selections and/or free text.

Reason chips:
- This item should not move / 呢件傢俬唔應該移動
- Too many changes / 改動太多
- I dislike this position / 唔鍾意呢個位置
- I dislike this orientation / 唔鍾意呢個方向
- These items should be closer / 呢兩件應該近啲
- These items should be farther apart / 呢兩件應該遠啲
- Other / 其他

Let users identify the relevant item or pair.
Resolve ambiguous furniture references.

Show the feedback interpretation before the next round.

Button:
“Generate revised proposal” / “按回饋重新產生”

Do not regenerate automatically while feedback is being entered.

D. ACCEPTED STATE

Show:
- Applied changes.
- “Undo this application” / “復原今次套用”.
- Option to start a new session from the accepted layout.

Do not generate another proposal automatically.

E. GENERATION STATES

Handle:
- Loading.
- Cancel or bounded timeout.
- No candidate found.
- Invalid input.
- Unexpected error.
- Stale proposal.

Disable duplicate generation requests.
Ignore late results from superseded or cancelled requests.


9. REQUIREMENT INTERPRETATION

Structured selections are authoritative.

Implement a bounded English/Traditional Chinese parser for clearly supported
phrases and furniture names.

Do not pretend arbitrary natural language is fully understood.

Return:
- Interpreted preferences.
- Ambiguous references.
- Unsupported requirements.
- Interpretation mode.

Show interpretation as rule-based in the UI/documentation.
Require user confirmation when text adds or changes preferences.

Examples:

“Don't move the sofa”
→ Preserve that sofa at its baseline position for this session.

“Change less”
→ Prefer fewer changed items and less displacement/rotation.

“Keep the table closer to the sofa”
→ Add a soft distance preference for the selected pair.

“I don't like this position”
→ Record an avoided position region for that item.

“Keep the entrance clear”
→ Evaluate a defined entrance zone only when suitable door/zone data exists.

If feedback conflicts with an existing constraint:
- Explain the conflict.
- Let the user change the constraint through existing controls.
- Do not override it inside generation.

If feedback conflicts with an earlier preference:
- Show the conflict.
- Let the user replace or revise the earlier preference explicitly.

Do not accumulate impossible contradictory requirements silently.

Subjective or unsupported feedback must remain visible in history.
Do not invent a metric for it.


10. PROPOSAL GENERATION

Implement a bounded heuristic search using existing geometry.

Possible approach:
- Use baseline as the reference.
- Identify eligible furniture in the target room.
- Sample a bounded set of positions and supported rotations.
- Evaluate single-item and limited small multi-item changes.
- Validate candidates.
- Rank feasible candidates using confirmed preferences.
- Select a distinct useful alternative.

Use deterministic behavior where practical.
Document search limits and tolerances.

Prevent main-thread blocking with a feasible asynchronous/chunked approach.
Do not introduce a complex worker architecture unless necessary.

HARD CONSTRAINTS

Respect:
- Room boundaries.
- Wall collisions.
- Furniture collisions.
- Existing distance constraints.
- Existing position-lock semantics.
- Session “keep in place” requirements.
- Door/reserved zones where already modeled.

Do not redefine existing position-lock behavior.
For session “keep in place”, preserve the baseline transform unless
the user explicitly allows rotation.

If baseline contains existing conflicts:
- Disclose them.
- Do not label baseline valid.
- Present a candidate as feasible only after it passes applicable checks.
- Return an honest failure when fixed constraints prevent a validated result.

SOFT OBJECTIVES

Use only implemented measurable objectives:
- Number of changed items.
- Displacement from baseline.
- Rotation changes.
- Occupation of a selected open-space zone.
- Selected pair-distance preference.
- Avoided positions/orientations from feedback.

Do not use total free-floor area as proof of better circulation when the same
furniture footprint remains unchanged.

Do not claim local clearance proves a connected whole-room walking route.

Explain ranking priorities.
Do not present arbitrary scores as professional design standards.

AFTER REJECTION

Use canonical layout signatures with documented tolerance.

Avoid:
- Returning the same layout with different wording.
- Treating a tiny coordinate change as a meaningfully new solution.
- Ignoring furniture-specific rejection feedback.

If no distinct suitable candidate is found:
- Say no new suitable proposal was found within the search limits.
- Identify relevant constraints or preference conflicts.
- Offer concrete user-controlled changes.

Do not claim no possible layout exists unless the search is exhaustive.
Do not relax requirements automatically.

If baseline already meets the evaluated goals and no useful alternative
is found, explain that rather than moving furniture arbitrarily.


11. GROUNDED EXPLANATIONS

Use deterministic explanation templates based on actual candidate data.

For each proposal, explain:
- What changed.
- Which user request it addresses.
- Which evaluated metric supports the claim.
- What becomes less favorable.
- What remains unverified.

Good:
“Moved the table away from the selected entrance zone.
Its overlap with that zone decreased, but its distance from the sofa increased.”

Bad:
“This is the perfect layout and improves comfort by 90%.”

Do not claim improvement when metrics do not show it.
Distinguish preference satisfaction from geometric feasibility.

Do not claim AI generation in this heuristic implementation.


12. PREVIEW, APPLY, AND UNDO

Preview must not mutate committedLayout.

Both 2D and 3D must use the same proposal data.
Clearly indicate preview mode.

Disable direct editing of the proposal preview unless the interaction is
explicitly isolated from committed state.

Accept:
- Verify revision freshness.
- Revalidate current constraints.
- Apply the previewed transforms atomically.
- Preserve item IDs, dimensions, and unrelated fields.
- Record pre-application state for undo.

Reject/discard:
- Leave committedLayout unchanged.

Undo:
- Restore the pre-application layout.
- Check for intervening edits or changed constraints.
- Warn rather than overwrite newer work.
- Follow existing undo infrastructure if suitable.


13. TESTING AND MANUAL ACCEPTANCE

Add focused tests for:
- Request interpretation.
- Preference accumulation.
- Contradictory feedback.
- Constraint preservation.
- Candidate validation.
- Rejected-layout deduplication.
- Draft isolation.
- Apply and undo.
- Stale sessions.
- Cancellation/late-result handling where applicable.

Required acceptance scenarios:

A. Initial proposal
A suitable fixture produces real validated changes.
Committed state remains unchanged before acceptance.

B. Keep an item fixed
All rounds preserve the selected item's baseline transform.

C. Reject and revise
A rejection reason changes the actionable preferences.
The next proposal is meaningfully different.

D. Constraint-limited search
The system reports no suitable candidate without bypassing constraints.

E. Accept and undo
Applied layout matches the preview.
Undo restores the immediately preceding real layout.

F. Manual edit during a session
The previous proposal becomes stale and cannot overwrite the edit.

G. Unsupported requirement
A request such as warmer lighting is labeled unsupported.
No lighting result is fabricated.

H. No external AI
The complete workflow works without an API key.
The UI accurately identifies rule-based/heuristic behavior.

I. Existing functionality
Dragging, rotation, locks, replacement, Before/After, translations,
and 2D/3D synchronization still work.

Read package.json and run available checks:
- Type checking.
- Lint.
- Relevant tests.
- Production build.

Do not assume script names exist.
Do not claim browser/mobile checks unless actually performed.
Avoid repeated full test runs after minor changes.


14. DOCUMENTATION

Update relevant documentation with:
- Feature purpose.
- User flow.
- Skill location and development-only role.
- Internal tool responsibilities.
- Supported and unsupported needs.
- Hard constraints versus soft preferences.
- Candidate generation and ranking.
- Baseline/draft/committed-state semantics.
- Feedback conflict handling.
- Search limits.
- Failure behavior.
- Setup and available check commands.
- Manual acceptance checklist.

State clearly:
- No new AI API is required for this implementation.
- No new MCP server is required.
- The Skill is not the website's runtime designer.
- The heuristic is not a guarantee of globally optimal design.
- Results rely on the dimensions and constraints represented in the app.

Provide a repeatable demo:
request → proposal → rejection with reason → revised proposal
→ accept → undo.

Do not fabricate demo success or measured user benefits.


15. FINAL REPORT AND STOP

Report:
- Files changed.
- Implemented feature flow.
- Skill created/updated.
- Internal tools added/reused.
- Actual interpretation/generation mode.
- Checks run and results.
- Required setup, if any.
- Unsupported requests and remaining limitations.
- Remaining manual desktop/mobile checks.
- How to run the repeatable demo.

If a requirement cannot be completed safely within available time,
state it explicitly.

Do not substitute a mock and describe it as real functionality.

Stop after implementation and reporting.
Do not commit, push, deploy, or add new services.