"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { VoicePreferenceProvider } from "@/voice/voice-preference";
import ActionControls from "@/voice/ActionControls";
import Workspace from "@/components/workspace";
import LessonCapture, { type PreparedLesson } from "./capture";
import ComponentPicker from "./component-picker";
import ProcessingDialog from "./processing-dialog";
import { nextProcessingStage, type ProcessingStage } from "@/teach/progress";
import Review from "./review";
import {
  ContextSchema,
  DraftSchema,
  LessonSchema,
  type Lesson,
  type Selection,
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
      className="max-h-[60vh] w-full rounded-xl bg-slate-950"
      aria-label="Prepared lesson preview"
    />
  );
}
export default function LocalTeach() {
  return (
    <VoicePreferenceProvider>
      <LocalTeachFlow />
    </VoicePreferenceProvider>
  );
}
function LocalTeachFlow() {
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
  const [goal, setGoal] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [stage, setStage] = useState<ProcessingStage>("upload"),
    [processingOpen, setProcessingOpen] = useState(false),
    [automaticBuild, setAutomaticBuild] = useState(true);
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
  async function upload() {
    if (!prepared || !consent || !goal.trim() || inFlight.current) return;
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
      setUploaded(
        UploadSchema.parse(await readAppJson(response, "Lesson upload")),
      );
      // Upload is done; the next step is manual component choice, so dismiss
      // the modal dialog instead of blocking the picker behind it.
      setProcessingOpen(false);
      setMessage("Choose the objects whose transfers should be verified.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lesson upload failed.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function compile(selections?: Selection[]) {
    if (!uploaded || inFlight.current) return;
    inFlight.current = true;
    // Keep the uploaded lesson visible while analysis runs so a failed build
    // can retry without re-uploading the recording.
    setAutomaticBuild(!selections);
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
          token: uploaded.token,
          confirmed: true,
          goal: goal.trim(),
          ...(selections ? { selections } : { automatic: true }),
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
                      goal.trim(),
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
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Workspace mode="teach">
      <div className="mx-auto max-w-6xl space-y-5">
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
        ) : (
          <>
            {!review && (
              <>
                <label className="block rounded-2xl border bg-white p-5 font-medium">
                  What visible final result should the learner achieve?
                  <input
                    className="block w-full border p-2"
                    maxLength={2000}
                    value={goal}
                    disabled={busy || !!uploaded}
                    onChange={(e) => setGoal(e.target.value)}
                  />
                </label>
                {!prepared ? (
                  <LessonCapture onPrepared={setPrepared} />
                ) : !uploaded ? (
                  <section className="space-y-4 rounded-2xl border bg-white p-5">
                    <RecordingPreview video={prepared.video} />
                    <p>
                      Recording prepared. Preview it in the recorder before
                      processing.
                    </p>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      I reviewed this recording and approve one Meta upload and
                      Muse Voice transcription request. Object analysis has a
                      separate confirmation next.
                    </label>
                    <ActionControls
                      commands={[
                        {
                          id: "process",
                          phrases: ["process recording", "build my guide"],
                        },
                      ]}
                      onAction={() => {
                        if (busy || inFlight.current)
                          return {
                            applied: false,
                            message: "Processing is already running.",
                          };
                        if (!consent || !goal.trim())
                          return {
                            applied: false,
                            message:
                              "Enter the goal and confirm recording processing consent first.",
                          };
                        void upload();
                        return {
                          applied: true,
                          message:
                            "Starting the approved upload and transcription.",
                        };
                      }}
                    />
                    <button
                      className="primary"
                      disabled={busy || !consent || !goal.trim()}
                      onClick={() => void upload()}
                    >
                      Process recording
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
                  </section>
                ) : (
                  <ComponentPicker
                    lesson={uploaded.lesson}
                    video={prepared.video}
                    busy={busy}
                    onCompile={(s) => void compile(s)}
                    onAutomatic={() => void compile()}
                  />
                )}
              </>
            )}
            {review && prepared && (
              <Review
                initial={review.draft}
                context={review.context}
                token={review.token}
                video={prepared.video}
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
        <a href="/teach?legacy=1">Open previous lesson workflow</a>
      </div>
    </Workspace>
  );
}
