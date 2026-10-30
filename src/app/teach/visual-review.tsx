"use client";
import type { Guide } from "@/guide/schema";
import GuideFrame from "@/components/guide-frame";
export default function VisualReview({
  guide,
  onChange,
  reviewed,
  onReviewed,
  goalReviewed,
  onGoalReviewed,
}: {
  guide: Guide;
  onChange: (g: Guide) => void;
  reviewed: string[];
  onReviewed: (ids: string[]) => void;
  goalReviewed: boolean;
  onGoalReviewed: (v: boolean) => void;
}) {
  const edit = (
    stepId: string,
    field: "instruction" | "correction",
    value: string,
  ) =>
    onChange({
      ...guide,
      steps: guide.steps.map((s) =>
        s.id === stepId ? { ...s, [field]: value } : s,
      ),
      approval: null,
    });
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <p className="mb-2 text-sm font-semibold text-emerald-800">The goal</p>
        <h2 className="text-2xl font-bold">{guide.title}</h2>
        <p className="mt-2 text-slate-600">{guide.goal}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <GuideFrame
            guide={guide}
            frame={guide.steps[0].evidence.startFrame}
            title="Start here"
          />
          <GuideFrame
            guide={guide}
            frame={guide.goalFrame}
            title="Expected result"
          />
        </div>
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={goalReviewed}
            onChange={(e) => onGoalReviewed(e.target.checked)}
          />
          <span>I checked the starting view and the demonstrated goal.</span>
        </label>
        <details className="mt-3">
          <summary>Edit guide wording</summary>
          <label className="my-2 block text-sm">
            Title
            <input
              value={guide.title}
              maxLength={180}
              onChange={(e) =>
                onChange({ ...guide, title: e.target.value, approval: null })
              }
            />
          </label>
          <label className="my-2 block text-sm">
            Goal
            <textarea
              value={guide.goal}
              maxLength={1600}
              onChange={(e) =>
                onChange({ ...guide, goal: e.target.value, approval: null })
              }
            />
          </label>
        </details>
      </section>
      <details className="rounded-2xl border bg-white p-5">
        <summary>Objects and source evidence</summary>
        <p className="mb-3 text-xs text-slate-500">
          Frame coverage is measured data, not a probability that the guide is
          correct. Geometry is relative to the image, not a physical
          measurement.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {guide.objects.map((object) => {
            const quality = guide.source.tracking?.find(
              (item) => item.objectId === object.id,
            );
            return (
              <section key={object.id} className="rounded-lg border p-3">
                <h3 className="font-semibold">{object.label}</h3>
                <p className="mt-1 text-sm">{object.description}</p>
                {quality && (
                  <p className="mt-2 text-xs text-slate-500">
                    Reliable source frames: {quality.trustedFrames}/
                    {quality.observedFrames} observed (
                    {quality.observedFrames
                      ? Math.round(
                          (100 * quality.trustedFrames) /
                            quality.observedFrames,
                        )
                      : 0}
                    %). Longest continuous reliable run:{" "}
                    {quality.longestTrustedRun} frames.{" "}
                    {quality.totalFrames - quality.observedFrames} frames
                    without a detected outline.
                  </p>
                )}
                {object.profile?.namesHeard.map((name, i) => (
                  <p key={i} className="mt-2 text-sm">
                    Spoken name: “{name.name}” ·{" "}
                    {(
                      (guide.source.transcript.turns[name.turnId]?.startMs ??
                        0) / 1000
                    ).toFixed(1)}
                    s turn
                  </p>
                ))}
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {object.profile?.appearances.map((appearance) => (
                    <li key={appearance.frame}>
                      {(
                        guide.source.frameTimesMs[appearance.frame] / 1000
                      ).toFixed(1)}
                      s: {appearance.description}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </details>
      {guide.steps.map((step, index) => {
        const involved = [
          step.condition.objectId,
          ...(step.condition.anchorId ? [step.condition.anchorId] : []),
          ...step.condition.requiredVisibleAfter,
        ];
        const turns = step.evidence.turnIds.map(
          (i) => guide.source.transcript.turns[i],
        );
        return (
          <article key={step.id} className="rounded-2xl border bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-bold text-emerald-800">
                {index + 1}
              </span>
              <div>
                <h3 className="text-xl font-bold">{step.instruction}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {(step.evidence.startMs / 1000).toFixed(1)}–
                  {(step.evidence.endMs / 1000).toFixed(1)}s ·{" "}
                  {involved
                    .map((id) => guide.objects.find((o) => o.id === id)?.label)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <GuideFrame
                guide={guide}
                frame={step.evidence.startFrame}
                title="1. Start"
                objectIds={involved}
              />
              <GuideFrame
                guide={guide}
                frame={step.evidence.changeFrame}
                title="2. Change"
                objectIds={involved}
              />
              <GuideFrame
                guide={guide}
                frame={step.evidence.endFrame}
                title="3. Result"
                objectIds={involved}
              />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Camera checks:{" "}
              {
                guide.objects.find((o) => o.id === step.condition.objectId)
                  ?.label
              }{" "}
              {step.condition.kind === "separation"
                ? `moves away from ${guide.objects.find((o) => o.id === step.condition.anchorId)?.label}.`
                : "moves visibly from its starting position."}{" "}
              This checks visible movement; it does not prove hidden work is
              correct.
            </p>
            {!step.supported && (
              <p
                role="status"
                className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900"
              >
                Tracking is not clear enough for this step. Correct the marks or
                record a clearer view before saving.
              </p>
            )}
            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={reviewed.includes(step.id)}
                disabled={!step.supported}
                onChange={(e) =>
                  onReviewed(
                    e.target.checked
                      ? [...reviewed, step.id]
                      : reviewed.filter((id) => id !== step.id),
                  )
                }
              />
              <span>
                I checked this instruction, the marked change and its result.
              </span>
            </label>
            <details className="mt-3">
              <summary>Source and optional corrections</summary>
              <p className="my-2 text-sm text-slate-600">{step.explanation}</p>
              <label className="block text-sm">
                Instruction
                <input
                  value={step.instruction}
                  maxLength={1600}
                  onChange={(e) => edit(step.id, "instruction", e.target.value)}
                />
              </label>
              <label className="mt-2 block text-sm">
                Correction message
                <input
                  value={step.correction}
                  maxLength={1600}
                  onChange={(e) => edit(step.id, "correction", e.target.value)}
                />
              </label>
              {turns.map((t, i) => (
                <p key={i} className="mt-3 text-sm text-slate-600">
                  Narration {(t.startMs / 1000).toFixed(1)}–
                  {(t.endMs / 1000).toFixed(1)}s: “{t.text}”
                </p>
              ))}
              {step.uncertainties.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                  {step.uncertainties.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              )}
            </details>
          </article>
        );
      })}
      <details className="rounded-xl border bg-white p-4">
        <summary>What the lesson covers</summary>
        <ul className="space-y-3 pt-2">
          {guide.coverage.map((c, i) => (
            <li key={i}>
              <strong>
                {c.status === "included"
                  ? "Included"
                  : c.status === "outside_goal"
                    ? "Outside this goal"
                    : "Needs evidence"}
                :
              </strong>{" "}
              {c.instruction}
              <p className="text-sm text-slate-500">{c.reason}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
