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
let state: LocalTrackingState | null = null;
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
      const initialized = bootstrapLocal(input.image, input.source);
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
      result = trackLocal(input.image, state, {
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
