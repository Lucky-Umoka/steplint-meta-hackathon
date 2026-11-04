# Felicity — deferred work (after the demo)

Status today (v0.15.3): Felicity audits Teach drafts, repairs Teach (re-anchoring lost tracking with SAM views; rebuilding a draft from measured movement windows — one bounded Spark call), explains Practice incidents (one Spark call per incident) and triggers a bounded supervisor that re-locates objects with SAM and restarts live setup (≤4 per 5 min). The supervisor's decisions are deterministic code; Felicity's Spark output does not yet choose the repair.

## 1. Felicity chooses and supervises Practice repairs (closed-action loop) — ~2-3 h
- Input digest computed in code: incident (id, kind, generation, revision), verifier status, tracker quality per object, last N observations, budget counters.
- Allowed actions (Zod enum, one per turn): `relocate_objects` (one SAM 3.1 image locate), `restart_live_setup`, `advise_user`, `wait`, `stop`. No action can write a verifier pass/fail.
- Budget per incident: ≤3 turns, ≤1 SAM locate, ≤1 restart; existing Spark caps.
- Stop when: the deterministic verifier's state changes, budget spent, the same action repeats (hash of action+args), Felicity returns `stop`, the user cancels, or the generation changes.
- Stale rule: apply a reply only if generation, revision, incident id and an action epoch match and no other action is in flight; log dropped replies.
- Tests: stale reply, budget, repeated action, verifier authority (no pass from Felicity), duplicate incident.
- Source of the pattern: meta-model-cookbook agent loop and voice runtime (see docs/EXTERNAL_REPO_ARCHITECTURE_RESEARCH.md).

## 2. Locate honesty and geometry — ~45 min
- Scale SAM boxes by the record's own width/height (not the client-declared size); reject mismatches.
- Return a typed error vs "absent" (a failed request is not "object missing").
- Several instances of one noun: disambiguate with the reviewed Teach box/point, or mark ambiguous.

## 3. SAM protocol conformance in Teach — ~30 min
- Accept later mask revisions (replace, do not reject) and warning diagnostics that keep records (`src/server/teach/pipeline.ts`).

## 4. Durable spend ledger — ~90 min
- One choke point for Meta and Baseten calls with reserve-then-settle accounting persisted outside memory (serverless instances do not share in-memory limits).

## 5. Evidence UX — ~45 min each
- Felicity audit findings seek the Teach video at their timestamp.
- Determinate SAM progress (done/total) during Teach.

## 6. Gideon as a live coach — ~1-2 h
- Context-aware lines from the verifier state and observed motion (approaching the target, wrong destination, lost from view) rather than fixed sentences; proactive prompts when the learner is idle.
