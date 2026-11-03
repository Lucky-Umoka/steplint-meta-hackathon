import { approvedFixture as fixture } from "./approved-fixture";
import { expect, type Page } from "./safe-test";

/** Synthetic camera + speech (copied from local-practice.spec.ts). */
export async function camera(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      static counter = 0;
      instance = ++Recognition.counter;
      continuous = true;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        Object.assign(window, { localRecognition: this });
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: Recognition });
    const spoken: string[] = [];
    Object.assign(window, { localSpoken: spoken });
    window.speechSynthesis.speak = (utterance) => {
      spoken.push(utterance.text);
    };
    window.speechSynthesis.cancel = () => {};
    const state = { x: 48, hidden: false };
    Object.assign(window, { localScene: state });
    const canvas = document.createElement("canvas"),
      background = document.createElement("canvas"),
      sprite = document.createElement("canvas");
    canvas.width = background.width = 320;
    canvas.height = background.height = 240;
    sprite.width = 64;
    sprite.height = 84;
    const ctx = canvas.getContext("2d")!,
      bg = background.getContext("2d")!,
      object = sprite.getContext("2d")!;
    const pixels = bg.createImageData(320, 240),
      objectPixels = object.createImageData(64, 84);
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 320; x++) {
        let hash = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
        hash ^= hash >>> 16;
        const value = 50 + ((hash >>> 0) % 150),
          i = (y * 320 + x) * 4;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
      }
    for (let y = 0; y < 84; y++)
      for (let x = 0; x < 64; x++) {
        let hash = Math.imul(x, 0x45d9f3b) ^ Math.imul(y + 72, 0x119de1f3);
        hash ^= hash >>> 16;
        const value = 50 + ((hash >>> 0) % 150),
          i = (y * 64 + x) * 4;
        objectPixels.data[i] =
          objectPixels.data[i + 1] =
          objectPixels.data[i + 2] =
            value;
        objectPixels.data[i + 3] = 255;
      }
    bg.putImageData(pixels, 0, 0);
    object.putImageData(objectPixels, 0, 0);
    // The camera supplies pixels; avoid a synthetic 76,800-array allocation
    // loop per animation frame competing with the actual verification UI.
    const draw = () => {
      ctx.drawImage(background, 0, 0);
      if (!state.hidden) ctx.drawImage(sprite, state.x, 72);
      requestAnimationFrame(draw);
    };
    draw();
    Object.assign(window, {
      localReferenceImage: canvas.toDataURL("image/jpeg", 0.85),
    });
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
  });
}

export async function utter(page: Page, text: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!(window as unknown as { localRecognition?: { onresult?: unknown } })
            .localRecognition?.onresult,
      ),
    )
    .toBe(true);
  await page.evaluate(
    (text) =>
      (
        window as unknown as {
          localRecognition: { onresult: (event: unknown) => void };
        }
      ).localRecognition.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: text } }],
      }),
    text,
  );
}

/**
 * Counts real tracking workers and can silence frame replies or deny the
 * camera, so lifecycle behaviour is observable without model calls.
 */
export async function lifecycleHarness(
  page: Page,
  options: { denyCamera?: boolean } = {},
) {
  await camera(page);
  await page.addInitScript((deny) => {
    const qa = { workers: 0, silent: false };
    Object.assign(window, { qaLifecycle: qa });
    const Native = window.Worker;
    class CountingWorker extends Native {
      constructor(url: string | URL, init?: WorkerOptions) {
        super(url, init);
        qa.workers++;
      }
      postMessage(message: unknown, transfer?: unknown) {
        // Silence: frames are swallowed, so no reply ever arrives.
        if (
          qa.silent &&
          message &&
          typeof message === "object" &&
          (message as { type?: string }).type === "frame"
        )
          return;
        super.postMessage(message, transfer as Transferable[]);
      }
    }
    Object.assign(window, { Worker: CountingWorker });
    if (deny)
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("denied", "NotAllowedError");
      };
  }, !!options.denyCamera);
  const { artifact } = fixture();
  await page.addInitScript((raw) => {
    const image = (window as unknown as { localReferenceImage: string })
      .localReferenceImage;
    const approved = JSON.parse(raw);
    approved.automaticSetup = {
      sceneFrame: 0,
      objects: [
        {
          id: "component-1",
          frame: 0,
          box: { left: 0.15, top: 0.3, right: 0.35, bottom: 0.65 },
          fixed: false,
        },
      ],
      frames: [{ frame: 0, image }],
    };
    sessionStorage.setItem(
      "steplint-approved-handoff",
      JSON.stringify(approved),
    );
  }, JSON.stringify(artifact));
}
export const lifecycleState = (page: Page) =>
  page.locator("#local-practice-status").getAttribute("data-lifecycle-state");
export const workers = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { qaLifecycle: { workers: number } }).qaLifecycle
        .workers,
  );
