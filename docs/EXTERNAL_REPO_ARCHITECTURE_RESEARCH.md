# External repository architecture research (2026-11-04)

Read-only study by four parallel sub-agents (repos cloned to `/tmp/refs`, never run, no code copied, no paid calls). Tags: **[V]** verified in code, **[D]** documented only, **[U]** unknown. Repos studied: Manuekle/focus, meta-models/meta-sam, aboderinsamuel/MetaRobo, dumbspacecookie/openeye, AUsernameForYou/agenthand, DravenDou/processlens, SRKRz23/apprentice, Ghiathash/Video2Knowledge, CacinieP/video2knowledge, meta-models/meta-model-cookbook.

## A. Executive findings
1. **None of the ten repositories tracks a live webcam.** Focus, MetaRobo, ProcessLens and apprentice track recorded video only (no `getUserMedia` found) [V]. StepLint's live local tracker has no external precedent, so its correctness must be proven on real cameras.
2. **Our biggest tracking flaw was our own, not missing know-how.** Practice set up from the Teach recording's pixels and positions (±48 px / ±15 % search, same-aspect requirement), which cannot work with a different camera, angle, aspect ratio or arrangement. Fixed in 0.14.0 by calibrating on the live frame from SAM 3.1 boxes (`src/practice/viewpoint.ts`, `src/server/practice/locate.ts`).
3. **Re-prompting SAM with the last known box is the common recovery pattern** (Focus `server/jobs.ts:950-967`, `shared/tracking.ts:270-297`) [V]. That matches our bounded re-locate.
4. **The strongest external pattern is a single billed-call choke point with reserve-then-settle spend accounting** (agenthand `meta_client.py:72-175`, `ledger.py:77-165`) [V]. Our limits are in memory and per instance.
5. **A bounded agent loop with a closed action set, an objective oracle and stale-response rejection** (cookbook `01_agent_loop_basics/README.md:29-52, 237-241` [D]; `06_muse_voice/02_voice_chess_cua/.../app.py:606-620, 776-786` [V]) is the model for making Felicity coordinate without ever declaring success.

## B. Repository-by-repository analysis
| Repo | Did better | Did worse | Ideas only |
|---|---|---|---|
| Focus | Gap-fill SAM re-prompt from the object's own box; frames keyed by index, latest mask revision wins; one cached upload [V] | No live camera; absent = out of view; no motion or lighting handling | Bounded re-prompt for lost objects (Teach) |
| meta-sam | Spec: inclusive `x2`/`y2` (right = x2+1), sparse string object IDs, out-of-order frames, optional confidence, mask revisions replace, warnings keep records [V/D] | No timestamps; no live or re-ID guidance | Conformance edge cases (below) |
| MetaRobo | Bounded loop (`MAX_TURNS=12`, sims 6 / revisions 4); measured score overrides a model "validated" claim (`loop.ts:131-137`) [V] | Simulation only; fixed side camera; spend check without reservation | Never let a model claim beat measurement |
| openeye | Invalid model output mapped to "uncertain" [V] | `verify_step` records whatever the caller claims [V] — do not copy | — |
| agenthand | One `billed_call()`; reserve under lock, settle, fail closed on a corrupt ledger; deterministic pixel verify that refuses when nothing was compared [V] | Repair call inside one reservation (projection unverified) | Durable spend ledger at our Meta/Baseten clients |
| ProcessLens | `/api/progress` polling with done/total; findings carry `t_seconds` and seek the video; honest "Demo data" mock mode; 409 when no workflow exists [V] | Batch only; LLM maps observed to expected steps; fixtures/stub tests only | Evidence seek; determinate SAM progress; labelled demo mode |
| apprentice | Before/after change required (presence ≠ action); dependency-aware order check [V] | MuJoCo simulation only (21/21 results not physical) [D] | Pre-call budget check |
| Ghiathash/Video2Knowledge | Faithfulness check rejects numbers not in the source (`faithfulness.py:210-240`) [V] | Not Meta; no tracking | Reject draft numbers absent from the transcript |
| CacinieP/video2knowledge | Time-first speech/frame binding with a "weak" flag; settled-frame dedup [V] | Not Meta | Mark weak transcript↔step bindings |
| meta-model-cookbook | Five stop conditions, doom-loop hash, closed-enum actions with a code-computed digest, transient-only retries, generation tokens [D/V] | Tool-calling caveats on api.meta.ai; Baseten support [U] | Felicity supervisor design (H) |

## C. Side-by-side with StepLint
| Concern | StepLint | Best external practice |
|---|---|---|
| Live tracking | Local per-frame trackers + live SAM setup | none (all batch) |
| Verdict authority | Deterministic verifier and goal gate | Same idea in MetaRobo / apprentice; openeye violates it |
| Recovery | Re-locate (≤ every 20 s) + Felicity supervisor (≤4 per 5 min) | Focus re-prompt; cookbook bounded loop |
| Spend control | In-memory per-instance caps | agenthand durable reserve/settle ledger |
| Evidence UX | Before/Goal thumbnails | ProcessLens seek-to-timestamp |

## D. Automatic tracking deep dive
External systems re-run SAM over a recorded file and accept per-frame boxes; none track live. StepLint must keep live local tracking (CLAUDE.md: continuous movement, low-latency feedback, post-verification monitoring), so the useful transfers are: (1) set up from what the live camera sees, re-prompted by SAM when lost (done 0.14.0); (2) obey SAM wire geometry exactly; (3) treat several SAM instances of one noun as ambiguity, not "pick the best".

## E. Our current mistakes and gaps (file references)
1. Setup used Teach pixels/positions/aspect (`local-tracking.ts:938-979`, `appearance-overlay.ts:237-271`) — fixed 0.14.0 (live setup). [V]
2. Locate wired only in the handler's initial value — fixed 0.13.1. [V]
3. Late replies halted Practice permanently; per-reply full re-render in dev — fixed 0.15.0 (10/s paint cap + Felicity supervisor). [V]
4. `locate.ts` scales boxes by the client-declared size, not the record's `width`/`height`; turns request failures into `box: null` (indistinguishable from absent); takes the best of several instances silently. [V] Open.
5. `pipeline.ts:306-308` rejects a duplicate mask that the protocol allows as a revision; `pipeline.ts:281` fails on warnings that keep records. [V] Open.
6. Spend limits in memory, per server instance (`locate.ts:43-57`, `recovery.ts:61-85`). [V] Open.
7. `detail: "auto"` on the SAM image part is not confirmed by the official docs (Focus comment says `image_url` only). [U] Verify.

## F. Prioritised recommendations
**P0**
- Locate geometry and honesty (`src/server/practice/locate.ts`): scale by the record's own width/height; return typed `error` vs `absent`; when `instances > 1`, disambiguate with the reviewed Teach box (object prompt) or mark the object ambiguous. Test: mocked SAM with mismatched size, two instances, a thrown request. ~45 min.
- Felicity supervisor as a closed-action loop (`src/practice/felicity.ts`, `src/server/practice/recovery.ts`): actions `relocate_objects | restart_live_setup | advise_user | stop`, chosen once per incident, code-computed digest input, action epoch + busy lock, stop when the verifier state changes, budget exhausted or the same action repeats. Never writes pass/fail. Tests: stale reply, budget, repeat, verifier authority. ~2-3 h.
- Physical-camera acceptance run recorded separately (owner).

**P1**
- Accept SAM mask revisions and warning diagnostics per the protocol (`pipeline.ts:281, 306-308`). ~30 min.
- Durable reserve-then-settle spend ledger at `src/server/meta/client.ts` / `spark.ts`. ~90 min.
- Determinate SAM progress (done/total) in Teach streaming. ~20 min.

**P2**
- Findings seek the Teach evidence video at their timestamp (Felicity audit). ~45 min.
- Reject Spark draft numbers absent from the transcript (`source-evidence.ts`). ~30 min.
- Optional post-session batch audit of a recorded Practice clip (owner authorization). ~2-3 h.

## G. What NOT to copy
- Model-declared step success (openeye `verify_step`).
- LLM mapping of observed to expected steps (ProcessLens).
- Batch-only Practice (breaks CLAUDE.md live requirements; no repo shows physical batch reliability).
- Simulation or fixture results presented as physical evidence (apprentice, ProcessLens).
- Spend checks without reservation (MetaRobo); retrying Spark after timeouts; free-text agent actions.

## H. Implementation sequence
1. (done 0.14.0/0.15.0) live setup, page wiring, paint cap, supervisor, provenance logs.
2. Locate geometry/ambiguity/typed errors (P0).
3. Felicity closed-action supervisor (P0).
4. Owner physical-camera acceptance with the console log.
5. P1 protocol conformance and spend ledger.

## I. Evidence and confidence
- Verified implementation: file:line claims tagged [V] above (sub-agent reading of cloned code).
- Documented only: cookbook README patterns, apprentice and ProcessLens result claims [D].
- Hypotheses requiring experiment: the owner's late-reply halts are dev-mode render cost (supported: tracking is 18-31 ms per frame on the owner's real frame; the live-setup page test passes on the owner's dev server), not yet confirmed on the owner's machine.
- Unknown: Baseten tool-calling/caching support; whether `detail` is accepted on SAM image input.
