# Practice Phase 4: lifecycle, start/resume reliability and voice

Date: 2026-11-03. Owner-authorized. Not committed, pushed or deployed. No paid calls were made. **STOP: Phase 5 needs owner approval.**

## Owner decisions
- "What next" and "what should I do next" are aliases of the existing **repeat** action.
- **Restart** (with confirmation) archives the current attempt into the audit and starts a fresh automatic attempt, with the camera on or off.
- **Half-duplex** on canonical Practice: a valid wake-word command stops app speech and runs. Text matching recent app speech is ignored, and app speech no longer starts with a wake word.
- Legacy `/teach?legacy=1` voice is left unchanged. Canonical Teach is voice-free.

## 1. Defects found
- **L1:** start paths disagreed. The Start camera button and voice start/start-camera did not re-enable automatic tracking after a pause, so the camera ran without tracking.
- **L2:** voice "restart" opened manual capture.
- **L3:** a silent worker left Practice busy forever.
- **L4:** Practice showed running before the verifier armed, with no lifecycle diagnostics.
- **V1:** valid commands were dropped while the app was speaking.
- **V2:** commands were reported as "Command sent" before any outcome.
- **V3:** app speech contained wake-word phrases.
- **Found during testing:**
  - My first shared operation broke manual-calibration voice start; it was fixed and the existing test passes.
  - My worker-timeout path didn't retry, because it read an already-cleared setup flag; this was fixed.

## 2–4. Controller and behaviour
- `src/practice/lifecycle.ts` is a pure state machine with the states idle, requesting_camera, acquiring_initial_objects, arming, running, paused, recovering, blocked and ended. It ignores events from stale generations and keeps the last transition and safe diagnostics.
- `ensurePracticeRunning(intent)` in `local-practice.tsx` is the one start/resume/restart operation, used by the Start camera, Resume, Retry and Pause buttons and by every voice command. It resolves only when the state reaches running (the verifier is armed), or on blocked, paused or ended, or after a 45 s timeout.
- **Repeated starts** while starting or running create no second worker.
- **Start while paused** resumes and keeps verified work.
- **Pause** keeps the camera and the session.
- **Manual-calibration lessons** keep their existing rules, run through the lifecycle.

## 5. Timeouts and stale replies
- Setup must reply within 15 s and each frame within 3 s. Otherwise the worker is terminated, the generation is bumped (late replies are ignored), and automatic lessons retry up to 5 times before blocking.
- Stale generation and watch-set replies are ignored.
- The diagnostics line in Control settings and the downloaded export include the lifecycle state, history and identity audit.

## 6. Voice
- Commands move through received → accepted/rejected → dispatched → completed/failed.
- Duplicates are blocked by the existing 1.5 s same-final rule, and a command that is already in flight can't be dispatched again.
- The self-speech filter uses the last 15 s of app speech.
- The parser rule is opt-in, so other pages keep the old interrupt-only rule.

## 7. Results (automated: synthetic camera and mocked speech, not a real microphone or camera)
- `tsc` exit 0.
- Lint: 0 errors, the same 5 warnings.
- `npm test`: **645 passed in 74 files**, including the new `practice-lifecycle` (9) and `practice-voice` (10) tests.
- Build exit 0.
- `playwright`: **42 passed, 1 skipped** (that test was already skipped before), including the new `practice-lifecycle.spec.ts` (5).
- Two existing voice e2e expectations were updated to the owner-approved half-duplex rule.

## 8. Risks
- Browser speech recognition varies.
- The self-speech filter relies on the content of the transcript.
- Synthetic tests are not microphone acceptance.

## 9. Manual test (Chrome, real camera and microphone, approved bottle lesson)
1. Open Practice. **Expect:** the status reaches "Starting positions verified", and Control settings shows "Practice state: running".
2. Say "Guide, stop camera", then "Guide, start practice". **Expect:** the camera starts and Practice resumes; the feedback says "Practice is running" only once ready.
3. Say "Guide, pause". Click **Resume practice**. Click **Pause practice**. Say "Guide, resume practice". **Expect:** verified steps are kept throughout.
4. Say "Guide, start practice" twice quickly. **Expect:** one action, plus "Duplicate…" or "already…".
5. Say "Guide, restart practice", then "Guide, confirm restart practice". **Expect:** a fresh attempt starts.
6. While the app is speaking, say "Guide, repeat" or "Guide, what should I do next". **Expect:** the app stops talking and answers.
7. With Practice paused, say "Guide, pause". **Expect:** "Practice is not running".
8. Block the camera in Chrome site settings and reload. **Expect:** a "Camera access was not allowed" message, state blocked. Allow the camera, then press Start camera.
9. Confirm that Teach has no microphone controls.
