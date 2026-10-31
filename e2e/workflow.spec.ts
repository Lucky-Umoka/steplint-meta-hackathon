import { test, expect, type Page } from "@playwright/test";
import type { GuideArtifact } from "../src/guide/schema";
declare global {
  interface Window {
    qaScene?: {
      x: number;
      hidden: boolean;
      started: number;
      streams: MediaStream[];
    };
  }
}
const clip = "tests/fixtures/teach-preview.mp4";
async function seed(
  page: Page,
  purpose: "published" | "rehearsal" = "published",
  twoSteps = false,
) {
  return page.evaluate(
    async ({ purpose, twoSteps }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#555";
      ctx.fillRect(0, 0, 320, 240);
      const image = canvas.toDataURL("image/jpeg");
      const guide: GuideArtifact["guide"] = {
        schemaVersion: 2,
        id: "ab86b72d-935c-4bbf-8363-71553ed1893a",
        revision: 1,
        parentRevision: null,
        methodId: "one",
        methodName: "Demonstrated method",
        title: "QA neutral package movement",
        goal: "Package moved aside",
        initialInstruction: "Show the package on your work surface.",
        objects: [
          {
            id: "package",
            label: "Package",
            description: "Textured neutral package",
            initiallyVisible: true,
            sourceFrame: 0,
            sourceBox: { left: 0.15, top: 0.3, right: 0.4, bottom: 0.65 },
            appearance: image,
          },
        ],
        steps: [
          {
            id: "move",
            instruction: "Move the package aside",
            explanation: "Demonstrated movement",
            correction: "Return the package and try again.",
            prerequisites: [],
            condition: {
              kind: "movement",
              objectId: "package",
              anchorId: null,
              minimumChange: 0.6,
              requiredVisibleAfter: ["package"],
            },
            evidence: {
              startFrame: 0,
              changeFrame: 5,
              endFrame: 10,
              startMs: 0,
              endMs: 1000,
              turnIds: [0],
            },
            uncertainties: [],
            supported: true,
          },
        ],
        coverage: [
          {
            instruction: "Move the package",
            status: "included",
            reason: "Demonstrated",
          },
        ],
        goalFrame: 10,
        goalStepIds: ["move"],
        goalSupported: true,
        source: {
          durationMs: 1100,
          width: 320,
          height: 240,
          frameTimesMs: Array.from({ length: 11 }, (_, i) => i * 100),
          transcript: {
            text: "Move the package",
            durationMs: 1100,
            turns: [{ startMs: 0, endMs: 1000, text: "Move the package" }],
          },
        },
        images: [0, 3, 5, 7, 10].map((frame) => ({ frame, image })),
        geometry: [],
        approval: {
          reviewer: "MOCK BROWSER TEST ONLY",
          at: 1,
          purpose,
          testOnly: true,
          contentHash: "0".repeat(64),
        },
      };
      if (twoSteps) {
        guide.steps[0].condition.minimumChange = 0.25;
        guide.steps[0].evidence = {
          ...guide.steps[0].evidence,
          changeFrame: 3,
          endFrame: 5,
          endMs: 500,
        };
        const second = structuredClone(guide.steps[0]);
        second.id = "move-again";
        second.instruction = "Move the package farther";
        second.prerequisites = ["move"];
        second.evidence = {
          ...second.evidence,
          startFrame: 5,
          changeFrame: 7,
          endFrame: 10,
          startMs: 500,
          endMs: 1000,
        };
        guide.steps.push(second);
        guide.goalStepIds = ["move", "move-again"];
      }
      const artifact = {
        guide,
        receipt: "mock-receipt-never-sent-to-real-provider",
      };
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("steplint-guides", 2);
        request.onupgradeneeded = () => {
          for (const name of ["guides", "drafts"])
            if (!request.result.objectStoreNames.contains(name)) {
              if (name === "guides")
                request.result.createObjectStore(name, { keyPath: "key" });
              else request.result.createObjectStore(name);
            }
        };
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("guides", "readwrite");
          tx.objectStore("guides").put({
            key: `${guide.id}:${guide.revision}:${guide.methodId}:${purpose}`,
            artifact,
            savedAt: 1,
            rehearsal: null,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
      return artifact;
    },
    { purpose, twoSteps },
  ) as Promise<GuideArtifact>;
}
async function camera(page: Page, backgroundTexture = true) {
  await page.addInitScript(
    ({ backgroundTexture }) => {
      const state = {
        x: 48,
        hidden: false,
        started: 0,
        streams: [] as MediaStream[],
      };
      window.qaScene = state;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d")!;
      function draw() {
        const image = ctx.createImageData(320, 240);
        for (let y = 0; y < 240; y++)
          for (let x = 0; x < 320; x++) {
            const p = (y * 320 + x) * 4;
            let backgroundHash =
              Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
            backgroundHash ^= backgroundHash >>> 16;
            let value = backgroundTexture
              ? 55 + ((backgroundHash >>> 0) % 100)
              : 70;
            const xx = x - state.x;
            if (!state.hidden && xx >= 0 && xx < 80 && y >= 72 && y < 156) {
              let hash = Math.imul(xx, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
              hash ^= hash >>> 16;
              value = ((hash >>> 0) % 190) + 50;
            }
            image.data[p] = value;
            image.data[p + 1] = value;
            image.data[p + 2] = value;
            image.data[p + 3] = 255;
          }
        ctx.putImageData(image, 0, 0);
        requestAnimationFrame(draw);
      }
      draw();
      navigator.mediaDevices.getUserMedia = async () => {
        state.started++;
        const s = canvas.captureStream(10);
        state.streams.push(s);
        return s;
      };
    },
    { backgroundTexture },
  );
}
async function mocks(page: Page) {
  await page.route("**/api/teach/guide/session", (r) =>
    r.fulfill({
      json: { token: "mock-camera-session", maximumModelRequests: 6 },
    }),
  );
  await page.route("**/api/teach/guide/perceive", (r) =>
    r.fulfill({
      json: {
        phase: "starting",
        objects: [
          {
            objectId: "package",
            quality: "observed",
            box: { left: 0.15, top: 0.3, right: 0.4, bottom: 0.65 },
            score: 0.99,
          },
        ],
        foregrounds: [
          {
            objectId: "package",
            foreground: {
              width: 80,
              height: 84,
              bounds: { left: 0.15, top: 0.3, right: 0.4, bottom: 0.65 },
              bits: Buffer.alloc(840, 255).toString("base64"),
            },
          },
        ],
        remainingModelRequests: 4,
      },
    }),
  );
}
test("empty library has one useful next action and no fixture or premature warning", async ({
  page,
}) => {
  await page.goto("/practice");
  await expect(
    page.getByRole("heading", { name: "Your first guide starts in Teach" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Cannot Verify|Warning latency|hand-authored|yellow support|calibration/,
    ),
  ).toHaveCount(0);
});
test("local guide selection, automatic grounding and Ready require no marking controls", async ({
  page,
}) => {
  await camera(page);
  await mocks(page);
  await page.goto("/practice");
  await seed(page);
  await page.reload();
  await page
    .getByRole("button", { name: /QA neutral package movement/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Start camera", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Cannot Verify|Warning latency|Click to mark|Mark component/,
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ready — start practice" }),
  ).toBeVisible({ timeout: 20000 });
  const readyBounds = await page
    .getByRole("button", { name: "Ready — start practice" })
    .boundingBox();
  expect(readyBounds!.y + readyBounds!.height).toBeLessThanOrEqual(832);
  await page.screenshot({
    path: ".media-lab/repair-live/final-practice-ready.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ready — start practice" }).click();
  await expect(page.getByText("Step 1 of 1", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    if (!window.qaScene) throw Error("Mock camera missing");
    window.qaScene.x = 52;
  });
  for (let x = 56; x <= 172; x += 4) {
    await page.evaluate((x) => {
      if (!window.qaScene) throw Error("Mock camera missing");
      window.qaScene.x = x;
    }, x);
    await page.waitForTimeout(140);
  }
  await expect(page.getByText("Goal reached", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.screenshot({
    path: ".media-lab/repair-live/final-practice-complete.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.qaScene!.streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});
test("camera denial is setup guidance rather than a false procedural failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/practice");
  await seed(page);
  await page.reload();
  await page
    .getByRole("button", { name: /QA neutral package movement/ })
    .click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByText(/Camera access was not allowed/)).toBeVisible();
  await expect(page.getByText("Goal reached", { exact: true })).toHaveCount(0);
});
test("face/empty scene stays in setup and does not invent scoring", async ({
  page,
}) => {
  await camera(page);
  let calls = 0;
  await page.route("**/api/teach/guide/session", (r) =>
    r.fulfill({
      json: { token: "mock-camera-session", maximumModelRequests: 6 },
    }),
  );
  await page.route("**/api/teach/guide/perceive", (r) => {
    calls++;
    return r.fulfill({
      json: {
        phase: "no_work_area",
        objects: [
          { objectId: "package", quality: "missing", box: null, score: null },
        ],
        foregrounds: [],
        remainingModelRequests: 5,
      },
    });
  });
  await page.goto("/practice");
  await seed(page);
  await page.reload();
  await page
    .getByRole("button", { name: /QA neutral package movement/ })
    .click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByText(
      "Point the camera at your work area and put the starting items in view.",
    ),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(6500);
  expect(calls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Ready — start practice" }),
  ).toHaveCount(0);
  await expect(page.getByText("Goal reached", { exact: true })).toHaveCount(0);
});
test("Teach previews a local fixture clip and presents clear review without paid requests", async ({
  page,
}) => {
  let paid = 0;
  await page.route("**/api/teach/access", (r) =>
    r.fulfill({ json: { unlocked: true } }),
  );
  await page.route("**/api/teach/guide/analyse", () => {
    paid++;
    throw Error("Paid route forbidden in this test");
  });
  await page.goto("/teach");
  await page.getByLabel("Everyone visible or audible").check();
  await page.getByLabel("Existing lesson MP4").setInputFiles(clip);
  await expect(
    page.getByRole("heading", { name: "Preview your lesson" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Build my guide" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("list", { name: "Create guide progress" }),
  ).toBeVisible();
  expect(paid).toBe(0);
});

for (const fault of ["empty", "gateway", "incomplete"]) {
  test(`Teach preserves reviewed draft after ${fault} approval and never reruns analysis`, async ({
    page,
  }) => {
    await page.route("**/api/teach/access", (r) =>
      r.fulfill({ json: { unlocked: true } }),
    );
    await page.goto("/practice");
    const artifact = await seed(page);
    await page.evaluate(async () => {
      const req = indexedDB.open("steplint-guides", 2);
      await new Promise<void>((resolve) => {
        req.onsuccess = () => {
          const tx = req.result.transaction("guides", "readwrite");
          tx.objectStore("guides").clear();
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      });
    });
    const draft = structuredClone(artifact.guide);
    draft.approval = null;
    draft.images = [];
    draft.objects[0].appearance = null;
    let analyses = 0,
      approvals = 0;
    await page.route("**/api/teach/guide/analyse", (r) => {
      analyses++;
      return r.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            type: "progress",
            stage: "track",
            message: "Mock tracking",
          }) +
          "\n" +
          JSON.stringify({
            type: "draft",
            guide: draft,
            token: "mock-review-token",
            uploadDeleted: true,
          }) +
          "\n",
      });
    });
    await page.route("**/api/teach/guide/approve", async (r) => {
      approvals++;
      if (approvals === 1) {
        if (fault === "empty") return r.fulfill({ status: 200, body: "" });
        if (fault === "gateway")
          return r.fulfill({
            status: 502,
            contentType: "text/html",
            body: "<h1>Gateway</h1>",
          });
        return r.fulfill({ json: { guide: {} } });
      }
      const body = r.request().postDataJSON() as {
        guide: GuideArtifact["guide"];
        purpose: "published" | "rehearsal";
        reviewer: string;
      };
      return r.fulfill({
        json: {
          guide: {
            ...body.guide,
            approval: {
              reviewer: body.reviewer,
              at: 1,
              purpose: body.purpose,
              testOnly: true,
              contentHash: "0".repeat(64),
            },
          },
          receipt: "MOCK APPROVAL ONLY",
        },
      });
    });
    await page.goto("/teach");
    await page.getByLabel("Everyone visible or audible").check();
    await page.getByLabel("Existing lesson MP4").setInputFiles(clip);
    await page.getByLabel("I previewed this lesson").check();
    await page
      .getByRole("button", { name: "Build my guide", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "QA neutral package movement" }),
    ).toBeVisible({ timeout: 20000 });
    await page.getByLabel("I checked the starting view").check();
    await page.getByLabel("I checked this instruction").check();
    await page.getByLabel("Your reviewer name").fill("MOCK REVIEW ACTOR");
    await page
      .getByRole("button", { name: "Approve and save", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Could not finish this action" }),
    ).toContainText(
      fault === "gateway"
        ? "HTTP 502"
        : fault === "empty"
          ? "empty response"
          : "invalid guide",
    );
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve and save", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Approve and save", exact: true })
      .click();
    await expect(page.getByText("Guide saved", { exact: true })).toBeVisible();
    expect(analyses).toBe(1);
    expect(approvals).toBe(2);
    await page
      .getByRole("button", { name: "Open Practice", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "QA neutral package movement" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start camera", exact: true }),
    ).toBeVisible();
  });
}

test("an untrackable work surface cannot enable Ready or score object movement", async ({
  page,
}) => {
  await camera(page, false);
  await mocks(page);
  await page.goto("/practice");
  await seed(page);
  await page.reload();
  await page
    .getByRole("button", { name: "QA neutral package movement" })
    .click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByText(
      "Show the surrounding work surface and hold the camera steady so I can align the scene.",
    ),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Ready — start practice" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    if (window.qaScene) window.qaScene.x = 125;
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-step-status="verified"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
});

test("a private rehearsal preserves active time, explicit breaks and its completion result together", async ({
  page,
}) => {
  await camera(page);
  await mocks(page);
  await page.goto("/practice");
  const artifact = await seed(page, "rehearsal"),
    key = `${artifact.guide.id}:1:one:rehearsal`;
  await page.goto(`/practice?test=${encodeURIComponent(key)}&debug=1`);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.getByRole("button", { name: "Ready — start practice" }).click();
  await expect(page.getByText("Step 1 of 1", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await page.waitForTimeout(1300);
  await page
    .getByRole("button", { name: "Start camera again", exact: true })
    .click();
  await page.getByRole("button", { name: "Ready — start practice" }).click();
  for (let x = 52; x <= 172; x += 4) {
    await page.evaluate((x) => {
      window.qaScene!.x = x;
    }, x);
    await page.waitForTimeout(140);
  }
  await expect(page.getByText("Goal reached", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your session", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const req = indexedDB.open("steplint-guides", 2);
        const rows = await new Promise<
          {
            attempts?: {
              activeMs: number;
              pausedMs: number;
              elapsedMs: number;
              verificationMs: number;
            }[];
            rehearsal?: { passed: boolean };
          }[]
        >((resolve, reject) => {
          req.onsuccess = () => {
            const get = req.result
              .transaction("guides", "readonly")
              .objectStore("guides")
              .getAll();
            get.onsuccess = () => {
              resolve(get.result);
              req.result.close();
            };
            get.onerror = () => reject(get.error);
          };
        });
        const row = rows[0],
          result = row?.attempts?.[0];
        return (
          !!row?.rehearsal?.passed &&
          !!result &&
          result.activeMs > 0 &&
          result.pausedMs >= 1000 &&
          Math.abs(
            result.elapsedMs -
              result.activeMs -
              result.pausedMs -
              result.verificationMs,
          ) < 5
        );
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
});

test("a pre-existing goal scene cannot manufacture action history or enable Ready", async ({
  page,
}) => {
  await camera(page);
  await mocks(page);
  await page.route("**/api/teach/guide/perceive", async (route) => {
    const response = {
      phase: "goal",
      objects: [
        {
          objectId: "package",
          quality: "observed",
          box: { left: 0.15, top: 0.3, right: 0.4, bottom: 0.65 },
          score: 0.99,
        },
      ],
      foregrounds: [
        {
          objectId: "package",
          foreground: {
            width: 80,
            height: 84,
            bounds: { left: 0.15, top: 0.3, right: 0.4, bottom: 0.65 },
            bits: Buffer.alloc(840, 255).toString("base64"),
          },
        },
      ],
      remainingModelRequests: 4,
    };
    await route.fulfill({ json: response });
  });
  await page.goto("/practice");
  await seed(page);
  await page.reload();
  await page
    .getByRole("button", { name: "QA neutral package movement" })
    .click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByText(
      "This looks partly or fully completed. Restore the shown starting view to practice.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ready — start practice" }),
  ).toHaveCount(0);
  await expect(page.locator('[data-step-status="verified"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
});

test("resuming the same workbench preserves verified goal references instead of demanding the earlier action again", async ({
  page,
}) => {
  await camera(page);
  await mocks(page);
  await page.route("**/api/teach/guide/perceive", async (route) => {
    const x = await page.evaluate(() => window.qaScene!.x),
      bounds = { left: x / 320, top: 0.3, right: (x + 80) / 320, bottom: 0.65 };
    await route.fulfill({
      json: {
        phase: "starting",
        objects: [
          {
            objectId: "package",
            quality: "observed",
            box: bounds,
            score: 0.99,
          },
        ],
        foregrounds: [
          {
            objectId: "package",
            foreground: {
              width: 80,
              height: 84,
              bounds,
              bits: Buffer.alloc(840, 255).toString("base64"),
            },
          },
        ],
        remainingModelRequests: 4,
      },
    });
  });
  await page.goto("/practice");
  await seed(page, "published", true);
  await page.reload();
  await page
    .getByRole("button", { name: "QA neutral package movement" })
    .click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.getByRole("button", { name: "Ready — start practice" }).click();
  for (let x = 52; x <= 96; x += 4) {
    await page.evaluate((x) => {
      window.qaScene!.x = x;
    }, x);
    await page.waitForTimeout(140);
  }
  await expect(page.locator('[data-step-status="verified"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await page.waitForTimeout(1000);
  await page
    .getByRole("button", { name: "Start camera again", exact: true })
    .click();
  await page.getByRole("button", { name: "Ready — start practice" }).click();
  for (let x = 100; x <= 160; x += 4) {
    await page.evaluate((x) => {
      window.qaScene!.x = x;
    }, x);
    await page.waitForTimeout(140);
  }
  await expect(page.getByText("Goal reached", { exact: true })).toBeVisible();
  await expect(page.locator('[data-step-status="verified"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await expect(page.getByText("Goal reached", { exact: true })).toBeVisible();
});

test("a new step with a continuously tracked part does not spend another remote check", async ({
  page,
}) => {
  await camera(page);
  await mocks(page);
  let calls = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/teach/guide/perceive")
      calls++;
  });
  await page.goto("/practice");
  await seed(page, "published", true);
  await page.reload();
  await page
    .getByRole("button", { name: "QA neutral package movement" })
    .click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.getByRole("button", { name: "Ready — start practice" }).click();
  for (let x = 52; x <= 96; x += 4) {
    await page.evaluate((x) => {
      window.qaScene!.x = x;
    }, x);
    await page.waitForTimeout(140);
  }
  await expect(page.locator('[data-step-status="verified"]')).toHaveCount(1);
  await page.waitForTimeout(6500);
  expect(calls).toBe(1);
  for (let x = 100; x <= 160; x += 4) {
    await page.evaluate((x) => {
      window.qaScene!.x = x;
    }, x);
    await page.waitForTimeout(140);
  }
  await expect(page.getByText("Goal reached", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
});

test("Teach automatically extracts requested action frames and reuses one upload across stages", async ({
  page,
}) => {
  await page.route("**/api/teach/access", (r) =>
    r.fulfill({ json: { unlocked: true } }),
  );
  await page.goto("/practice");
  const artifact = await seed(page);
  const draft = { ...artifact.guide, approval: null, images: [] };
  let calls = 0;
  await page.route("**/api/teach/guide/analyse", async (route) => {
    calls++;
    const req = route.request(),
      form = await new Request("http://fixture", {
        method: "POST",
        headers: { "Content-Type": req.headers()["content-type"] },
        body: new Uint8Array(req.postDataBuffer()!),
      }).formData();
    if (calls === 1) {
      expect(form.get("video")).toBeInstanceOf(File);
      expect(form.get("prepare")).toBe("true");
      expect(form.get("frames")).toBeNull();
      await route.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            type: "source",
            token: "mock-encrypted-source",
            frames: [
              { frame: 73, timestampMs: 4867 },
              { frame: 170, timestampMs: 11333 },
            ],
          }) + "\n",
      });
    } else {
      expect(form.get("video")).toBeNull();
      expect(form.get("audio")).toBeNull();
      expect(form.get("source")).toBe("mock-encrypted-source");
      const frames = JSON.parse(String(form.get("frames"))) as {
        frame: number;
        image: string;
      }[];
      expect(frames.map((f) => f.frame)).toEqual([73, 170]);
      expect(
        frames.every((f) => f.image.startsWith("data:image/jpeg;base64,")),
      ).toBe(true);
      await route.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            type: "draft",
            guide: draft,
            token: "mock-review-token",
            uploadDeleted: true,
          }) + "\n",
      });
    }
  });
  await page.goto("/teach");
  await page.getByLabel("Everyone visible or audible").check();
  await page.getByLabel("Existing lesson MP4").setInputFiles(clip);
  await page.getByLabel("I previewed this lesson").check();
  await page
    .getByRole("button", { name: "Build my guide", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "QA neutral package movement" }),
  ).toBeVisible({ timeout: 30000 });
  expect(calls).toBe(2);
});
