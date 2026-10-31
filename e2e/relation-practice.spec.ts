import { test, expect, type Page } from "@playwright/test";
import type { RelationPlan } from "../src/guide/relations";
const plan: RelationPlan = {
  title: "Place part on support",
  goal: "Part rests on support",
  initialInstruction: "Part starts beside the support",
  objects: [
    { id: "component-1", label: "Part", description: "Distinct small part" },
    { id: "component-2", label: "Support", description: "Destination surface" },
  ],
  steps: [
    {
      id: "place",
      instruction: "Place the part on the support",
      explanation: "Part base visibly rests on support surface",
      correction:
        "Return the part beside the support, then place it on the support",
      objectId: "component-1",
      anchorId: "component-2",
      before: "separate",
      after: "supported_by",
      startMs: 0,
      changeMs: 500,
      endMs: 1000,
    },
  ],
  coverage: [
    {
      instruction: "Place part on support",
      status: "included",
      reason: "Demonstrated",
    },
  ],
  goalStepIds: ["place"],
};
async function setup(page: Page) {
  await page.addInitScript(() => {
    const state = { x: 30, streams: [] as MediaStream[] };
    Object.assign(window, { relationCamera: state });
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    function draw() {
      ctx.fillStyle = "#888";
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = "#eee";
      ctx.fillRect(140, 160, 130, 30);
      ctx.fillStyle = "#222";
      ctx.fillRect(state.x, 90, 50, 70);
      requestAnimationFrame(draw);
    }
    draw();
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = canvas.captureStream(15);
      state.streams.push(stream);
      return stream;
    };
  });
  await page.route("**/api/teach/guide/session", (r) =>
    r.fulfill({ json: { token: "mock-only", maximumModelRequests: 12 } }),
  );
  await page.route("**/api/teach/guide/perceive", (r) =>
    r.fulfill({
      json: {
        phase: "starting",
        objects: [],
        foregrounds: [],
        remainingModelRequests: 10,
      },
    }),
  );
  await page.goto("/practice");
  await page.evaluate(async (plan) => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const image = c.toDataURL("image/jpeg");
    const objectBox = { left: 0.1, top: 0.3, right: 0.3, bottom: 0.6 };
    const guide = {
      schemaVersion: 2,
      id: "93f7a7da-d2ee-4580-ad4f-f439af82c013",
      revision: 1,
      parentRevision: null,
      methodId: "visual-relations-v1",
      methodName: "Visible relationships",
      title: plan.title,
      goal: plan.goal,
      initialInstruction: plan.initialInstruction,
      relationPlan: plan,
      objects: plan.objects.map((o) => ({
        ...o,
        initiallyVisible: true,
        sourceFrame: 0,
        sourceBox: objectBox,
        appearance: image,
      })),
      steps: plan.steps.map((s) => ({
        id: s.id,
        instruction: s.instruction,
        explanation: s.explanation,
        correction: s.correction,
        prerequisites: [],
        condition: {
          kind: "visual_relation",
          objectId: s.objectId,
          anchorId: s.anchorId,
          minimumChange: 0.15,
          requiredVisibleAfter: [s.objectId, s.anchorId],
          relation: { before: s.before, after: s.after },
        },
        evidence: {
          startFrame: 0,
          changeFrame: 5,
          endFrame: 10,
          startMs: 0,
          endMs: 1000,
          turnIds: [],
        },
        uncertainties: [],
        supported: true,
      })),
      coverage: plan.coverage,
      goalFrame: 10,
      goalStepIds: ["place"],
      goalSupported: true,
      source: {
        durationMs: 1100,
        width: 320,
        height: 240,
        frameTimesMs: Array.from({ length: 11 }, (_, i) => i * 100),
        transcript: {
          text: "Place part",
          durationMs: 1100,
          turns: [{ startMs: 0, endMs: 1000, text: "Place part" }],
        },
      },
      images: [0, 5, 10].map((frame) => ({ frame, image })),
      geometry: [],
      approval: {
        reviewer: "MOCK TEST ONLY",
        at: 1,
        purpose: "published",
        testOnly: true,
        contentHash: "0".repeat(64),
      },
    };
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("steplint-guides", 2);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("guides", { keyPath: "key" });
        r.result.createObjectStore("drafts");
      };
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("guides", "readwrite");
        tx.objectStore("guides").put({
          key: `${guide.id}:1:visual-relations-v1:published`,
          artifact: { guide, receipt: "mock" },
          savedAt: 1,
          rehearsal: null,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
  }, plan);
  await page.reload();
  await page.getByRole("button", { name: /Practice this guide/ }).click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByText(
      "Watching automatically. Follow the instruction; hold each result briefly for verification.",
    ),
  ).toBeVisible();
}
async function move(page: Page, x: number) {
  await page.evaluate((x) => {
    (window as unknown as { relationCamera: { x: number } }).relationCamera.x =
      x;
  }, x);
}
function observation(
  body: { id: string; epoch: string; frames: { frame: number }[] },
  relations: string[],
  remaining: number,
) {
  return {
    window: {
      id: body.id,
      epoch: body.epoch,
      witnesses: [
        {
          stepId: "place",
          objectIdentity: "same",
          anchorIdentity: "same",
          sceneAlignment: "stable",
          contradictingEvidence: false,
          description: "Distinct parts and stable surface",
        },
      ],
      frames: body.frames.map((f, i) => ({
        frame: f.frame,
        readings: [
          {
            stepId: "place",
            relation: relations[i],
            visibility: "clear",
            objectBox: { left: 0.5, top: 0.3, right: 0.65, bottom: 0.65 },
            anchorBox: { left: 0.4, top: 0.6, right: 0.85, bottom: 0.8 },
            description: "Observed physical relationship",
          },
        ],
      })),
    },
    remainingModelRequests: remaining,
  };
}
test("automatically checks a wrong result, pulses correction, observes recovery and verifies the corrected result", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/teach/guide/relations/perceive", async (r) => {
    const body = r.request().postDataJSON();
    calls++;
    await r.fulfill({
      json: observation(
        body,
        calls === 1
          ? ["separate", "touching", "touching"]
          : calls === 2
            ? ["touching", "separate", "separate"]
            : ["separate", "supported_by", "supported_by"],
        10 - calls,
      ),
    });
  });
  await setup(page);
  await move(page, 110);
  await expect(
    page.getByText("Correction needed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("svg .practice-correction-pulse")).toBeVisible();
  await move(page, 30);
  await expect(
    page.getByText(
      "Starting relationship restored. Follow the current instruction.",
    ),
  ).toBeVisible();
  await move(page, 170);
  await expect(
    page.getByRole("strong").filter({ hasText: "Goal reached" }),
  ).toBeVisible();
  expect(calls).toBe(3);
  await page.getByRole("button", { name: "Stop camera" }).click();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { relationCamera: { streams: MediaStream[] } }
      ).relationCamera.streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});
test("keeps automatic evidence capture alive during a delayed AI response", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const requests: { id: string; epoch: string; frames: { frame: number }[] }[] =
    [];
  await page.route("**/api/teach/guide/relations/perceive", async (r) => {
    const body = r.request().postDataJSON();
    requests.push(body);
    if (requests.length === 1) await gate;
    await r.fulfill({
      json: observation(
        body,
        ["separate", "supported_by", "supported_by"],
        10 - requests.length,
      ),
    });
  });
  await setup(page);
  await move(page, 100);
  await expect.poll(() => requests.length).toBe(1);
  await move(page, 180);
  await expect(page.getByText(/1 captured action waiting/)).toBeVisible();
  await expect(
    page.getByRole("strong").filter({ hasText: "Goal reached" }),
  ).toHaveCount(0);
  release();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].frames[0].frame).toBeGreaterThanOrEqual(
    requests[0].frames[2].frame,
  );
  await expect(
    page.getByRole("strong").filter({ hasText: "Goal reached" }),
  ).toBeVisible();
});
