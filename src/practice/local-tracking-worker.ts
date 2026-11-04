/// <reference lib="webworker" />
import {
  calibrateLocal,
  bootstrapLocal,
  trackLocal,
  trackingMeasurements,
  type LocalTrackingState,
} from "./local-tracking";
import {
  LocalWorkerInputSchema,
  LocalWorkerReplySchema,
  type LocalWorkerReply,
} from "./local-tracking-protocol";
import { mappedSetupIssue, warpToTeach, type View } from "./viewpoint";
let state: LocalTrackingState | null = null;
/** Teach -> live mapping from the locate step (null: same viewpoint). */
let view: View | null = null;
function send(reply: LocalWorkerReply) {
  self.postMessage(LocalWorkerReplySchema.parse(reply));
}
self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = LocalWorkerInputSchema.safeParse(event.data);
  if (!parsed.success) {
    const generation =
      event.data &&
      typeof event.data === "object" &&
      "generation" in event.data &&
      typeof event.data.generation === "number" &&
      Number.isInteger(event.data.generation) &&
      event.data.generation >= 0
        ? event.data.generation
        : 0;
    send({
      type: "error",
      generation,
      message: "Invalid bounded tracking request.",
    });
    return;
  }
  const input = parsed.data;
  try {
    if (input.type === "bootstrap") {
      // Camera placed differently from the Teach recording: track in the
      // Teach viewpoint (src/practice/viewpoint.ts). A large residual after
      // mapping means a mis-matched reference: refuse, the page retries.
      view = input.view ?? null;
      const initialized = bootstrapLocal(
        view ? warpToTeach(input.image, view) : input.image,
        input.source,
      );
      const issue = view ? mappedSetupIssue(initialized.zoneTranslations) : null;
      if (issue) throw Error(issue);
      state = initialized.state;
      send({
        type: "calibrated",
        generation: input.generation,
        measurements: trackingMeasurements(state),
        translation: initialized.translation,
        zoneTranslations: initialized.zoneTranslations,
      });
      return;
    }
    if (input.type === "calibrate") {
      state = calibrateLocal(input.image, input.calibration);
      send({
        type: "calibrated",
        generation: input.generation,
        measurements: trackingMeasurements(state),
      });
      return;
    }
    if (!state) throw Error("Calibrate before tracking.");
    const started = performance.now(),
      result = trackLocal(view ? warpToTeach(input.image, view) : input.image, state, {
        nowMs: input.timestampMs,
        frameId: input.frameId,
        watch: input.watch,
      });
    send({
      type: "tracked",
      generation: input.generation,
      watchRevision: input.watchRevision,
      timestampMs: input.timestampMs,
      frameId: input.frameId,
      processingMs: performance.now() - started,
      ...result,
      measurements: trackingMeasurements(state),
    });
  } catch (error) {
    state = null;
    send({
      type: "error",
      generation: input.generation,
      message:
        error instanceof Error ? error.message : "Local tracking failed.",
    });
  }
};
