# Development record

This record separates what existed before the hackathon from what was built during it, using verifiable repository evidence (Git history, tests and changelog).

## Baseline before the event

- Repository creation: first commit `e6dad91`, **2026-10-29** ("Initial commit").
- **Owner confirmation required:** state whether any code, designs or assets existed before this first commit (for example in another repository or as prototypes). Git history alone cannot establish that.
  - Owner statement: _______________________________________________

## Built during the event (2026-10-29 to 2026-11-04, 50 commits on record)

| Date | Milestone (commit evidence) |
| --- | --- |
| 2026-10-29 | Phase 1 foundation (`a35390d`); procedure schema and deterministic verifier (`345bb96`); browser recording and voice (`bf71a80`); first live SAM and Muse calls (`89702c4`); Teach upload/recording (`57267b2`); first automatic Teach → Practice flow (`67312f3`) |
| 2026-10-30 | Live end-to-end grounding and verification (`dc1359a`); simplified Teach → Practice flow with goals (`d0a6cd9`) |
| 2026-10-31 | Teach accuracy and occlusion handling (`04ab6db`); autonomous browser Practice (`a391db8`) |
| 2026-11-01 | Authoritative verification behaviour and latency (`40e566a`); Practice liveness and controls (`56bf93e`, `ca07327`) |
| 2026-11-02 | Muse Spark Open migrated to Baseten (`ce0c4b9`); 60-second Teach limit (`7dbcb85`); V3 execution contract for Teach procedures (`088bf65`) |
| 2026-11-03 | Voice and gesture control in the browser (`a79150a`); physical tracking in Practice (`c3d549e`); live end-to-end test harness and versioning (`123f3b1`); Felicity wired into Teach (`b506b6a`) |
| 2026-11-04 | Felicity Teach repair loop, live Practice setup from SAM 3.1 camera localization, camera-independent tracking, Felicity supervisor, research study (`7c376d0` … `0b20862`; see [CHANGELOG.md](CHANGELOG.md) 0.12.0–0.16.x) |

### Main features built

- **Teach:** recording/upload, Muse Voice Transcribe transcript, SAM 3.1 video tracking, Muse Spark Open (Baseten) component discovery and V3 procedure drafting, deterministic source-evidence validation.
- **Felicity:** Teach audit; bounded repair (SAM re-anchoring of lost objects; draft rebuilt from measured movement windows, kept only if validators accept it); Practice recovery advice and supervised re-localization.
- **Human review:** evidence review, zones, final goal, one-step "Approve and practice".
- **Practice:** SAM 3.1 startup localization in the learner's camera, local browser tracking worker, deterministic verifier and final-goal gate, reversal invalidation and recovery, Gideon voice guidance, voice and gesture commands.

## Evidence categories

| Category | Evidence |
| --- | --- |
| Unit and mocked-provider tests | `npm test` (Vitest, 87 files / 773 tests at version 0.16.x); live calls blocked by `tests/setup-no-live.ts` |
| Browser tests (mocked providers, generated camera input) | `npm run test:e2e` (Playwright) |
| Live model API checks | Explicit `smoke:*` scripts and owner-authorized paid end-to-end runs logged in the local paid-run ledger; SAM 3.1 camera localization was also exercised on the owner's real camera frames |
| Recorded-frame replay | Owner's real camera frames replayed through the production tracker and verifier (CHANGELOG 0.15.x–0.16.x) |
| Physical-camera acceptance | Recorded separately in [docs/PHASE6_ACCEPTANCE.md](docs/PHASE6_ACCEPTANCE.md); this record does not claim a completed physical Teach-to-Practice acceptance |
