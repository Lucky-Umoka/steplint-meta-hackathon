# Teach V3 Phase 2: approval, persistence and Teach → Practice handoff

Date: 2026-11-02. Branch `fix/phyical-practice-test`, starting commit `088bf65`. The owner explicitly authorized Phase 2 on 2026-11-02 after the "V3 approval and Practice execution are deferred to Phase 2" blocker stopped Practice. Nothing was committed, pushed or deployed. **STOP after Phase 2: Phase 3 needs separate approval.**

## 1. Files changed

- New: `src/teach/revision.ts`, `src/teach/rehearsal.ts`, `tests/v3-handoff.test.ts`.
- Changed:
  - `src/procedure/schema.ts`: Phase 1 ban removed; V3 approval must carry `approval.revision`.
  - `src/teach/schema.ts` (`approveDraft`): Phase 1 throw removed; stamps the revision.
  - `src/teach/review-suggestions.ts`: Phase 2 blocker removed; adds `reviewStepInput`.
  - `src/server/teach/http.ts` (`approve`): requires setup frames for V3; stamps the final revision; binds rehearsal.
  - `src/teach/approved-artifact.ts`: rehearsal field, stale-approval and stale-rehearsal checks, V2 isolation.
  - `src/teach/automatic-setup.ts`: `automaticSetupIssue`.
  - `src/practice/lesson.ts`: V3 setup is required and must be consistent.
  - `src/app/teach/review.tsx`: review contract without suggestion metadata; no silent `automaticSetup = undefined`; rehearsal revision and status.
  - `src/app/practice/local-practice.tsx`: records the verifier's terminal status per revision.
- Tests and e2e: `tests/teach-v3.test.ts`; `e2e/teach-v3.spec.ts` now expects approval to stay blocked by the unsupported required work in that scenario.

## 2. Persistence and validation

The existing approve route, approved artifact, IndexedDB store (`approved-storage.ts`) and canonical loader (`loadApprovedLesson` → `PracticeLessonSchema`) carry the complete `ProcedureSpec`: roles, motion, activation, reference frames, step windows and claims, required objects, requirements, predicates and goal step IDs, plus zone bindings and automatic setup. There is no parallel format or second loader. `ApprovedArtifactSchema` re-validates the V3 contract at every save, list and load. For V3 it also requires automatic setup that matches the procedure's objects and frames, a matching revision, and a rehearsal record.

## 3. Revision identity

`executableRevision` is a SHA-256 of canonical JSON (sorted keys) of the procedure without its approval stamp, the zone bindings and the setup geometry. It covers frame indices and boxes but not the JPEG bytes, which are re-extracted from the same reviewed frames. It is computed by the same synchronous code in the browser and on the server; a test checks it against Node's `crypto`. The handler stamps `approval.revision` after binding setup. On load the revision is recomputed, and any executable edit gives "This approval is stale … approve it again in Teach". This was tested for edits to a step description, a role, a requirement, a zone region and a setup box.

## 4. Rehearsal status

`not_run | failed | passed`, bound to a revision and labelled `source: browser_rehearsal` (never physical acceptance).
- Teach's **Test in Practice** hands the rehearsal revision to the Practice tab.
- Practice writes a record only when the canonical verifier's overall status becomes `passed` or `failed`. Loading, rendering, pending, in-progress and needs-verification record nothing.
- A later pass after a failure keeps `hadViolations: true`.
- At approval the server keeps the claimed rehearsal only if its revision equals the approved revision; otherwise it records `not_run`.
- A stored rehearsal for another revision makes the artifact fail to load.
- Approval does not require a passed rehearsal; the status is shown truthfully.

Limitation: the record is reported by the browser (local trust model, like the existing local artifact provenance). It is not cryptographically authenticated.

## 5. V2 compatibility

V2 artifacts load through the unchanged path and stay `schemaVersion: 2`. They have no revision or rehearsal, and a V2 artifact carrying V3 fields is rejected rather than upgraded. Executionless older approvals keep their existing re-review message.

## 6. Handoff tests (`tests/v3-handoff.test.ts`, real handler + real storage module on an in-memory IndexedDB + real loader; fetch blocked)

| Test | Covers spec items | Result |
| --- | --- | --- |
| SHA-256 equals Node crypto | revision correctness | pass |
| compile → review → approve → IndexedDB save/reload → Practice loader, full contract compared, no receipt or token | 1–7, 11 | pass |
| missing setup → 422; missing or inconsistent setup → loader and Practice schema reject | 8 | pass |
| five executable edits → stale approval; reused rehearsal revision → rejected | 9 | pass |
| mismatched, missing and failed rehearsal never become passed; only terminal verifier status records | 12 | pass |
| V2 loads unchanged; V2 with V3 fields rejected | 10 | pass |

## 7. Verification

- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 errors, the same 5 pre-existing warnings.
- `npm test`: 596 passed in 69 files.
- `npm run build`: exit 0.
- `npx playwright test`: 36 passed, 1 skipped (that test was already skipped before this work), in 4.0 minutes. This covers Practice, rehearsal, voice, gestures, library, the handoff and Teach.

All provider responses in automated tests are mocked. Phase 2 itself made no live call. The owner-authorized live Teach tests are recorded separately in `TEACH_SOURCE_EVIDENCE_FIX.md`.

## 8. Defects found while integrating (fixed)

- The review screen sent suggestion-only `evidenceStatus`/`evidenceReason` inside review steps, and the strict review schema rejects them. Every V3 approval and rehearsal would have failed; the Phase 1 gate had hidden this. Fixed with `reviewStepInput` (the schema stays strict).
- Rehearsal silently continued with `automaticSetup = undefined` when frame extraction failed. It now shows an actionable error.

## 9. Remaining limitations and risks

- Practice still executes V3 lessons through the existing step/measurement/zone engine. Roles, activation and predicates are preserved but not yet used at runtime; watch sets, alignment and identity recovery are Phase 3+.
- No physical-camera acceptance was run.
- The owner's last upload `HTTP 404` came from the server the browser reached, not StepLint's route: the current code returns the expected JSON `401` for an unauthenticated upload. A deployment needs these uncommitted changes redeployed.

## Completion pass (2026-11-02, owner: "finish Phase 2 gaps"; hotfix section in IMPLEMENTATION_FIXES.md deliberately not applied)

The owner chose to ignore the "SURGICAL HACKATHON DEMO FIX" text for now. It weakens evidence/approval rules and belongs to Phases 3–4. Role, step and goal corrections use the existing Advanced rule editor; no UI redesign.

**Added**
- `src/teach/finalize-approval.ts`: the approve handler's setup binding, revision stamp and rehearsal binding, moved out of the server-only handler. The handler now calls it, and the browser test's approve mock runs the same code.
- `parseApprovedArtifact` (`src/teach/approved-artifact.ts`), used by storage and the Practice loader. An invalid saved lesson now shows "This saved lesson cannot be used: …" instead of a raw validation dump. This was found by the browser journey.
- `e2e/v3-journey-fixture.ts` and `e2e/v3-handoff.spec.ts`. Real browser, real IndexedDB, real Teach review, Practice library and loader; mocked models; paid requests blocked.
- One handler test in `tests/v3-handoff.test.ts`.

**"What to test" list, Phase 2**

| Item | Evidence | Result |
| --- | --- | --- |
| 1 create a V3 lesson | browser journey (mocked compile) | pass |
| 2 review and correct roles, step and final goal | Advanced rule editor: irrelevant→supporting role, step text, goal | pass |
| 3 approve, 4 save | UI buttons; stored raw equals the approval response | pass |
| 5 reload, 6 select in Practice | `page.reload()`, library card → Practice link | pass |
| 7 every field unchanged | procedure, zones, setup, roles, windows, execution, revision compared | pass |
| missing setup prevents loading | browser: readable alert, no camera; module and Practice schema | pass |
| editing invalidates approval and rehearsal | browser: stale approval alert; module: 5 edit kinds + reused rehearsal | pass |
| failed rehearsal never labelled passed | module (`nextRehearsal`, `bindRehearsal`) | pass |
| V2 readable, not upgraded or presented as validated | module test + existing V2 browser journey | pass |
| V3 cannot bypass validation | real handler: tampered evidence, unsupported work, self-approval, unconfirmed goal → rejected | pass |

**Verification:** `tsc` exit 0; lint 0 errors (same 5 warnings); `npm test` 597 passed in 69 files; build exit 0; `npx playwright test` 37 passed, 1 skipped (that test was already skipped before this work).

**Not covered here (by design):** these tests prove the data contract and handoff, **not** camera execution. Rehearsal recording from a live verifier run is covered at module level only; a browser rehearsal that reaches verifier `passed` needs Phase 3 camera work. No live model call and no physical-camera test were made in this pass.

**Noted, not changed:** one invalid stored lesson makes the whole Practice library show an error (an existing `listApprovedProcedures` behaviour). Changing it would alter library behaviour, so it is left for the owner to decide.

**STOP: Phase 3 requires explicit owner approval.**
