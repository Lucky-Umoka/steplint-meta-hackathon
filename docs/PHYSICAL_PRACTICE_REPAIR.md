# Physical Practice failure follow-up — 2026-10-31

The owner rejected physical live Practice after the previous replay/browser checkpoint. That report is the acceptance status. No new paid Meta request has been made for this repair. Physical camera/microphone/gesture acceptance remains open; the exact failing session/browser/lesson/status has been requested.

## Concrete code defects

- Capture alternated between box-coordinate and image signatures as tracking availability changed. They have different lengths/domains, producing artificial infinite motion changes. Capture now always uses one image signature. Local tracking remains a separate advisory lane.
- One pixel per motion cell and whole-scene averages were vulnerable to sensor noise/exposure and insensitive to small parts. Cell averaging and global brightness normalization now trigger from changed cells. Original evidence images are unmodified and correctness thresholds/evaluator rules are unchanged.
- Local replay retained 60 full frames (~5 seconds at 12fps), shorter than real 6–8 second setup requests. An overflow intentionally cleared all tracks. Advisory frames are now bounded to 320×240 with 160-frame capacity (~13 seconds at the target rate), using less maximum replay memory than the previous buffer. Longer/ambiguous gaps still abstain.
- Replaying the entire buffer synchronously could block controls. Replay now yields between small batches and checks cancellation. Background texture was also a prerequisite for displaying otherwise valid object outlines and provisional target-relative warnings. Relationship mode now uses tracked parts as its advisory reference; independent model scene correspondence still governs actual verification. Changed target shape/large scale jumps disable the provisional warning.
- Pinch geometry was gated by a built-in category score, although the built-in classifier may report None during a pinch. Pinch now uses validated hand-relative geometry, dwell and hysteresis with explicitly unavailable category confidence. Pointer/palm classification still requires its score. No gesture provides procedural evidence.
- Gesture inference ran synchronously on the camera/UI thread. It now runs in a dedicated local worker, with one bounded transferable frame in flight. No hand frames leave the browser.
- Ignored speech was also stored as an already-executed duplicate, preventing an immediate retry after guidance ended. Only dispatched actions/confirmation requests are now deduplicated; restarting recognition clears the recognition cache.
- Voice pause/stop was ignored during guidance. Explicit non-destructive pause/stop commands now interrupt; start/resume/destructive confirmation remain blocked during self-speech. Actual recognizer onstart determines listening status. Fatal service/permission errors explain the issue and offer an explicit Restart listening action, without an automatic failure loop.
- The normal response path already paused at the 12-check limit. Additional guards now cover exhausted entry paths and prevent attempting to continue an exhausted session. No spending cap is removed or automatically renewed. An earlier progress statement incorrectly described the normal-path limit handler as missing.
- The cursor now previews a valid tracked fingertip before pinch dwell completes, including a hand without a built-in pose label. Cursor movement itself never clicks or verifies.
- Practice can export diagnostic metadata (camera/frame processing, flow/queue, tracking availability, verification events and voice status). Images, audio, API credentials and session tokens are excluded.

## Final code checkpoint — 2026-11-01

- 410/410 deterministic tests across 47 files passed. No Meta calls occur in those tests.
- 28/28 production browser checks passed against build `_Qi0qL-TMx2toQdKIBi_B`. Retained log: ignored `.media-lab/physical-practice-browser.log`; Playwright last-run records no failed tests.
- The expanded browser checks cover the actual bundled CPU gesture worker and teardown, generated-camera slow setup with populated masks/tracks, cursor preview and held pinch routed through the ordinary Pause button, immediate identical speech retry after guidance, voice pause while guidance speaks, diagnostic export and exhausted allowance handling. Semantic provider outputs are mocked in these checks; physical camera/microphone accuracy is not established.
- Production build (including strict TypeScript), lint, formatting and whitespace checks passed. The configured-secret scan found no matches in 212 authored files.
- Initial development checks interrupted by hot reload were discarded. Subsequent assertion fixes distinguish the manual Pause button's message from the voice pause message, and match the existing limit handler's actual explanation. These are not physical acceptance evidence.
- No new paid Meta test call, commit, push or external deployment was made for this follow-up.

## Preview compatibility and owner acceptance

The workspace runtime restarted during the follow-up and app processes were restored. Both 3000 and 3001 currently serve the same corrected build, with no private paid-test guard. These are the two intentional preview servers; no temporary test server remains.

Stopping 3001 as a presumed duplicate earlier was an unconfirmed URL assumption. If the owner was using that origin, its API and gesture assets would have failed after shutdown. This is a possible additional cause, not an established diagnosis of the reported session. Restoring both origins preserves browser-local libraries while the actual URL is confirmed.

The owner has been asked for the exact preview URL/device/browser and the diagnostic export from the refreshed failed session. Export omits images, audio, API credentials and session tokens. Physical acceptance remains **open**, with the owner's failed test the last physical result. Bounded semantic verification still requires remote observations taking seconds; the repairs do not establish instantaneous general-task verification or hardware hazard prevention.
