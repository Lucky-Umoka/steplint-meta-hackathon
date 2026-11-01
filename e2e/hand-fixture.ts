import { expect, type Page } from "./safe-test";
import type { Locator } from "@playwright/test";
/** Simulated recognizer readings; real frame capture, engine, hit testing and host handlers. */
export async function installHandFixture(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    class WorkerBridge {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      native: Worker | null = null;
      constructor(
        private url: string | URL,
        private options?: WorkerOptions,
      ) {}
      postMessage(
        input: { type: string; at?: number; image?: ImageBitmap },
        transfer: Transferable[] = [],
      ) {
        if (input.type === "init") {
          queueMicrotask(() =>
            this.onmessage?.(
              new MessageEvent("message", { data: { type: "ready" } }),
            ),
          );
          return;
        }
        if (input.type === "frame" && input.image) {
          input.image.close();
          const hand = (
            window as unknown as {
              controlHand?: { x: number; y: number; kind: string };
            }
          ).controlHand;
          const reading = hand
            ? {
                ...hand,
                confidence: hand.kind === "pinch" ? null : 0.99,
                geometry: "hand-relative-pinch",
                pinchGap: 0.02,
                at: input.at,
              }
            : { kind: "none", confidence: 0, at: input.at };
          this.onmessage?.(
            new MessageEvent("message", {
              data: { type: "result", reading, elapsedMs: 1 },
            }),
          );
          return;
        }
        if (!this.native) {
          this.native = new NativeWorker(this.url, this.options);
          this.native.onmessage = (event) => this.onmessage?.(event);
          this.native.onerror = (event) => this.onerror?.(event);
        }
        this.native.postMessage(input, transfer);
      }
      terminate() {
        this.native?.terminate();
      }
    }
    Object.assign(window, { Worker: WorkerBridge });
  });
}
export async function pinchControl(page: Page, control: Locator) {
  const prior = Number(
    await page.getByTestId("gesture-controls").getAttribute("data-activations"),
  );
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  if (!box) throw Error("Control is not visible");
  await page.evaluate((box) => {
    Object.assign(window, {
      controlHand: {
        kind: "point",
        x: 0.8 + 0.18 * ((box.x + box.width / 2) / innerWidth),
        y: 0.1 + 0.8 * ((box.y + box.height / 2) / innerHeight),
      },
    });
  }, box);
  await expect(page.getByTestId("gesture-pointer")).toBeVisible();
  await page.waitForTimeout(300); // release the previous pinch before starting the next dwell
  await page.evaluate(() => {
    (window as unknown as { controlHand: { kind: string } }).controlHand.kind =
      "pinch";
  });
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("gesture-controls")
          .getAttribute("data-activations"),
      ),
    )
    .toBeGreaterThan(prior);
  await page.evaluate(() => {
    (window as unknown as { controlHand: { kind: string } }).controlHand.kind =
      "point";
  });
}
