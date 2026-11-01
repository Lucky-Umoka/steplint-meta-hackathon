"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import Workspace from "@/components/workspace";
import LessonCapture, { type PreparedLesson } from "./capture";
import ProcessingDialog from "./processing-dialog";
import { nextProcessingStage, type ProcessingStage } from "@/teach/progress";
import { useRouter } from "next/navigation";
import {
  listApprovedProcedures,
  type SavedProcedure,
} from "@/teach/approved-storage";
import Review from "./review";
import {
  ContextSchema,
  DraftSchema,
  LessonSchema,
  type Lesson,
  type TeachContext,
  type TeachDraft,
} from "@/teach/schema";
import { readAppJson } from "@/teach/api-response";
import { localExecutionDraft } from "@/teach/local-execution";
const UploadSchema = z.object({
  lesson: LessonSchema,
  token: z.string().min(1),
});
const DraftEvent = z.object({
  type: z.literal("draft"),
  draft: DraftSchema,
  context: ContextSchema,
  token: z.string().min(1),
  uploadDeleted: z.literal(true),
});
function RecordingPreview({ video }: { video: Blob }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(video);
    if (element.current) element.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [video]);
  return (
    <video
      ref={element}
      controls
      playsInline
      className="max-h-[32vh] w-full rounded-xl bg-slate-950"
      aria-label="Prepared lesson preview"
    />
  );
}
export default function LocalTeach() {
  return <LocalTeachFlow />;
}
function lessonGoal(raw: string): string {
  try {
    const goal = (JSON.parse(raw) as { procedure?: { execution?: { goal?: unknown } } })
      .procedure?.execution?.goal;
    return typeof goal === "string" ? goal : "";
  } catch {
    return "";
  }
}
function LocalTeachFlow() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [unlocked, setUnlocked] = useState(false),
    [access, setAccess] = useState("");
  const [prepared, setPrepared] = useState<PreparedLesson | null>(null),
    [uploaded, setUploaded] = useState<{
      lesson: Lesson;
      token: string;
    } | null>(null);
  const [review, setReview] = useState<{
    draft: TeachDraft;
    context: TeachContext;
    token: string;
  } | null>(null);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [stage, setStage] = useState<ProcessingStage>("upload"),
    [processingOpen, setProcessingOpen] = useState(false),
    [automaticBuild, setAutomaticBuild] = useState(true),
    [library, setLibrary] = useState<SavedProcedure[] | null>(null),
    [creating, setCreating] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/teach/access")
      .then((r) => readAppJson(r, "Access check"))
      .then((value) => {
        if (active)
          setUnlocked(
            z.object({ unlocked: z.boolean() }).parse(value).unlocked,
          );
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Access check failed.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    void listApprovedProcedures()
      .then((rows) => {
        if (active) setLibrary(rows);
      })
      .catch(() => {
        if (active) setLibrary([]);
      });
    return () => {
      active = false;
    };
  }, [unlocked]);
  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/teach/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: access }),
      });
      const value = await readAppJson(response, "Creator access");
      if (!z.object({ unlocked: z.literal(true) }).safeParse(value).success)
        throw Error("Creator access could not be confirmed.");
      setUnlocked(true);
      setAccess("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creator access failed.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(): Promise<{
    lesson: Lesson;
    token: string;
  } | null> {
    if (!prepared || !consent || inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setStage("upload");
    setProcessingOpen(true);
    setMessage("Uploading the reviewed recording and transcribing the lesson…");
    try {
      const body = new FormData();
      body.append("video", prepared.video, "lesson.mp4");
      body.append("audio", prepared.audio, "lesson.wav");
      body.append("confirmed", "true");
      const response = await fetch("/api/teach/lesson", {
        method: "POST",
        body,
      });
      const data = UploadSchema.parse(
        await readAppJson(response, "Lesson upload"),
      );
      setUploaded(data);
      setMessage("Upload complete. Building your guide…");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lesson upload failed.");
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function compile(uploadOverride?: {
    lesson: Lesson;
    token: string;
  }) {
    const data = uploadOverride ?? uploaded;
    if (!data || inFlight.current) return;
    // The build goal comes from the creator's own narration; the AI
    // structures it into steps during analysis. No separate goal step.
    const narration =
      data.lesson.transcript.text.trim().slice(0, 2000) ||
      "Complete the demonstrated procedure.";
    setUploaded(data);
    inFlight.current = true;
    setAutomaticBuild(true);
    setStage("discover");
    setProcessingOpen(true);
    setBusy(true);
    setError("");
    setMessage("Finding task components automatically from your video…");
    try {
      const response = await fetch("/api/teach/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: data.token,
          confirmed: true,
          goal: narration,
          automatic: true,
        }),
      });
      if (!response.ok) {
        await readAppJson(response, "Lesson analysis");
        throw Error("Analysis failed.");
      }
      if (!response.body) throw Error("Analysis stream was empty.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "",
        complete = false;
      try {
        for (;;) {
          const part = await reader.read();
          pending += decoder.decode(part.value, { stream: !part.done });
          if (pending.length > 2_000_000)
            throw Error("Analysis response exceeded its bound.");
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const value: unknown = JSON.parse(line);
            const event = DraftEvent.safeParse(value);
            if (event.success) {
              setReview({
                draft: event.data.draft.procedure.execution
                  ? event.data.draft
                  : localExecutionDraft(
                      event.data.draft,
                      narration,
                      event.data.context,
                    ),
                context: event.data.context,
                token: event.data.token,
              });
              complete = true;
            } else {
              const status = z
                .object({
                  type: z.enum(["progress", "error"]),
                  message: z.string(),
                })
                .parse(value);
              if (status.type === "error") throw Error(status.message);
              setStage((current) => nextProcessingStage(current, status.message));
              setMessage(status.message);
            }
          }
          if (part.done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!complete)
        throw Error(
          "Analysis ended without a validated draft; no approval was assumed.",
        );
      setStage("review");
      // Draft is ready and renders inline below; dismiss the modal so review
      // is directly interactive instead of one extra click behind glass.
      setProcessingOpen(false);
      setMessage(
        "Review the full transfer, goal and evidence before approval.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lesson analysis failed.");
      // Return to the build screen so a failed build can retry with one click.
      setUploaded(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function buildGuide() {
    if (inFlight.current || !prepared) return;
    setReview(null);
    const data = await upload();
    if (data) await compile(data);
  }
  return (
    <Workspace mode="teach">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Create a guide</h1>
            <p className="mt-1 text-sm text-slate-600">
              Show the process. Check the steps and the goal.
            </p>
          </div>
          <ol
            aria-label="Create guide progress"
            className="flex flex-wrap gap-3 text-sm"
          >
            {["Record", "Build", "Review", "Save"].map((name, index) => {
              const active = review ? 2 : busy || uploaded || prepared ? 1 : 0;
              return (
                <li
                  key={name}
                  aria-current={index === active ? "step" : undefined}
                  className={`rounded-full px-3 py-2 ${index === active ? "bg-emerald-100 font-bold text-emerald-900" : "text-slate-500"}`}
                >
                  {index + 1}. {name}
                </li>
              );
            })}
          </ol>
        </div>
        {!unlocked ? (
          <section className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold">Creator access</h2>
            <label className="block">
              Creator access code{" "}
              <input
                type="password"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !access}
              onClick={() => void unlock()}
            >
              Unlock Teach
            </button>
          </section>
        ) : !creating && !prepared && !review ? (
          <section className="space-y-5">
            <div>
              <h1 className="text-3xl font-bold">Your lessons</h1>
              <p className="mt-1 text-slate-600">
                Practice a lesson or create a new one.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                className="rounded-2xl border-2 border-dashed border-emerald-600 p-6 text-left"
                onClick={() => setCreating(true)}
              >
                <span className="block text-4xl" aria-hidden="true">
                  +
                </span>
                <strong className="mt-2 block text-lg">
                  Create new teach
                </strong>
                <span className="mt-1 block text-sm text-slate-600">
                  Record or upload a demonstration.
                </span>
              </button>
              {(library ?? []).map((row) => {
                const rowGoal = lessonGoal(row.raw);
                return (
                  <article
                    key={row.id}
                    className="space-y-2 rounded-2xl border bg-white p-5"
                  >
                    {row.references && (
                      <img
                        src={row.references.goal}
                        alt=""
                        className="w-full rounded-xl bg-slate-950"
                      />
                    )}
                    <h2 className="text-lg font-bold">{row.title}</h2>
                    {rowGoal && (
                      <p className="text-sm text-slate-600">{rowGoal}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="primary"
                        onClick={() => router.push("/practice")}
                      >
                        Practice
                      </button>
                      <button onClick={() => setCreating(true)}>
                        Rebuild
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {library !== null && library.length === 0 && (
              <p className="text-sm text-slate-600">
                No lessons yet. Create your first teach above.
              </p>
            )}
          </section>
        ) : (
          <>
            {!prepared && !review && (
              <button disabled={busy} onClick={() => setCreating(false)}>
                ← Your lessons
              </button>
            )}
            {!review && (
              <>
                {!prepared ? (
                  <LessonCapture onPrepared={setPrepared} />
                ) : !uploaded ? (
                  <section className="space-y-3 rounded-2xl border bg-white p-4">
                    <RecordingPreview video={prepared.video} />
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      I reviewed this recording and approve upload,
                      transcription and automatic analysis.
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="primary"
                        disabled={busy || !consent}
                        onClick={() => void buildGuide()}
                      >
                        Build my lesson
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setPrepared(null);
                          setConsent(false);
                        }}
                      >
                        Choose another recording
                      </button>
                    </div>
                  </section>
                ) : (
                  <p role="status">
                    Building your lesson… the review appears automatically.
                  </p>
                )}
              </>
            )}
            {review && prepared && (
              <Review
                initial={review.draft}
                context={review.context}
                token={review.token}
                video={prepared.video}
                onRetrain={() => void buildGuide()}
              />
            )}
          </>
        )}
        <ProcessingDialog
          open={processingOpen}
          stage={stage}
          busy={busy}
          ready={!!review}
          automatic={automaticBuild}
          message={message}
          error={error}
          onClose={() => setProcessingOpen(false)}
          onCancel={() => setProcessingOpen(false)}
        />
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
    </Workspace>
  );
}
