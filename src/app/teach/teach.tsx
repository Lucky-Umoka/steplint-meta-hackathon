"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import Workspace from "@/components/workspace";
import FlowDialog from "@/components/flow-dialog";
import LessonCapture, { type PreparedLesson } from "./capture";
import ManualMarks from "./manual-marks";
import VisualReview from "./visual-review";
import {
  GuideSchema,
  ArtifactSchema,
  guideBlockers,
  type Guide,
  type GuideArtifact,
} from "@/guide/schema";
import {
  guideRepository,
  guideKey,
  saveDraft,
  loadDraft,
  discardDraft,
  type SavedGuide,
} from "@/guide/storage";
import { newRevision } from "@/guide/versioning";
import { frameImage } from "@/teach/media";
import { prepareGuideImages } from "@/guide/images";
import { readAppJson } from "@/teach/api-response";
import type { Selection } from "@/teach/schema";
const DraftCache = z.object({
  guide: GuideSchema,
  token: z.string(),
  previous: ArtifactSchema.nullable(),
  reviewer: z.string(),
  reviewed: z.array(z.string()),
  goalReviewed: z.boolean(),
});
export default function Teach() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false),
    [code, setCode] = useState(""),
    [prepared, setPrepared] = useState<PreparedLesson | null>(null),
    [preview, setPreview] = useState(""),
    [consent, setConsent] = useState(false),
    [marks, setMarks] = useState<Selection[]>([]);
  const [guide, setGuide] = useState<Guide | null>(null),
    [token, setToken] = useState(""),
    [previous, setPrevious] = useState<GuideArtifact | null>(null),
    [reviewer, setReviewer] = useState(""),
    [reviewed, setReviewed] = useState<string[]>([]),
    [goalReviewed, setGoalReviewed] = useState(false);
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<GuideArtifact | null>(null),
    [library, setLibrary] = useState<SavedGuide[]>([]),
    [restoring, setRestoring] = useState(true);
  const request = useRef<AbortController | null>(null),
    latch = useRef(false),
    clip = useRef("");
  useEffect(() => {
    let live = true;
    void fetch("/api/teach/access")
      .then((r) => r.json())
      .then((v: unknown) => {
        if (
          live &&
          z.object({ unlocked: z.literal(true) }).safeParse(v).success
        )
          setUnlocked(true);
      })
      .catch(() => {});
    void loadDraft()
      .then((raw) => {
        if (!live) return;
        const cache = DraftCache.safeParse(raw);
        if (cache.success) {
          setGuide(cache.data.guide);
          setToken(cache.data.token);
          setPrevious(cache.data.previous);
          setReviewer(cache.data.reviewer);
          setReviewed(cache.data.reviewed);
          setGoalReviewed(cache.data.goalReviewed);
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Draft storage is unavailable.",
          );
      })
      .finally(() => {
        if (live) setRestoring(false);
      });
    void guideRepository
      .list()
      .then((rows) => {
        if (live) setLibrary(rows);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Guide storage is unavailable.",
          );
      });
    return () => {
      live = false;
      request.current?.abort();
      if (clip.current) URL.revokeObjectURL(clip.current);
    };
  }, []);
  useEffect(() => {
    if (!guide || restoring) return;
    const timer = setTimeout(() => {
      void saveDraft({
        guide,
        token,
        previous,
        reviewer,
        reviewed,
        goalReviewed,
      }).catch((e) =>
        setError(e instanceof Error ? e.message : "Draft could not be kept."),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [guide, token, previous, reviewer, reviewed, goalReviewed, restoring]);
  async function unlock() {
    if (latch.current) return;
    latch.current = true;
    setError("");
    try {
      const data = await readAppJson(
        await fetch("/api/teach/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: code }),
        }),
        "Teach access",
      );
      if (!z.object({ unlocked: z.literal(true) }).safeParse(data).success)
        throw Error("Teach access could not be confirmed.");
      setUnlocked(true);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Teach access failed.");
    } finally {
      latch.current = false;
    }
  }
  function accept(value: PreparedLesson) {
    if (clip.current) URL.revokeObjectURL(clip.current);
    clip.current = URL.createObjectURL(value.video);
    setPreview(clip.current);
    setPrepared(value);
    setConsent(false);
    setError("");
  }
  async function reset() {
    request.current?.abort();
    latch.current = false;
    setBusy(false);
    setGuide(null);
    setPrepared(null);
    setPrevious(null);
    setSaved(null);
    setToken("");
    setReviewed([]);
    setGoalReviewed(false);
    setConsent(false);
    setMarks([]);
    setError("");
    setStage("");
    if (clip.current) URL.revokeObjectURL(clip.current);
    clip.current = "";
    setPreview("");
    try {
      await discardDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft removal failed.");
    }
  }
  async function analyse() {
    if (!prepared || !consent || latch.current) return;
    latch.current = true;
    setBusy(true);
    setError("");
    setStage("transcribe");
    setMessage("Uploading once and listening to your lesson…");
    const controller = new AbortController();
    request.current = controller;
    try {
      const body = new FormData();
      body.append("video", prepared.video, "lesson.mp4");
      body.append("audio", prepared.audio, "lesson.wav");
      body.append("confirmed", "true");
      if (marks.length) body.append("marks", JSON.stringify(marks));
      if (!marks.length) {
        const frames = [];
        for (const frame of [
          ...new Set(
            [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1].map((fraction) =>
              Math.round(fraction * (prepared.media.frameTimesMs.length - 1)),
            ),
          ),
        ])
          frames.push({
            frame,
            image: await frameImage(
              prepared.video,
              prepared.media.frameTimesMs[frame],
            ),
          });
        const text = JSON.stringify(frames);
        if (
          prepared.video.size + prepared.audio.size + text.length >=
          3_980_000
        )
          throw Error(
            "This clip leaves too little room for its reference frames. Use a shorter clip or the optional object marks before uploading.",
          );
        body.append("frames", text);
      }

      const response = await fetch("/api/teach/guide/analyse", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!response.ok) await readAppJson(response, "Lesson analysis");
      if (!response.body)
        throw Error(
          "The lesson response was empty. No automatic retry was made.",
        );
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "",
        done = false;
      const handle = async (line: string) => {
        if (!line.trim()) return;
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          throw Error(
            "The lesson response was interrupted. Keep the recording and try again when ready.",
          );
        }
        const header = z
          .object({
            type: z.string(),
            stage: z.string().optional(),
            message: z.string().optional(),
          })
          .parse(raw);
        if (header.type === "error")
          throw Error(header.message ?? "Lesson analysis stopped.");
        if (header.type === "progress") {
          setStage(header.stage ?? "");
          setMessage(header.message ?? "Analysing…");
        }
        if (header.type === "draft") {
          const result = z
            .object({
              guide: GuideSchema,
              token: z.string(),
              uploadDeleted: z.literal(true),
            })
            .parse(raw);
          setStage("images");
          setMessage("Preparing your labelled reference images…");
          const next = await prepareGuideImages(
            result.guide,
            prepared.video,
            controller.signal,
          );
          setGuide(next);
          setToken(result.token);
          setPrevious(null);
          setReviewed([]);
          setGoalReviewed(false);
          setStage("review");
          setMessage("");
          done = true;
        }
      };
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = pending.indexOf("\n")) >= 0) {
            await handle(pending.slice(0, end));
            pending = pending.slice(end + 1);
          }
          if (pending.length > 1500000)
            throw Error("The analysis response exceeded its size limit.");
        }
        pending += decoder.decode();
        await handle(pending);
      } finally {
        reader.releaseLock();
      }
      if (!done)
        throw Error(
          "Analysis ended without a validated guide. Nothing was approved.",
        );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && e.name !== "ZodError"
            ? e.message
            : "The returned guide was invalid. No success was assumed.",
        );
    } finally {
      if (!controller.signal.aborted) {
        latch.current = false;
        setBusy(false);
      }
    }
  }
  function edit(next: Guide) {
    setGuide(next);
    setReviewed([]);
    setGoalReviewed(false);
    setSaved(null);
    setError("");
  }
  async function approve(purpose: "rehearsal" | "published") {
    if (!guide || latch.current) return;
    latch.current = true;
    setBusy(true);
    setError("");
    try {
      const body = {
        guide,
        token: token || undefined,
        previous: previous ?? undefined,
        reviewer,
        purpose,
        testOnly:
          previous?.guide.approval?.testOnly === true ||
          new URLSearchParams(window.location.search).get("qa") === "1",
        confirmed: true,
        reviewedStepIds: reviewed,
        goalReviewed,
      };
      const data = await readAppJson(
        await fetch("/api/teach/guide/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        "Guide approval",
      );
      const artifact = ArtifactSchema.parse(data);
      await guideRepository.save(artifact);
      if (purpose === "rehearsal") {
        setPrevious(artifact);
        await saveDraft({
          guide,
          token,
          previous: artifact,
          reviewer,
          reviewed,
          goalReviewed,
        });
        router.push(`/practice?test=${encodeURIComponent(guideKey(artifact))}`);
      } else {
        setSaved(artifact);
        setMessage("Your guide is saved in this browser.");
        await discardDraft();
      }
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Approval returned an invalid guide. Keep this draft open.",
      );
    } finally {
      latch.current = false;
      setBusy(false);
    }
  }
  const rehearsal = previous
    ? library.find((row) => row.key === guideKey(previous))?.rehearsal
    : null;
  const blockers = guide ? guideBlockers(guide) : [];
  const ready =
    !!guide &&
    !blockers.length &&
    reviewed.length === guide.steps.length &&
    goalReviewed &&
    !!reviewer.trim();
  const stageNames = ["Record", "Build", "Review", "Save"];
  const active = saved ? 3 : guide ? 2 : busy ? 1 : 0;
  return (
    <Workspace mode="teach">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Create a guide</h1>
            <p className="mt-1 text-slate-600">
              Show the process. Check the steps and the goal.
            </p>
          </div>
          <ol
            aria-label="Create guide progress"
            className="flex flex-wrap gap-3 text-sm"
          >
            {stageNames.map((name, i) => (
              <li
                key={name}
                aria-current={i === active ? "step" : undefined}
                className={`rounded-full px-3 py-2 ${i === active ? "bg-emerald-100 font-bold text-emerald-900" : "text-slate-500"}`}
              >
                {i + 1}. {name}
              </li>
            ))}
          </ol>
        </div>
        {!unlocked ? (
          <section className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold">Creator access</h2>
            <p className="text-sm text-slate-600">
              Protects private lesson processing and paid AI requests.
            </p>
            <label className="block">
              Access code
              <input
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlock();
                }}
              />
            </label>
            <button className="primary" onClick={() => void unlock()}>
              Unlock Teach
            </button>
          </section>
        ) : restoring ? (
          <p role="status">Opening your workspace…</p>
        ) : saved ? (
          <FlowDialog title="Guide saved">
            <h2 className="mt-2 text-2xl font-bold">{saved.guide.title}</h2>
            <p className="my-4 text-slate-600">
              Revision {saved.guide.revision} · {saved.guide.steps.length}{" "}
              reviewed steps
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="primary"
                onClick={() =>
                  router.push(
                    `/practice?guide=${encodeURIComponent(guideKey(saved))}`,
                  )
                }
              >
                Open Practice
              </button>
              <button onClick={() => void reset()}>Create another guide</button>
            </div>
          </FlowDialog>
        ) : guide ? (
          <>
            <>
              {rehearsal && (
                <p
                  role="status"
                  className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
                >
                  {rehearsal.passed
                    ? rehearsal.hadViolations
                      ? "Private test completed after corrections. Review before saving."
                      : "Private test completed: all reviewed visible steps and goal were verified."
                    : "The private test recorded a correction. Review the guide and test again if needed."}
                </p>
              )}
            </>
            <VisualReview
              guide={guide}
              onChange={edit}
              reviewed={reviewed}
              onReviewed={setReviewed}
              goalReviewed={goalReviewed}
              onGoalReviewed={setGoalReviewed}
            />
            <section className="sticky bottom-3 mt-6 rounded-2xl border bg-white p-5 shadow-lg">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="block text-sm font-medium">
                    Your reviewer name
                    <input
                      value={reviewer}
                      maxLength={100}
                      onChange={(e) => setReviewer(e.target.value)}
                    />
                  </label>
                  {blockers.length > 0 ? (
                    <p role="status" className="mt-2 text-sm text-amber-800">
                      {blockers[0]}
                    </p>
                  ) : (
                    !ready && (
                      <p className="mt-2 text-sm text-slate-500">
                        Review each step and the goal to enable testing and
                        saving.
                      </p>
                    )
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <button
                    disabled={!ready || busy}
                    onClick={() => void approve("rehearsal")}
                  >
                    Test my guide
                  </button>
                  <button
                    className="primary"
                    disabled={!ready || busy}
                    onClick={() => void approve("published")}
                  >
                    {busy ? "Saving…" : "Approve and save"}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Testing is private and optional. Saving publishes this reviewed
                revision to your local library.
              </p>
            </section>
            <div className="mt-4 flex flex-wrap gap-3">
              {prepared && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setGuide(null);
                    setConsent(false);
                    setError("");
                  }}
                >
                  Correct marks and analyse again
                </button>
              )}
              <button disabled={busy} onClick={() => void reset()}>
                Discard draft
              </button>
            </div>
          </>
        ) : (
          <>
            {!prepared ? (
              <>
                <LessonCapture onPrepared={accept} />
                {library.filter(
                  (r) => r.artifact.guide.approval?.purpose === "published",
                ).length > 0 && (
                  <details className="mt-6 rounded-xl border bg-white p-4">
                    <summary>Your saved guides</summary>
                    {library
                      .filter(
                        (r) =>
                          r.artifact.guide.approval?.purpose === "published",
                      )
                      .map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between gap-3 border-t py-3"
                        >
                          <span>
                            {row.artifact.guide.title} · v
                            {row.artifact.guide.revision}
                          </span>
                          <button
                            onClick={() => {
                              const g = newRevision(row.artifact.guide);
                              setGuide(g);
                              setPrevious(row.artifact);
                              setToken("");
                              setReviewer(
                                row.artifact.guide.approval?.reviewer ?? "",
                              );
                              setReviewed([]);
                              setGoalReviewed(false);
                            }}
                          >
                            Create a revision
                          </button>
                        </div>
                      ))}
                  </details>
                )}
              </>
            ) : (
              <section className="rounded-2xl border bg-white p-5">
                <h2 className="mb-4 text-xl font-bold">Preview your lesson</h2>
                <video
                  controls
                  playsInline
                  src={preview}
                  className={`${busy ? "max-h-[20vh]" : "max-h-[60vh]"} w-full rounded-xl bg-slate-950`}
                />
                <p className="mt-3 text-sm text-slate-500">
                  {prepared.media.info.durationSeconds.toFixed(1)} seconds
                </p>
                {!busy && (
                  <>
                    <ManualMarks
                      video={prepared.video}
                      media={prepared.media}
                      value={marks}
                      onChange={setMarks}
                    />
                    <label className="my-4 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        I previewed this lesson and approve{" "}
                        {marks.length
                          ? "one Voice, one SAM and one Spark"
                          : "one Voice, one SAM and two Spark"}{" "}
                        request{marks.length ? " each" : "s"}. No automatic
                        retries.
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="primary"
                        disabled={!consent}
                        onClick={() => void analyse()}
                      >
                        Build my guide
                      </button>
                      <button onClick={() => void reset()}>Discard</button>
                    </div>
                    <details className="mt-3 text-sm text-slate-500">
                      <summary>Processing and privacy</summary>
                      <p>
                        Video uploads once, then is deleted after analysis.
                        One-hour provider expiry is the fallback. Reference
                        images stay in this browser. Estimated SAM cost $
                        {(
                          (prepared.media.frameTimesMs.length * 0.2) /
                          1000
                        ).toFixed(4)}
                        , plus bounded Voice/Spark processing; final cost
                        varies.
                      </p>
                    </details>
                  </>
                )}
              </section>
            )}
          </>
        )}
        {busy && !guide && (
          <FlowDialog title="Building your visual guide">
            <p role="status" aria-live="polite" className="mt-2 text-slate-600">
              {message}
            </p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-5">
              {["transcribe", "discover", "track", "draft", "images"].map(
                (name, i) => (
                  <li
                    key={name}
                    aria-current={stage === name ? "step" : undefined}
                    className={`rounded-lg p-3 text-sm ${stage === name ? "animate-pulse bg-emerald-100 font-semibold motion-reduce:animate-none" : "bg-slate-50 text-slate-500"}`}
                  >
                    {i + 1}.{" "}
                    {
                      {
                        transcribe: "Listen",
                        discover: "Find objects",
                        track: "Track changes",
                        draft: "Build steps",
                        images: "Prepare review",
                      }[name]
                    }
                  </li>
                ),
              )}
            </ol>
            <button className="mt-4" onClick={() => void reset()}>
              Cancel and discard
            </button>
          </FlowDialog>
        )}
        {error && (
          <FlowDialog
            title="Could not finish this action"
            onDismiss={() => setError("")}
          >
            <p role="alert" className="mt-3 text-red-900">
              {error}
            </p>
            <button className="mt-3" onClick={() => setError("")}>
              Dismiss
            </button>
          </FlowDialog>
        )}
      </div>
    </Workspace>
  );
}
