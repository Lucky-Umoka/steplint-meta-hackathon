# Review correction awaiting owner approval

The final authorized paid test completed real Teach analysis, review and approval, and automatically started local Practice. It did **not** complete the final goal. All four authorized paid tests are used; no additional model call is authorized by this record.

## Exact correction proposed

Lesson: `59882a57-32e4-4632-ad85-05d2f17767b0`, step `step-1`, starting zone `zone-1`.

Move the starting region upward by **0.02 normalized units (4.8 pixels at 320×240)**. Keep its width, height, horizontal bounds, target region, objects, frames, order and confidence policy unchanged.

| Bound | Existing approval | Proposed review |
| --- | ---: | ---: |
| left | 0.23578125 | 0.23578125 |
| top | 0.24229167 | 0.22229167 |
| right | 0.31578125 | 0.31578125 |
| bottom | 0.32229167 | 0.30229167 |

SAM's reviewed frame-41 box excludes the bottle cap. The local connected red-surface box includes it. Their centers differ enough that the unchanged strict zone inset excludes some correctly observed starting positions. The proposed region contains both observations with the existing inset, without enlarging the region or changing perception thresholds.

## Evidence and approval boundary

The proposed region was tested offline across 540 real-video frames: goal complete at frame 139, reversal invalidation at frame 280 after the loop starts at 270, no earlier false invalidation, calibration valid throughout, and automatic goal recovery at frame 509. Local tracker processing median was 10.69 ms and p95 20.16 ms. These are **offline tracker timings**, not live feedback or physical-camera acceptance.

The original approved artifact is unchanged. The exact machine-readable proposal and original artifact hash are in `.media-lab/live-e2e/review-proposal.json`. An experimental point-offset mapping was rejected because it falsely invalidated a stationary final state; it was fully removed from product code.

A human must explicitly approve the new reviewed region before Practice can use it. After approval, issue a new executable revision, reset rehearsal status, discard the old receipt for the changed artifact, and run the canonical local Practice page with all model endpoints blocked. Test goal completion, loop reversal, recovery, voice actions and export feedback latency. This continuation requires no new model call.

A passing continuation must be reported separately from the failed paid test. A clean fresh paid end-to-end rerun would require additional explicit spending authorization.
