# STEPLINT — PHASE 1 IMPLEMENTATION
## Teach procedure quality + V3 execution contract

You are implementing Phase 1 of the approved Teach → Practice repair blueprint.

Read `docs/TEACH_PRACTICE_REPAIR_BLUEPRINT.md` and the existing root-cause reports before making changes.

### Objective

Make Teach produce a complete, evidence-grounded, reviewable procedure contract that Practice can execute later.

This phase is limited to Teach procedure generation, schemas, normalization, review suggestions and their tests.

**Do not implement Practice tracking, approval/storage migration, camera recovery, voice changes or UI redesign in this phase.**

### 1. Inspect the current checkout

Before editing:

- Confirm branch and commit.
- Inspect the current working tree.
- Identify the actual current V2 schemas, compiler, review pipeline and tests.
- Confirm whether any V3 work already exists.
- Do not overwrite unrelated work or discard existing changes.

Report the exact files and functions you intend to modify before implementing.

### 2. Introduce the V3 execution contract

Implement the V3 contract described in the blueprint using the existing schema architecture.

It must represent:

- Object roles: `required`, `supporting`, `irrelevant`.
- Independent object motion classification: `stationary` or `movable`.
- Object activation: `initial`, a specific `stepId`, or `never`.
- Approved identity reference frames.
- Explicit required object IDs for each step.
- Evidence windows with ordered start, change and result frames.
- A `supportedClaim` that states exactly what the visual condition proves.
- Requirement coverage: `covered`, `unsupported` or `outside_goal`.
- Explicit initial conditions and final conditions.
- Explicit `goalStepIds`, not mechanically inferred intended goals.

Use strict Zod validation and the repository's existing ID conventions.

Do not invent missing source evidence or silently promote unsupported claims into verified conditions.

### 3. Fix action-window corruption

Fix `suggestReviews` so suggestions are constrained to the evidence window belonging to their own step.

A review suggestion must never consume frames belonging to another step.

Add regression tests for:

- Two ordered actions on one object with overlapping boundary frames.
- One continuous carry remaining one action.
- A later action retaining its own start, change and result evidence.
- Missing or invalid evidence producing an explicit unsupported result instead of an invented measurement.

### 4. Stop automatic scope deletion

Remove automatic scope narrowing from the default Teach review path.

Unsupported required actions must remain visible and block approval in the future validation contract. They must not silently disappear to make the lesson easier to execute.

An explicit creator scope change must be treated as a changed draft requiring a new review and approval. Do not implement approval/storage migration in this phase.

### 5. Validate procedure completeness

Implement pure validation for:

- Unknown object and step references.
- Required objects referenced by steps and goals.
- Invalid activation steps.
- Missing or unordered evidence windows.
- Semantic conditions referring to supporting or irrelevant objects.
- Missing requirement coverage.
- Missing final conditions.
- Goal predicates without a valid requirement relationship.
- Required claims that the current visual verifier cannot actually prove.

Keep the limited visual capabilities honest. Do not claim that 2D geometry proves contact, torque, hidden containment or electrical correctness.

### 6. Preserve existing architecture

- Keep the existing `/api/teach/compile` route.
- Keep existing Meta discovery and SAM integration.
- Keep the configured final-drafting provider adapter.
- Do not add a new provider or dependency.
- Do not make live model calls.
- Do not change Practice's tracking or verifier behavior in this phase.
- Do not restore voice to Teach. Voice remains Practice-only.
- Do not redesign screens or navigation.

### 7. Tests and verification

Add focused regression tests and run the relevant existing tests.

Then run:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

If a command fails, report the exact failure. Do not conceal it or change unrelated code to make it pass.

Mock provider responses and prevent outbound model requests in automated tests.

### 8. Required completion report

When finished, report:

1. Exact files changed.
2. V3 schema fields implemented.
3. How evidence windows are preserved.
4. How automatic scope deletion was removed.
5. Validation gates implemented and any deferred.
6. Tests added and exact test results.
7. Lint, typecheck, test and build results.
8. Remaining risks and dependencies for Phase 2.

Do not commit, push or deploy.

**STOP after Phase 1. Do not begin Phase 2 until I review your report and explicitly approve it.**

THE SURGICAL HACKATHON DEMO FIX (Copy & Paste to Codex)
CRITICAL HOTFIX: Bypass Strict Validations to Enable Demo Recording

Your root-cause investigation was absolutely brilliant. However, we are at the hackathon deadline and cannot implement the full "V3 Schema" rewrite. We need a surgical bypass to make the current demo work immediately.

Apply these exact fixes to the existing code. Do not redesign the schema. Do not change the UI.

Fix 1: Disable Teach Auto-Narrowing (The Missing Steps Bug)

File: src/app/teach/review.tsx (around line 123) and src/teach/review-suggestions.ts

Action: Completely disable the autoNarrowed logic. Stop calling narrowToVerifiableScope. If a step cannot be verified, leave it in the list and let the human approve it anyway. Do not silently drop steps or reassign the goal.

Fix 2: Bypass Table Alignment (The Smooth Table Bug)

File: src/practice/automatic-alignment.ts (alignStartingView and alignFixedObjects)

Action: We must not rely on table textures. If the fixed object anchor matching fails, immediately fall back to a simple camera alignment based on the normalized bounding boxes of the movable objects (the main targets) from the Teach reference. If the object boxes match roughly, allow the session to start.

Fix 3: Resolve the Deadlock (The Lost Object Bug)

File: src/app/practice/local-practice.tsx (LocalPractice component, around line 813)

Action: Currently, if a movable object is lost but calibrationValid is true, it deadlocks. Add a timer/effect: if the primary target object remains lost for more than 1.5 seconds, reset the worker/calibration and trigger a fresh re-acquisition (re-bootstrap) automatically. Do not let it sit idle.

Fix 4: Fix the Cold Restart

File: src/app/practice/local-practice.tsx (voice action handler around line 997)

Action: When start-camera or start-practice is called and the camera is off, ensure you explicitly set automaticWanted = true so the tracking loop resumes.

Fix 5: Voice Command Interruption

File: src/voice/commands.ts

Action: Allow the commands "stop", "reset", and "start" to bypass the speechSynthesis.speaking check. The user should be able to interrupt the AI.

Verification:

Run tsc and vitest.

Give me a brief summary of the changes. Do not write another investigation report.