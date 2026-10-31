import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __qaScene: { x1: number; x2: number };
    __qaStreams: MediaStream[];
  }
}
const GUIDE_ID = "11111111-2222-3333-8444-555555555555";
const GUIDE_KEY = `${GUIDE_ID}:1:demonstrated:published`;
const boxes: Record<string, { x: number; y: number }> = {
  "component-1": { x: 100, y: 100 },
  "component-2": { x: 300, y: 200 },
};
const SIZE = 40;
function norm(x: number, y: number) {
  return {
    left: x / 640,
    top: y / 480,
    right: (x + SIZE) / 640,
    bottom: (y + SIZE) / 480,
  };
}
function maskFor(id: string) {
  const bytes = new Array(200).fill(255);
  const p = boxes[id];
  return {
    width: 40,
    height: 40,
    bounds: norm(p.x, p.y),
    bits: Buffer.from(bytes).toString("base64"),
  };
}
function guideDoc() {
  const step = (
    id: string,
    objectId: string,
    instruction: string,
    prerequisites: string[],
    evidence: {
      startFrame: number;
      changeFrame: number;
      endFrame: number;
      startMs: number;
      endMs: number;
    },
  ) => ({
    id,
    instruction,
    explanation: `Move ${objectId}.`,
    correction: `Put ${objectId} back and try again.`,
    prerequisites,
    condition: {
      kind: "movement",
      objectId,
      anchorId: null,
      minimumChange: 0.15,
      requiredVisibleAfter: [objectId],
    },
    evidence: { ...evidence, turnIds: [0] },
    uncertainties: [],
    supported: true,
  });
  return {
    schemaVersion: 2,
    id: GUIDE_ID,
    revision: 1,
    parentRevision: null,
    methodId: "demonstrated",
    methodName: "Demonstrated",
    title: "Move two parts",
    goal: "Both parts moved",
    initialInstruction: "Show both parts.",
    objects: [
      {
        id: "component-1",
        label: "Part one",
        description: "First part",
        initiallyVisible: true,
        sourceFrame: 0,
        sourceBox: norm(100, 100),
        appearance: null,
      },
      {
        id: "component-2",
        label: "Part two",
        description: "Second part",
        initiallyVisible: true,
        sourceFrame: 0,
        sourceBox: norm(300, 200),
        appearance: null,
      },
    ],
    steps: [
      step("step-a", "component-1", "Move part one aside.", [], {
        startFrame: 0,
        changeFrame: 5,
        endFrame: 10,
        startMs: 0,
        endMs: 1000,
      }),
      step("step-b", "component-2", "Move part two aside.", ["step-a"], {
        startFrame: 11,
        changeFrame: 15,
        endFrame: 20,
        startMs: 1100,
        endMs: 2000,
      }),
    ],
    coverage: [
      { instruction: "Move part one.", status: "included", reason: "Shown." },
      { instruction: "Move part two.", status: "included", reason: "Shown." },
    ],
    goalFrame: 20,
    goalStepIds: ["step-b"],
    goalSupported: false,
    source: {
      durationMs: 2100,
      width: 640,
      height: 480,
      frameTimesMs: Array.from({ length: 21 }, (_, i) => i * 100),
      transcript: {
        text: "Move both parts.",
        durationMs: 2100,
        turns: [{ startMs: 0, endMs: 2000, text: "Move both parts." }],
      },
    },
    images: [],
    geometry: [],
    approval: {
      reviewer: "QA Harness",
      at: 1,
      purpose: "published",
      testOnly: false,
      contentHash: "0".repeat(64),
    },
  };
}
async function setup(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.__qaScene = { x1: 100, x2: 300 };
    window.__qaStreams = [];
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    // Per-pixel hash noise (like e2e/workflow.spec.ts): a real camera sensor
    // always has adjacent-pixel variation, which frameQuality requires, and
    // object-relative texture so the local tracker follows moved parts.
    const draw = () => {
      const g = canvas.getContext("2d")!;
      const image = g.createImageData(640, 480);
      const scene = window.__qaScene;
      for (let y = 0; y < 480; y++)
        for (let x = 0; x < 640; x++) {
          const p = (y * 640 + x) * 4;
          let backgroundHash =
            Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
          backgroundHash ^= backgroundHash >>> 16;
          let value = 55 + ((backgroundHash >>> 0) % 100);
          for (const [key, baseY] of [
            ["x1", 100],
            ["x2", 200],
          ] as const) {
            const ox = x - (scene[key] as number);
            // NOTE: this script runs in the browser; do not close over
            // module constants (Playwright serializes the function only).
            if (ox >= 0 && ox < 40 && y >= baseY && y < baseY + 40) {
              let hash = Math.imul(ox, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
              hash ^= hash >>> 16;
              value = ((hash >>> 0) % 190) + 50;
            }
          }
          image.data[p] = value;
          image.data[p + 1] = value;
          image.data[p + 2] = value;
          image.data[p + 3] = 255;
        }
      g.putImageData(image, 0, 0);
      requestAnimationFrame(draw);
    };
    draw();
    const stream = canvas.captureStream(15);
    window.__qaStreams.push(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => stream,
        enumerateDevices: async () => [],
      },
      configurable: true,
    });
  });
  await page.route("**/api/teach/guide/session", (route) =>
    route.fulfill({
      json: { token: "qa-session-token", maximumModelRequests: 6 },
    }),
  );
  await page.route("**/api/teach/guide/perceive", (route) =>
    route.fulfill({
      json: {
        phase: "starting",
        objects: ["component-1", "component-2"].map((id) => ({
          objectId: id,
          quality: "observed",
          box: norm(boxes[id].x, boxes[id].y),
          score: 0.97,
        })),
        foregrounds: ["component-1", "component-2"].map((id) => ({
          objectId: id,
          foreground: maskFor(id),
        })),
        remainingModelRequests: 6,
      },
    }),
  );
  const row = {
    key: GUIDE_KEY,
    artifact: { guide: guideDoc(), receipt: "qa-receipt" },
    savedAt: 1,
    rehearsal: null,
  };
  await page.goto("/practice");
  await page.evaluate(async (seed: unknown) => {
    const open = indexedDB.open("steplint-guides", 2);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("guides", "readwrite");
      tx.objectStore("guides").put(seed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, row);
  await page.goto(`/practice?test=${encodeURIComponent(GUIDE_KEY)}`);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByText("Ready when you are")).toBeVisible({
    timeout: 30000,
  });
}
async function move(
  page: import("@playwright/test").Page,
  key: "x1" | "x2",
  dx: number,
  steps = 4,
) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(
      ([k, d]: ["x1" | "x2", number]) => {
        window.__qaScene[k] += d;
      },
      [key, dx] as ["x1" | "x2", number],
    );
    await page.waitForTimeout(250);
  }
}
test("a correct action advances automatically without Ready or Check clicks", async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByRole("button", { name: /check current view/i }),
  ).toHaveCount(0);
  // A single decisive jump clears the 0.15 auto-start threshold at once,
  // so the trigger cannot straddle the 3s baseline window under CPU load.
  await move(page, "x1", 12, 1);
  await page.waitForTimeout(1000);
  await expect(page.getByRole("button", { name: /ready/i })).toHaveCount(0);
  await move(page, "x1", 12, 3);
  await expect(page.getByText("Step 2 of 2")).toBeVisible({
    timeout: 20000,
  });
});
test("a wrong-order action raises an alert automatically and clears on correction", async ({
  page,
}) => {
  await setup(page);
  await move(page, "x1", 4, 1);
  await page.waitForTimeout(500);
  await move(page, "x2", 12, 1);
  // Filter by text: Next.js also renders an (empty) route-announcer alert,
  // which strict-mode getByRole("alert") would collide with.
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Pause and correct" });
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(alert).toContainText("Pause and correct");
  await expect(alert).toContainText("Put component-2 back");
  await move(page, "x2", -12, 1);
  await page.waitForTimeout(1500);
  await move(page, "x1", 12, 2);
  await expect(page.getByText("Step 2 of 2")).toBeVisible({
    timeout: 20000,
  });
});
test("visual alerts work with voice disabled", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: /voice on/i }).click();
  await move(page, "x1", 4, 1);
  await page.waitForTimeout(500);
  await move(page, "x2", 12, 1);
  await expect(
    page.getByRole("alert").filter({ hasText: "Pause and correct" }),
  ).toBeVisible({ timeout: 20000 });
});
test("stopping the session releases every camera track", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: /stop camera/i }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__qaStreams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
});
