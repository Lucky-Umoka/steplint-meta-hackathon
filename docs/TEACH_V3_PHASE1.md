# Teach V3 — Phase 1 implementation record

Date: 2026-11-02. Starting checkout: `fix/phyical-practice-test`, `b769d8f`.

Scope is the owner's confirmed V3 Teach contract and tests only. The conflicting demo-bypass section of `IMPLEMENTATION_FIXES.md` was not implemented. No live model calls, new dependencies, commits, pushes or deployments.

## Result and boundary

Canonical local Teach drafting now requires a V3 response through the existing configured Spark adapter. New draft data contains explicit roles, activation, action windows, coverage and scene goals. Strict schema/source validation rejects incomplete or unsupported evidence rather than manufacturing executable intent. Existing V2 validation and approval tests remain covered for compatibility.

**V3 remains a reviewable draft in this phase. It cannot be approved, saved as a new approval, rehearsed through the V2 verifier or practiced yet.** Both review blockers and schema approval validation enforce this boundary so the old verifier cannot silently ignore V3 final conditions. Approval/storage migration and Practice execution belong to the next owner-authorized phase. This intentionally means a fresh canonical V3 Teach build cannot currently finish the Teach-to-Practice journey.

## Fields and validation

- `component.execution`: `role`, `roleReason`, independent `motion`, `firstRequiredAt` (`initial`, `{stepId}`, `never`), and numeric source `referenceFrames`. Numeric frames follow existing Teach frame conventions; these are source references pending human approval, not a claim of approval already granted.
- `step.execution`: `requiredObjectIds`, exact ordered `evidenceWindow`, `supportedClaim`, and an explicit `zone_transition` capability. Mechanical measurement defaults use those exact frames and never derive missing intent.
- `execution.schemaVersion=3`: explicit `goal`, `goalStepIds`, initial/final scene predicates and requirements with stable IDs, capability, coverage status, step IDs and goal-predicate IDs.
- Predicates are limited to `object_in_zone` and `projected_separation`, with actual source frames. No contact, torque, hidden containment or electrical-success predicate is accepted.
- Validation checks unique/known IDs, required semantic roles, movable transfer objects, legal activation/first use, step coverage, source-window ordering, final-goal coverage relationships and source evidence. Initial/final predicates need a shared source scene rather than unrelated successful moments. Reviewed position predicates must match their reviewed source regions.
- Source checks require actual tracked frames/timestamps and the existing 0.90 confidence policy. Required references must be observable at the owning action's start/result; later objects do not become globally mandatory initial objects in the contract. Missing source evidence is rejected explicitly.

## Action windows and scope

`suggestReviews` restricts each action to its own V3 window; the exact change frame is retained. Older drafts use their existing source-frame or note interval instead of the complete object track. Two actions can share one boundary frame without the first consuming the second. V3 missing/invalid/uncertain evidence returns an explicit unsupported suggestion with no invented regions or change frame.

The default Review component no longer calls `narrowToVerifiableScope`. Requirements and steps remain in the draft, including unsupported required work. Existing editor edits reset review/confirmation state. The old pure narrowing helper remains for historical callers/tests; it is not an automatic default or implicit approval operation.

## Verification record

The initial focused run caught a compatibility mistake: suggestion metadata was included in valid V2 approval input. It was corrected so V3-only status fields do not alter the valid V2 review contract. Another old compiler test was updated to provide the new canonical V3 wire format; it still checks repeated actions and retention of unsupported requirements. No validation was weakened to obtain passing checks.

Final results:

| Command / evidence | Actual result |
| --- | --- |
| Focused initial regression: `npx vitest run tests/teach-v3.test.ts tests/teach.test.ts tests/local-teach-contract.test.ts tests/automatic-setup.test.ts` | 107 passed after correcting the metadata compatibility issue; further source-validation cases were then added |
| `npm run lint` | Exit 0; 0 errors, 5 warnings in unchanged `local-practice.tsx` / `local-teach.tsx` lines (unused suppression and image optimization advice). Those unrelated files were not edited. |
| `npm run typecheck` | Exit 0; Next route generation and `tsc --noEmit` passed |
| `npm test` | 538 tests passed in 65 files, including 29 new V3 cases; final full run after the last source change passed |
| `npm run build` | Exit 0; optimized webpack compilation, TypeScript, static generation and route output passed on final source |
| `QA_BASE_URL=http://127.0.0.1:3317 npm run test:e2e -- e2e/teach-v3.spec.ts` | 1 mocked browser test passed against the production build: complete two-action V3 scope survives canonical upload/build/review, unsupported requirement remains, evidence windows/goal data preserved, approval disabled and no approval request sent |
| `git diff --check` | Passed |
| Physical-camera, actual microphone/gesture, paid provider and deployment tests | Not run; no corresponding acceptance claimed |

The browser's upload/compile responses were mocked; provider requests were blocked. It did not test actual model analysis or Practice tracking. The temporary production test server on port 3317 was stopped. Next-generated tracked route-reference changes were restored; no generated configuration change is part of the patch.

## Exact files changed

Source:

- `src/procedure/execution-v3.ts` — new strict V3 field schemas.
- `src/procedure/schema.ts` — V2/V3 union, references/roles/coverage validation and Phase 1 approval guard.
- `src/server/teach/pipeline.ts` — canonical V3 compiler wire format, prompt and parser through the same adapter.
- `src/teach/local-execution.ts` — retain V3 intent and source windows; mechanical defaults only, with source checks when context is available.
- `src/teach/v3-evidence.ts` — new pure source-frame, visibility, motion and scene-evidence validation.
- `src/teach/schema.ts` — source/review validation integration and explicit V3 draft-only approval boundary.
- `src/teach/review-suggestions.ts` — own-window suggestions, unsupported status and scope/phase blockers.
- `src/app/teach/review.tsx` — remove automatic narrowing and obsolete notice; retain unsupported scope and existing editor/reset behavior.

Tests:

- `tests/fixtures/teach-v3.ts` — deterministic one-/two-action source fixture.
- `tests/teach-v3.test.ts` — 29 cases covering intent preservation, evidence windows, references/roles, later visibility, unsupported work, final predicates and canonical parser boundaries.
- `tests/local-teach-contract.test.ts` — update canonical repeated-action compiler test to V3 while retaining V2 compatibility tests.
- `e2e/teach-v3.spec.ts` — mocked canonical-page regression.

Documentation:

- `docs/DECISIONS.md` — short V3 staging decision.
- `docs/TEACH_V3_PHASE1.md` — this implementation/verification record.

Deliberately unchanged: `src/practice/`, `src/app/practice/`, `src/voice/`, `src/procedure/verifier.ts`, discovery/SAM/provider adapters, approval HTTP handlers, storage/artifact migration, layout/styles/navigation, media limits, environment configuration and the owner's input/planning documents.

## Remaining risks and Phase 2 dependencies

- No new real Meta/Baseten call or physical Teach acceptance occurred. Model action completeness and correct physical object selection remain unproven; the contract rejects invalid data but cannot prove that arbitrary prose truthfully describes a physical task. Typed capabilities and human review constrain those claims.
- Final drafting still receives bounded geometry/narration through the existing adapter, not a newly implemented video understanding path. Discovery and SAM remain unchanged on Meta. Uniform representative sampling can miss short actions; missing evidence must remain unsupported.
- Existing four-object, media/body and source-frame bounds remain unchanged. A full intended phone/tool sequence exceeding those bounds needs an explicit later capacity decision, not silent scope deletion.
- Object-relative live zone grounding, role-aware Practice watch sets, final-predicate runtime evaluation, bounded identity recovery, shared camera/start lifecycle and Practice voice acknowledgment are not implemented here.
- V3 approval/storage/rehearsal migration must preserve all fields and revision identity before enabling new-guide execution. Do not simply remove the Phase 1 approval guard while Practice still runs V2 semantics.
- No desktop/mobile screenshot comparison or actual physical-camera, microphone or gesture acceptance is claimed. The Review source diff preserves layout/styles and removes only automatic narrowing and its obsolete notice, with revised unsupported-work copy.

Only Phase 1 was implemented. Phase 2 requires explicit owner approval.
