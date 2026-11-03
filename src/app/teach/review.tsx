"use client";
import { readAppJson } from "@/teach/api-response";
import {
  automaticSetupPlan,
  bindAutomaticSetup,
} from "@/teach/automatic-setup";
import { saveApprovedProcedure } from "@/teach/approved-storage";
import { alignScenePredicateEvidence } from "@/teach/predicate-evidence";

type AuditFindingView = {
  category: string;
  attention: "requires_expert" | "suggestion";
  message: string;
  suggestion: string;
  stepId: string | null;
  transcriptMs: number | null;
  frame: number | null;
};
const AUDIT_LABEL: Record<string, string> = {
  missing_action: "Missing action",
  visible_action_absent: "Movement not in the procedure",
  unsupported_claim: "Claim beyond the evidence",
  missing_object: "Object unclear or missing",
  unclear_instruction: "Unclear instruction",
  unclear_goal: "Final goal",
};
import { ApprovedArtifactSchema } from "@/teach/approved-artifact";
import {
  RehearsalSchema,
  rehearsalKey,
  type Rehearsal,
} from "@/teach/rehearsal";
import { executableRevision } from "@/teach/revision";
import { sourceEvidenceCatalog } from "@/teach/source-evidence";
import FeedbackPopup, { useFeedback } from "@/components/feedback";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  approveDraft,
  validateDraft,
  type TeachContext,
  type TeachDraft,
  type Region,
} from "@/teach/schema";
import {
  suggestReviews,
  keyFrames,
  reviewBlockers,
  reviewErrorMessage,
  reviewStepInput,
  type SuggestedCheck,
} from "@/teach/review-suggestions";
import { frameImage } from "@/teach/media";
import FrameMark from "./frame-mark";

type Check = SuggestedCheck;
function RegionEditor({
  video,
  timestamp,
  width,
  height,
  title,
  region,
  onRegion,
}: {
  video: Blob;
  timestamp: number;
  width: number;
  height: number;
  title: string;
  region: Region | null;
  onRegion: (region: Region) => void;
}) {
  const [image, setImage] = useState<{ timestamp: number; url: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void frameImage(video, timestamp)
      .then((image) => {
        if (active) setImage({ timestamp, url: image });
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [video, timestamp]);
  return (
    <div>
      <p className="font-medium">
        {title} — {(timestamp / 1000).toFixed(3)} s. Drag to adjust or replace
        the zone.
      </p>
      {image?.timestamp === timestamp ? (
        <FrameMark
          image={image.url}
          width={width}
          height={height}
          mode="box"
          mark={
            region
              ? {
                  kind: "box",
                  left: region.left * width,
                  top: region.top * height,
                  right: region.right * width,
                  bottom: region.bottom * height,
                }
              : null
          }
          onMark={(mark) => {
            if (mark.kind === "box")
              onRegion({
                left: mark.left / width,
                top: mark.top / height,
                right: mark.right / width,
                bottom: mark.bottom / height,
              });
          }}
        />
      ) : (
        <p>
          Frame preview unavailable. Do not approve without checking the source.
        </p>
      )}
    </div>
  );
}
export default function Review({
  initial,
  context,
  token,
  video,
  onRetrain,
}: {
  initial: TeachDraft;
  context: TeachContext;
  token: string;
  video: Blob;
  onRetrain: () => void;
}) {
  const router = useRouter();
  const feedback = useFeedback();
  // Felicity quality audit of the generated draft (advisory; never edits or
  // approves). One request per draft; failure leaves Teach unchanged.
  const [audit, setAudit] = useState<
    | { status: "loading" }
    | { status: "unavailable"; reason: string }
    | { status: "ready"; summary: string; findings: AuditFindingView[] }
  >({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/teach/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ token, draft: initial }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { summary?: unknown; findings?: unknown; error?: unknown }
          | null;
        if (!response.ok || !data || !Array.isArray(data.findings))
          throw Error(
            typeof data?.error === "string" ? data.error : `HTTP ${response.status}`,
          );
        setAudit({
          status: "ready",
          summary: typeof data.summary === "string" ? data.summary : "",
          findings: data.findings as AuditFindingView[],
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAudit({
          status: "unavailable",
          reason: error instanceof Error ? error.message : "Audit failed.",
        });
      });
    return () => controller.abort();
  }, [initial, token]);
  // Preserve the creator's entire intended scope, including unsupported work.
  // Scene predicates cite the measured boundary frames the reviewed zones
  // come from; the server re-validates this at approval.
  const base = useMemo(
    () => alignScenePredicateEvidence(initial, context),
    [initial, context],
  );
  const [draft, setDraft] = useState(base),
    [editor, setEditor] = useState(JSON.stringify(base, null, 2));
  const [checks, setChecks] = useState<Record<string, Check>>(() =>
    suggestReviews(base, context),
  );
  const [goalConfirmed, setGoalConfirmed] = useState(false);
  const [reviewer, setReviewer] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [rehearsal, setRehearsal] = useState<Rehearsal | null>(() =>
    typeof window === "undefined"
      ? null
      : readRehearsal(context.lesson.lessonId),
  );
  useEffect(() => {
    // The rehearsal tab reports the canonical verifier outcome per revision.
    const read = () => setRehearsal(readRehearsal(context.lesson.lessonId));
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [context.lesson.lessonId]);
  const [approved, setApproved] = useState<unknown>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const suggestions = useMemo(
    () => suggestReviews(draft, context),
    [draft, context],
  );
  // The single approval checkbox applies these marks (see approveAll): the
  // displayed gate therefore enforces regions and evidence, never box-ticking.
  function withReviewedMarks() {
    const next = { ...checks };
    for (const step of draft.procedure.steps)
      next[step.id] = {
        ...(next[step.id] ?? suggestions[step.id]),
        reviewed: true,
        conditionConfirmed: true,
      };
    return next;
  }
  const effectiveBlockers = useMemo(
    () => reviewBlockers(draft, context, withReviewedMarks()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, context, checks],
  );
  const size = context.lesson.media.info.video;
  if (!size) return null;
  const dirty = editor !== JSON.stringify(draft, null, 2);
  function update(id: string, patch: Partial<Check>, fallback: Check) {
    setChecks((old) => {
      const next = { ...old, [id]: { ...(old[id] ?? fallback), ...patch } };
      const step = draft.procedure.steps.find((s) => s.id === id);
      if (step)
        for (const field of ["fromRegion", "toRegion"] as const) {
          if (!(field in patch)) continue;
          const zone =
            field === "fromRegion"
              ? step.condition.fromZone
              : step.condition.toZone;
          for (const related of draft.procedure.steps) {
            const check = next[related.id] ?? suggestions[related.id];
            if (related.condition.fromZone === zone)
              next[related.id] = clearZoneConflict({
                ...check,
                fromRegion: patch[field] ?? null,
                conditionConfirmed: false,
              });
            if (related.condition.toZone === zone)
              next[related.id] = clearZoneConflict({
                ...(next[related.id] ?? check),
                toRegion: patch[field] ?? null,
                conditionConfirmed: false,
              });
          }
        }
      return next;
    });
    if (
      ["fromRegion", "toRegion", "fromFrame", "toFrame", "changeFrame"].some(
        (field) => field in patch,
      )
    ) {
      setConfirm(false);
      setGoalConfirmed(false);
    }
    setApproved(null);
  }
  function editWording(
    stepId: string,
    field: "instruction" | "component" | "recovery",
    value: string,
  ) {
    const next = structuredClone(draft),
      step = next.procedure.steps.find((s) => s.id === stepId);
    if (!step) return;
    if (field === "instruction") step.description = value;
    if (field === "recovery") step.recovery.instruction = value;
    if (field === "component") {
      const component = next.procedure.components.find(
        (c) => c.id === step.condition.componentId,
      );
      if (component) component.description = value;
    }
    setDraft(next);
    setEditor(JSON.stringify(next, null, 2));
    setChecks(suggestReviews(next, context));
    setConfirm(false);
    setGoalConfirmed(false);
    setApproved(null);
    setError("");
  }
  async function approve() {
    setError("");
    setBusy(true);
    try {
      if (dirty) throw new Error("Apply edited draft changes before approval.");
      if (effectiveBlockers.length) throw new Error(effectiveBlockers[0]);
      const review = {
        reviewer,
        confirmed: confirm,
        ...(draft.procedure.execution ? { goalConfirmed } : {}),
        steps: draft.procedure.steps.map((step) =>
          reviewStepInput(step.id, withReviewedMarks()[step.id]),
        ),
      };
      const checked = approveDraft(draft, review, context, Date.now()); // server repeats validation
      const plan = checked.procedure.execution
        ? automaticSetupPlan(checked.procedure, checked.review, context)
        : null;
      const setupFrames = plan
        ? await Promise.all(
            [
              ...new Set([
                plan.sceneFrame,
                plan.goalFrame,
                ...plan.objects.map((object) => object.frame),
              ]),
            ].map(async (frame) => ({
              frame,
              image: await frameImage(
                video,
                context.lesson.media.frameTimesMs[frame],
                320,
              ),
            })),
          )
        : undefined;
      const response = await fetch("/api/teach/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          draft,
          review,
          setupFrames,
          rehearsal: readRehearsal(context.lesson.lessonId) ?? undefined,
        }),
      });
      const result = await readAppJson(response, "Approval");
      if (!ApprovedArtifactSchema.safeParse(result).success)
        throw new Error(
          "Approval could not be confirmed: the server returned an incomplete lesson. Keep this draft open and try again.",
        );
      setApproved(result);
      feedback.success("Lesson approved", "Save it to start Practice.");
    } catch (e) {
      const message = reviewErrorMessage(e);
      setError(message);
      feedback.failure(message);
    } finally {
      setBusy(false);
    }
  }
  async function rehearse() {
    setError("");
    setBusy(true);
    try {
      const marked = withReviewedMarks();
      setChecks(marked);
      if (effectiveBlockers.length) throw new Error(effectiveBlockers[0]);
      // Rehearsal-only confirmation: validates the current edits against the
      // same evidence gate as approval. `confirmed` satisfies the review
      // schema for this in-memory check only — nothing is approved or saved.
      const rehearsalReview = {
        reviewer: reviewer.trim() || "Rehearsal",
        confirmed: true,
        ...(draft.procedure.execution ? { goalConfirmed: true } : {}),
        steps: draft.procedure.steps.map((step) =>
          reviewStepInput(step.id, marked[step.id]),
        ),
      };
      const checked = approveDraft(draft, rehearsalReview, context, Date.now());
      const plan = checked.procedure.execution
        ? automaticSetupPlan(checked.procedure, checked.review, context)
        : null;
      let automaticSetup = undefined;
      if (plan) {
        try {
          const frames = await Promise.all(
            [
              ...new Set([
                plan.sceneFrame,
                plan.goalFrame,
                ...plan.objects.map((object) => object.frame),
              ]),
            ].map(async (frame) => ({
              frame,
              image: await frameImage(
                video,
                context.lesson.media.frameTimesMs[frame],
                320,
              ),
            })),
          );
          automaticSetup = bindAutomaticSetup(plan, frames);
        } catch (setupError) {
          // Never rehearse a lesson without the setup Practice needs to start
          // automatically; report the actual extraction failure instead.
          throw new Error(
            `Automatic setup could not be prepared from the reviewed source frames: ${setupError instanceof Error ? setupError.message : "frame extraction failed"}. Keep the review open and try again.`,
          );
        }
      }
      const rehearsalRevision = executableRevision({
        procedure: checked.procedure,
        zoneBindings: checked.zoneBindings,
        automaticSetup,
      });
      localStorage.setItem(
        "steplint-rehearsal-handoff",
        JSON.stringify({
          procedure: checked.procedure,
          zoneBindings: checked.zoneBindings,
          automaticSetup,
          sourceLesson: checked.sourceLesson,
          origin: "teach",
          rehearsalRevision,
        }),
      );
      window.open("/practice?rehearsal=1", "_blank", "noopener");
    } catch (e) {
      const message = reviewErrorMessage(e);
      setError(message);
      feedback.failure(message);
    } finally {
      setBusy(false);
    }
  }
  function approveAll(checked: boolean) {
    setConfirm(checked);
    setApproved(null);
    if (checked) {
      setGoalConfirmed(true);
      setChecks((old) => {
        const next = { ...old };
        for (const step of draft.procedure.steps)
          next[step.id] = {
            ...(next[step.id] ?? suggestions[step.id]),
            reviewed: true,
            conditionConfirmed: true,
          };
        return next;
      });
    }
  }
  return (
    <section className="space-y-5 rounded border p-4">
      <h2 className="text-2xl font-bold">4. Review the draft</h2>
      {draft.procedure.execution && (
        <div className="space-y-1">
          <p className="text-lg font-semibold">
            Goal: {draft.procedure.execution.goal}
          </p>
          <ul className="list-disc pl-6 text-sm">
            {draft.procedure.execution.requirements.map((r, i) => (
              <li key={i}>
                {r.description}:{" "}
                <strong
                  className={
                    r.status === "unsupported" ? "text-red-700" : undefined
                  }
                >
                  {r.status}
                </strong>
                {r.status === "unsupported" && ` — ${r.reason}`}
              </li>
            ))}
          </ul>
          {draft.procedure.execution.requirements.some(
            (r) => r.status === "unsupported",
          ) && (
            <p role="status" className="text-sm font-medium text-red-700">
              Required work is unsupported and remains in this draft. Correct
              its evidence or explicitly revise the scope before approval.
            </p>
          )}
          {sourceEvidenceCatalog(context)
            .filter(
              (entry) =>
                entry.movementDiagnosis &&
                draft.procedure.components.find(
                  (c) => c.id === entry.componentId,
                )?.execution?.role !== "irrelevant",
            )
            .map((entry) => (
              <p key={entry.componentId} className="text-sm text-slate-700">
                Movement evidence for{" "}
                {context.selections.find((s) => s.id === entry.componentId)
                  ?.description ?? entry.componentId}
                : none measured, because {entry.movementDiagnosis}.
              </p>
            ))}
        </div>
      )}
      <ol className="list-decimal space-y-1 pl-6">
        {draft.procedure.steps.map((step) => (
          <li key={step.id} className="font-medium">
            {step.description}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} onClick={onRetrain}>
          Re-run analysis
        </button>
        <button
          className="primary"
          disabled={busy || effectiveBlockers.length > 0}
          onClick={() => void rehearse()}
        >
          Test in Practice
        </button>
        <span className="text-sm text-slate-600">
          Live rehearsal in a new tab. Nothing is saved until you approve.
          {rehearsal && ` Last rehearsal: ${rehearsalLabel(rehearsal)}`}
        </span>
      </div>
      {draft.procedure.steps.map((step, index) => {
        const note = draft.notes.find((n) => n.stepId === step.id);
        const track = context.tracking.find(
          (t) => t.componentId === step.condition.componentId,
        );
        const fallback: Check = suggestions[step.id];
        const check = checks[step.id] ?? fallback;
        // Moment menus offer only frames where this component was tracked
        // with trusted geometry, so any choice keeps a valid source
        // appearance for approval and Practice setup. Current values stay
        // selectable so the menu never blanks.
        const moments = keyFrames(
          context,
          (track?.samples ?? [])
            .filter((s) => (s.confidence ?? 0) >= 0.9)
            .map((s) => s.frame),
          [check.fromFrame, check.toFrame, check.changeFrame ?? -1],
        );
        const frameOptions = moments.map((frame) => (
          <option key={frame} value={frame}>
            {(context.lesson.media.frameTimesMs[frame] / 1000).toFixed(2)} s
            {frame === check.fromFrame
              ? " — before"
              : frame === check.toFrame
                ? " — after"
                : " — reference"}
          </option>
        ));
        return (
          <details
            key={step.id}
            open={index === 0}
            className="rounded border p-4"
          >
            <summary className="cursor-pointer text-xl font-bold">
              {index + 1}. {step.description}
              {(() => {
                const track = context.tracking.find(
                  (t) => t.componentId === step.condition.componentId,
                );
                if (!track) return null;
                const matched = track.samples.filter(
                  (s) => s.frame >= check.fromFrame && s.frame <= check.toFrame,
                ).length;
                if (matched >= 3 && track.missingFrames === 0) return null;
                return (
                  <span className="block text-sm font-medium text-amber-800">
                    Weak evidence ({matched} tracked frames
                    {track.missingFrames > 0 &&
                      `, ${track.missingFrames} without geometry`}
                    ): adjust the moment or zones, then rehearse.
                  </span>
                );
              })()}
            </summary>
            <div className="mt-3 space-y-3">
              <details>
                <summary>Edit wording</summary>
                <div className="space-y-2 py-2">
                  <label className="block">
                    Component name{" "}
                    <input
                      aria-label={`Component name ${step.id}`}
                      value={
                        draft.procedure.components.find(
                          (c) => c.id === step.condition.componentId,
                        )?.description ?? ""
                      }
                      maxLength={100}
                      onChange={(e) =>
                        editWording(step.id, "component", e.target.value)
                      }
                    />
                  </label>
                  <label className="block">
                    Step instruction{" "}
                    <input
                      aria-label={`Step instruction ${step.id}`}
                      value={step.description}
                      maxLength={2000}
                      onChange={(e) =>
                        editWording(step.id, "instruction", e.target.value)
                      }
                    />
                  </label>
                  <label className="block">
                    Recovery message{" "}
                    <input
                      aria-label={`Recovery message ${step.id}`}
                      value={step.recovery.instruction}
                      maxLength={2000}
                      onChange={(e) =>
                        editWording(step.id, "recovery", e.target.value)
                      }
                    />
                  </label>
                  <p className="text-sm">Changes reset review.</p>
                </div>
              </details>
              <details>
                <summary>Step details</summary>
                <p>{note?.explanation}</p>
                <p>
                  Prerequisites: {step.prerequisites.join(", ") || "None"}.
                  Rule: {step.condition.kind}, {step.condition.fromZone} →{" "}
                  {step.condition.toZone}; minimum confidence{" "}
                  {step.condition.minimumConfidence}.
                </p>
              </details>
              {step.measurement && (
                <label>
                  Point checked against the zones{" "}
                  <select
                    aria-label={`Measurement point ${step.id}`}
                    value={step.measurement.point}
                    onChange={(e) => {
                      const next = structuredClone(draft);
                      for (const related of next.procedure.steps)
                        if (
                          related.condition.componentId ===
                            step.condition.componentId &&
                          related.measurement
                        )
                          related.measurement.point =
                            e.target.value === "bottom_center"
                              ? "bottom_center"
                              : "center";
                      setDraft(next);
                      setEditor(JSON.stringify(next, null, 2));
                      setChecks(suggestReviews(next, context));
                      setConfirm(false);
                      setGoalConfirmed(false);
                      setApproved(null);
                    }}
                  >
                    <option value="center">Centre of the visible object</option>
                    <option value="bottom_center">
                      Base of the visible object (for placement zones)
                    </option>
                  </select>
                </label>
              )}
              {draft.procedure.execution && (
                <label>
                  Change moment{" "}
                  <select
                    aria-label={`Change frame ${step.id}`}
                    value={check.changeFrame ?? check.fromFrame}
                    onChange={(e) =>
                      update(
                        step.id,
                        {
                          changeFrame: Number(e.target.value),
                          conditionConfirmed: false,
                        },
                        fallback,
                      )
                    }
                  >
                    {context.tracking
                      .find((t) => t.componentId === step.condition.componentId)
                      ?.samples.filter(
                        (s) =>
                          s.frame > check.fromFrame && s.frame < check.toFrame,
                      )
                      .map((s) => (
                        <option key={s.frame} value={s.frame}>
                          {(s.timestampMs / 1000).toFixed(2)} s
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p>Recovery: {step.recovery.instruction}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label>
                    Before moment{" "}
                    <select
                      aria-label={`Before frame ${step.id}`}
                      value={check.fromFrame}
                      onChange={(e) =>
                        update(
                          step.id,
                          {
                            fromFrame: Number(e.target.value),
                            fromRegion: null,
                            conditionConfirmed: false,
                          },
                          fallback,
                        )
                      }
                    >
                      {frameOptions}
                    </select>
                  </label>
                  <RegionEditor
                    video={video}
                    timestamp={
                      context.lesson.media.frameTimesMs[check.fromFrame]
                    }
                    width={size.width}
                    height={size.height}
                    title="Starting zone"
                    region={check.fromRegion}
                    onRegion={(region) =>
                      update(
                        step.id,
                        { fromRegion: region, conditionConfirmed: false },
                        fallback,
                      )
                    }
                  />
                </div>
                <div>
                  <label>
                    After moment{" "}
                    <select
                      aria-label={`After frame ${step.id}`}
                      value={check.toFrame}
                      onChange={(e) =>
                        update(
                          step.id,
                          {
                            toFrame: Number(e.target.value),
                            toRegion: null,
                            conditionConfirmed: false,
                          },
                          fallback,
                        )
                      }
                    >
                      {frameOptions}
                    </select>
                  </label>
                  <RegionEditor
                    video={video}
                    timestamp={context.lesson.media.frameTimesMs[check.toFrame]}
                    width={size.width}
                    height={size.height}
                    title="Target zone"
                    region={check.toRegion}
                    onRegion={(region) =>
                      update(
                        step.id,
                        { toRegion: region, conditionConfirmed: false },
                        fallback,
                      )
                    }
                  />
                </div>
              </div>
              {(!check.fromRegion || !check.toRegion) && (
                <div
                  role="status"
                  className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3"
                >
                  <p>
                    Needs clearer movement evidence. Select two tracked moments
                    and draw separate zones, or revise the step. Uncertain
                    tracking cannot be approved.
                  </p>
                  <button
                    onClick={() => {
                      const next = suggestReviews(draft, context)[step.id];
                      update(step.id, next, fallback);
                      setError(
                        next.fromRegion && next.toRegion
                          ? ""
                          : "No clear, continuously tracked movement meets this step's rule. Choose a supported interval, revise the step, or record a clearer demonstration; no extra paid analysis was run.",
                      );
                    }}
                  >
                    Recheck suggested zones for step{" "}
                    {draft.procedure.steps.indexOf(step) + 1}
                  </button>
                </div>
              )}
            </div>
          </details>
        );
      })}
      <details>
        <summary>Advanced rule editor</summary>
        <p>
          Changes reset review. Keep approval null; component IDs and source
          frames must match the lesson.
        </p>
        <textarea
          className="h-96 w-full border p-2 font-mono text-sm"
          aria-label="Draft JSON"
          value={editor}
          onChange={(e) => {
            setEditor(e.target.value);
            setApproved(null);
            setChecks({});
            setConfirm(false);
            setGoalConfirmed(false);
          }}
        />
        <button
          onClick={() => {
            try {
              const input: unknown = JSON.parse(editor);
              const next = validateDraft(input, context);
              setDraft(next);
              setEditor(JSON.stringify(next, null, 2));
              setChecks(suggestReviews(next, context));
              setConfirm(false);
              setGoalConfirmed(false);
              setError("");
            } catch (e) {
              const message = reviewErrorMessage(e);
              setError(message);
              feedback.failure(message);
            }
          }}
        >
          Apply edited draft
        </button>
      </details>
      <section
        aria-label="Felicity audit"
        data-testid="felicity-audit"
        className="space-y-2 rounded-xl border border-violet-300 bg-violet-50 p-3"
      >
        <h3 className="font-bold text-violet-900">
          Felicity audit — check before approving
        </h3>
        {audit.status === "loading" && (
          <p className="text-sm">
            Felicity is comparing this draft with the transcript and the
            measured object movements…
          </p>
        )}
        {audit.status === "unavailable" && (
          <p className="text-sm" data-audit-status="unavailable">
            Audit unavailable ({audit.reason}). The draft is unchanged; review it
            yourself as usual.
          </p>
        )}
        {audit.status === "ready" && (
          <>
            {audit.summary && <p className="text-sm">{audit.summary}</p>}
            {audit.findings.length === 0 ? (
              <p className="text-sm" data-audit-status="clear">
                No issues found. You are still responsible for the review.
              </p>
            ) : (
              <ul className="space-y-1">
                {audit.findings.map((finding, index) => (
                  <li
                    key={index}
                    data-attention={finding.attention}
                    className={`rounded-lg border bg-white p-2 text-sm ${finding.attention === "requires_expert" ? "border-amber-500" : "border-slate-200"}`}
                  >
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${finding.attention === "requires_expert" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}
                    >
                      {finding.attention === "requires_expert"
                        ? "Needs your attention"
                        : "Suggestion"}
                    </span>
                    <strong>{AUDIT_LABEL[finding.category] ?? finding.category}:</strong>{" "}
                    {finding.message}
                    <br />
                    <span className="text-slate-700">
                      Suggested: {finding.suggestion}
                    </span>
                    {(finding.stepId || finding.transcriptMs !== null || finding.frame !== null) && (
                      <span className="block text-xs text-slate-500">
                        {[
                          finding.stepId && `step ${finding.stepId}`,
                          finding.transcriptMs !== null &&
                            `narration at ${(finding.transcriptMs / 1000).toFixed(1)} s`,
                          finding.frame !== null && `video frame ${finding.frame}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-600">
              Advice only: Felicity never changes or approves the procedure.
              Edit the steps above if you agree.
            </p>
          </>
        )}
      </section>
      <label>
        Your reviewer name{" "}
        <input
          value={reviewer}
          maxLength={100}
          onChange={(e) => {
            setReviewer(e.target.value);
            setApproved(null);
          }}
        />
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => approveAll(e.target.checked)}
        />
        I approve this lesson for Practice.
      </label>
      {effectiveBlockers.length > 0 && (
        <div
          id="approval-readiness"
          role="status"
          className="rounded border border-amber-400 bg-amber-50 p-4"
        >
          <h3 className="font-bold">Needs attention before approval</h3>
          <ul className="list-disc pl-5">
            {effectiveBlockers.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        aria-describedby={
          effectiveBlockers.length ? "approval-readiness" : undefined
        }
        disabled={
          busy ||
          dirty ||
          !confirm ||
          !reviewer.trim() ||
          effectiveBlockers.length > 0
        }
        className="primary"
        onClick={() => void approve()}
      >
        Approve procedure
      </button>
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-red-800">
          {error}
        </p>
      )}
      <FeedbackPopup notice={feedback.notice} onClose={feedback.close} />
      {approved !== null && (
        <div role="status">
          <p className="font-bold">
            Procedure approved. Save and open Practice.
          </p>
          {ApprovedArtifactSchema.safeParse(approved).data?.rehearsal && (
            <p className="text-sm">
              {rehearsalLabel(
                ApprovedArtifactSchema.parse(approved).rehearsal!,
              )}
            </p>
          )}
          <button
            disabled={busy}
            className="primary"
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void (async () => {
                try {
                  const text = JSON.stringify(approved);
                  if (text.length > 1_500_000)
                    throw new Error(
                      "Use the downloaded export: this lesson is too large for quick handoff.",
                    );
                  const artifact = ApprovedArtifactSchema.parse(approved);
                  const beforeMs =
                    context.lesson.media.frameTimesMs[
                      artifact.review.steps[0].fromFrame
                    ];
                  const goalMs = Math.max(
                    ...artifact.review.steps.map(
                      (step) => context.lesson.media.frameTimesMs[step.toFrame],
                    ),
                  );
                  const [before, goal] = await Promise.all([
                    frameImage(video, beforeMs),
                    frameImage(video, goalMs),
                  ]);
                  await saveApprovedProcedure(text, {
                    before,
                    goal,
                    beforeMs,
                    goalMs,
                  });
                  sessionStorage.setItem("steplint-approved-handoff", text);
                  router.push("/practice");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Save failed. Download the approved export instead.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Save and open Practice
          </button>
        </div>
      )}
    </section>
  );
}

function readRehearsal(lessonId: string): Rehearsal | null {
  try {
    const raw = localStorage.getItem(rehearsalKey(lessonId));
    const parsed = raw ? RehearsalSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function rehearsalLabel(rehearsal: Rehearsal) {
  if (rehearsal.status === "not_run")
    return "Rehearsal: not run for this exact revision.";
  return rehearsal.status === "passed"
    ? `Rehearsal: passed${rehearsal.hadViolations ? " after a corrected violation" : ""} (browser rehearsal, not physical acceptance).`
    : "Rehearsal: failed. Approval is allowed, but the lesson has not passed a rehearsal.";
}

/**
 * A reviewer-edited zone replaces the suggestion, so a flag that was only
 * about suggested zone regions no longer applies; approval's evidence check
 * (validateReviewEvidence via reviewBlockers) then decides. Window flags stay.
 */
function clearZoneConflict(check: Check): Check {
  if (!check.zoneConflict) return check;
  const { zoneConflict: _cleared, evidenceReason: _reason, ...rest } = check;
  void _cleared;
  void _reason;
  return { ...rest, evidenceStatus: "supported" };
}
