import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { gestureReading } from "./readings";
type Input =
  | { type: "init"; origin: string }
  | { type: "frame"; image: ImageBitmap; at: number };
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Input>) => void) | null;
  postMessage: (message: unknown) => void;
};
let recognizer: GestureRecognizer | null = null;
scope.onmessage = (event) => {
  const input = event.data;
  if (input.type === "init") {
    void (async () => {
      try {
        const files = await FilesetResolver.forVisionTasks(
          `${input.origin}/mediapipe-wasm`,
        );
        recognizer = await GestureRecognizer.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: `${input.origin}/models/gesture_recognizer.task`,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        scope.postMessage({ type: "ready" });
      } catch {
        scope.postMessage({
          type: "error",
          message:
            "Hand tracking could not load. Use the buttons or disable and re-enable gesture control.",
        });
      }
    })();
    return;
  }
  const started = performance.now();
  try {
    if (!recognizer) throw Error("Recognizer is not ready");
    const result = recognizer.recognizeForVideo(input.image, input.at);
    scope.postMessage({
      type: "result",
      reading: gestureReading(result, input.at),
      elapsedMs: performance.now() - started,
    });
  } catch {
    scope.postMessage({
      type: "error",
      message:
        "Hand tracking stopped. Use the buttons or disable and re-enable gesture control.",
    });
  } finally {
    input.image.close();
  }
};
