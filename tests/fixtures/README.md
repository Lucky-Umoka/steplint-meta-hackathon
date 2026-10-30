# Smoke fixtures

`red-square.png`: repository-owned synthetic 256×256 RGB PNG, generated with Python standard-library PNG chunk encoding. White background; red pixels (220,30,30) in x/y [64,192). It contains no personal media. Prompt: `red square`. Intended for one image request only; no model success is assumed.

The encoded mock SAM mask in `tests/foundation.test.ts` is taken from the official `@meta-sam/parser` 0.1.0 README example (https://github.com/meta-models/meta-sam/tree/main/typescript/packages/parser). It tests parsing locally and is not this project's live API output. The SAM License is retained in `docs/licenses/SAM-LICENSE.txt`.

`teach-synthetic.mp4`: 14.87-second 640×480 H.264 MP4 (223 frames), generated during the Phase 3 local browser check with Chromium fake camera devices. It shows a synthetic clock pattern, contains no audio or people, and is used only for deterministic container/timeline/upload-contract tests. No live model call is made by those tests.

`teach-preview.mp4`: the existing repository-owned synthetic video with a silent mono AAC track added using ffmpeg as a development tool. Used for browser preview/audio-extraction tests without personal media or model calls. Silence is sufficient for this local preview check; it is not a successful transcript or lesson-analysis fixture.

`guide-reference.jpg`: a 640×480 JPEG derived from the owned red-square fixture for image-header/approval contract tests. Guide fixtures are explicitly synthetic and are never sent to providers by normal tests. `guide.ts` defines synthetic schema/evaluator data.
