/** Explicit live acceptance test. Real models, test-only review, recorded camera; never normal tests. */
import { chromium } from "@playwright/test";
import nextEnv from "@next/env";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GuideSchema, type Guide } from "../src/guide/schema";
nextEnv.loadEnvConfig(process.cwd());
declare global {
  interface Window {
    qaReplay?: {
      video: HTMLVideoElement;
      stopAt: number;
      streams: MediaStream[];
      canvas: HTMLCanvasElement;
    };
    qaReplayStart?: number;
    qaStoreAnalysis?: (text: string) => Promise<void>;
    qaAnalysis?: string;
    qaAnalysisDone?: boolean;
    qaCaptureError?: string;
    stepLintProbe?: () => {
      view: string;
      states: Record<string, string>;
      events: { kind: string; stepId: string | null }[] | undefined;
      latencies: unknown[];
      objects: { objectId: string; quality: string }[];
      remaining: number;
    };
  }
}
const args = process.argv.slice(2),
  arg = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
const preflight = args.includes("--preflight");
if (!args.includes("--approved-live") && !preflight)
  throw Error(
    "This command makes paid requests. Explicit --approved-live is required.",
  );
const trial = Number(arg("--trial")),
  base = arg("--base") || "http://127.0.0.1:3001",
  file = arg("--video") || ".media-lab/steplint.mp4",
  expectedHash = arg("--sha256");
if (!Number.isInteger(trial) || trial < 1 || trial > 5 || !expectedHash)
  throw Error(
    "Provide --trial 1..5, --video and --sha256 for the consented clip.",
  );
if (!process.env.MODEL_API_KEY || !process.env.TEACH_ACCESS_TOKEN)
  throw Error("Server credentials must be configured before this smoke test.");
const ownerToken = process.env.TEACH_ACCESS_TOKEN;
if (!ownerToken) throw Error("Creator access is not configured.");
const bytes = await readFile(file);
if (
  bytes.length > 2800000 ||
  createHash("sha256").update(bytes).digest("hex") !== expectedHash
)
  throw Error("The video does not match the approved bounded input.");
const health = await fetch(`${base}/api/health`);
if (!health.ok) throw Error("The test application is not healthy.");
if (preflight) {
  console.log(
    "Preflight passed: input hash, media size, configuration and application health. No paid request or trial consumed.",
  );
  process.exit(0);
}
const batch = arg("--batch") ?? "repair-live";
if (
  ![
    "repair-live",
    "repair-round2",
    "repair-round3",
    "repair-round4",
    "repair-followup",
  ].includes(batch)
)
  throw Error("Unknown approved trial batch.");
const ledgerPath = `.media-lab/${batch}/ledger.json`,
  ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as {
    cap: number;
    attempts: {
      trial: number;
      status: string;
      started: string;
      finished?: string;
      error?: string;
    }[];
  };
if (
  ledger.attempts.length >= ledger.cap ||
  ledger.attempts.some((a) => a.trial === trial)
)
  throw Error(
    "Trial cap reached or this trial was already attempted. No retry.",
  );
const attempt = {
  trial,
  status: "running",
  started: new Date().toISOString(),
  finished: undefined as string | undefined,
  error: undefined as string | undefined,
};
ledger.attempts.push(attempt);
await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 });
const folder = `.media-lab/${batch}/trial-${trial}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
const counts: Record<string, number> = {};
const errors: string[] = [];
const savedPerceptions: unknown[] = [];
const started = Date.now();
await context.addInitScript(
  ({ url }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (url.includes("/api/teach/guide/analyse"))
        void response
          .clone()
          .text()
          .then(async (text) => {
            await window.qaStoreAnalysis?.(text);
            window.qaAnalysis = (window.qaAnalysis ?? "") + text + "\n";
            if (
              !response.ok ||
              text.split("\n").some((line) => {
                try {
                  const event = JSON.parse(line);
                  return event.type === "draft" || event.type === "error";
                } catch {
                  return false;
                }
              })
            )
              window.qaAnalysisDone = true;
          })
          .catch((e) => {
            window.qaCaptureError = String(e);
          });
      return response;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () =>
          reject(Error("Recorded camera source failed to load"));
      });
      video.currentTime = window.qaReplayStart ?? 0.1;
      await new Promise<void>((resolve) => (video.onseeked = () => resolve()));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      const state = {
        video,
        stopAt: Infinity,
        streams: [] as MediaStream[],
        canvas,
      };
      window.qaReplay = state;
      const draw = () => {
        if (video.currentTime >= state.stopAt) video.pause();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      draw();
      const stream = canvas.captureStream(15);
      state.streams.push(stream);
      return stream;
    };
  },
  { url: `data:video/mp4;base64,${bytes.toString("base64")}` },
);
const page = await context.newPage();
await page.exposeFunction("qaStoreAnalysis", async (text: string) => {
  await appendFile(`${folder}/analysis.partial.ndjson`, text + "\n", {
    mode: 0o600,
  });
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        frames?: { frame: number; timestampMs: number }[];
      };
      if (event.type === "source")
        console.log(
          `Trial ${trial}: exact source moments ${JSON.stringify(event.frames)}. Same upload retained for grounding.`,
        );
    } catch {
      /* retain the raw bounded response for diagnostics; parser owns validation */
    }
  }
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  const path = new URL(r.url()).pathname;
  if (r.method() === "POST" && path.startsWith("/api/teach/guide/"))
    counts[path] = (counts[path] ?? 0) + 1;
});
page.on("response", async (r) => {
  if (new URL(r.url()).pathname.endsWith("/perceive")) {
    try {
      savedPerceptions.push({
        at: Date.now(),
        status: r.status(),
        data: await r.json(),
      });
    } catch {
      savedPerceptions.push({
        at: Date.now(),
        status: r.status(),
        invalidBody: true,
      });
    }
  }
});
async function saveState(name: string) {
  await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
  await writeFile(
    `${folder}/${name}.json`,
    JSON.stringify(
      {
        url: page.url(),
        probe: await page.evaluate(() => window.stepLintProbe?.() ?? null),
        perceptions: savedPerceptions,
        counts,
        pageErrors: errors,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
async function runCamera(guide: Guide, actor: "creator" | "learner") {
  const url = new URL(page.url());
  url.searchParams.set("debug", "1");
  await page.goto(url.href);
  await page.evaluate(
    (time) => {
      window.qaReplayStart = time;
    },
    guide.steps[0].evidence.startMs / 1000 + 0.001,
  );
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page
    .getByRole("button", { name: "Ready — start practice" })
    .waitFor({ timeout: 75000 });
  await saveState(`${actor}-ready`);
  if (actor === "creator")
    await page.getByRole("button", { name: "Ready — start practice" }).click();
  for (let i = 0; i < guide.steps.length; i++) {
    const step = guide.steps[i];
    await page.evaluate(
      async ({ until }) => {
        const replay = window.qaReplay;
        if (!replay) throw Error("Camera replay is missing");
        replay.stopAt = until;
        await replay.video.play();
      },
      {
        until: Math.min(
          guide.source.durationMs / 1000 - 0.02,
          (step.evidence.endMs + 150) / 1000,
        ),
      },
    );
    const deadline = Date.now() + 45000;
    for (;;) {
      const probe = await page.evaluate(() => window.stepLintProbe?.());
      if (probe?.states[step.id] === "verified") break;
      if (probe?.states[step.id] === "violation")
        throw Error(
          `${actor}: actual rule violation while replaying the demonstration: ${step.instruction}`,
        );
      if (Date.now() > deadline) {
        await saveState(`${actor}-step-${i + 1}-blocked`);
        throw Error(
          `${actor}: ${step.instruction} did not verify within its observed replay interval.`,
        );
      }
      await page.waitForTimeout(250);
    }
    await saveState(`${actor}-step-${i + 1}`);
  }
  await page
    .getByText("Goal reached", { exact: true })
    .waitFor({ timeout: 15000 });
  await saveState(`${actor}-complete`);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  const ended = await page.evaluate(() =>
    window.qaReplay?.streams.every((s) =>
      s.getTracks().every((t) => t.readyState === "ended"),
    ),
  );
  if (!ended) throw Error("Camera tracks did not stop.");
}
try {
  await page.goto(`${base}/teach?qa=1`);
  const unlock = page.getByRole("button", {
    name: "Unlock Teach",
    exact: true,
  });
  if (await unlock.isVisible()) {
    await page.getByLabel("Access code").fill(ownerToken);
    await unlock.click();
  }
  await page.getByLabel("Everyone visible or audible").check();
  await page.getByLabel("Existing lesson MP4").setInputFiles(file);
  await page
    .getByRole("heading", { name: "Preview your lesson" })
    .waitFor({ timeout: 30000 });
  const intent = arg("--intent");
  if (intent) {
    if (intent.length > 400)
      throw Error("The acceptance goal exceeds its bound.");
    await page.getByLabel("Guide goal (optional)").fill(intent);
  }
  await page.getByLabel("I previewed this lesson").check();
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/teach/guide/analyse",
    { timeout: 600000 },
  );
  await page
    .getByRole("button", { name: "Build my guide", exact: true })
    .click();
  console.log(
    `Trial ${trial}: real Teach analysis started. No automatic retries.`,
  );
  const wire = await response;
  await page.waitForFunction(
    () =>
      window.qaAnalysisDone === true ||
      window.qaCaptureError !== undefined ||
      !!document
        .querySelector('[role="dialog"][aria-labelledby]')
        ?.textContent?.includes("Could not finish this action"),
    null,
    { timeout: 600000 },
  );
  const capture = await page.evaluate(() => ({
    text: window.qaAnalysis,
    error:
      window.qaCaptureError ??
      (!window.qaAnalysisDone
        ? (document.querySelector('[role="dialog"]')?.textContent ?? undefined)
        : undefined),
  }));
  if (capture.error || !capture.text)
    throw Error(capture.error ?? "No analysis body captured");
  const text = capture.text;
  if (!wire.ok())
    throw Error(
      `Analysis failed (HTTP ${wire.status()}): ${JSON.parse(text).error ?? "invalid response"}`,
    );
  await writeFile(`${folder}/analysis.ndjson`, text, { mode: 0o600 });
  const messages = text
    .split("\n")
    .filter((l) => l.trim())
    .map(
      (l) =>
        JSON.parse(l) as {
          type: string;
          guide?: unknown;
          message?: string;
          diagnostic?: unknown;
          uploadDeleted?: boolean;
        },
    );
  const failed = messages.find((m) => m.type === "error");
  if (failed)
    throw Error(
      `${failed.message ?? "Analysis failed"}${failed.diagnostic ? ` Diagnostic: ${JSON.stringify(failed.diagnostic)}` : ""}`,
    );
  const event = messages.find((m) => m.type === "draft");
  if (!event?.guide) throw Error("No validated draft was returned");
  const guide = GuideSchema.parse(event.guide);
  await writeFile(
    `${folder}/source-guide.json`,
    JSON.stringify(guide, null, 2),
    { mode: 0o600 },
  );
  await page
    .getByRole("heading", { name: guide.title, exact: true })
    .waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${folder}/teach-review.png`, fullPage: true });
  for (let i = 0; i < guide.steps.length; i++)
    await page
      .locator("article")
      .nth(i)
      .screenshot({ path: `${folder}/source-step-${i + 1}.png` });
  if (
    guide.steps.length < 1 ||
    guide.steps.some((s) => !s.supported) ||
    !guide.goalSupported ||
    guide.coverage.some((c) => c.status === "unresolved")
  )
    throw Error(
      "The source guide is incomplete or has unsupported tracking; approval was not attempted.",
    );
  console.log(
    `Trial ${trial}: draft ready (${guide.steps.length} steps). Waiting for independent visual inspection; write ${folder}/review-decision.json with {"continue":true} to continue the TEST actor, never owner approval.`,
  );
  const until = Date.now() + 30 * 60 * 1000;
  let decision: { continue: boolean } | null = null;
  while (Date.now() < until) {
    try {
      decision = JSON.parse(
        await readFile(`${folder}/review-decision.json`, "utf8"),
      );
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!decision?.continue)
    throw Error(
      "Independent visual inspection did not authorize the test actor to continue.",
    );
  await page.getByText("Edit guide wording", { exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill(`QA ONLY — ${guide.title}`);
  await page.getByLabel("I checked the starting view").check();
  for (const box of await page.getByLabel("I checked this instruction").all())
    await box.check();
  await page
    .getByLabel("Your reviewer name")
    .fill("AUTOMATED ACCEPTANCE TEST — NOT OWNER APPROVAL");
  await page
    .getByRole("button", { name: "Test my guide", exact: true })
    .click();
  await page.getByText("Private creator rehearsal", { exact: true }).waitFor();
  await runCamera(guide, "creator");
  await page
    .getByRole("link", { name: "Return to review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve and save", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Approve and save", exact: true })
    .click();
  await page.getByText("Guide saved", { exact: true }).waitFor();
  await saveState("published-test-artifact");
  await context.clearCookies();
  await page.goto(`${base}/practice`);
  await page.getByRole("button", { name: /QA ONLY/ }).click();
  await runCamera(guide, "learner");
  if (errors.length)
    throw Error(`Browser exceptions occurred: ${errors.join("; ")}`);
  if (
    counts["/api/teach/guide/analyse"] !== 2 ||
    counts["/api/teach/guide/perceive"] > 6
  )
    throw Error("The bounded request contract was exceeded.");
  await writeFile(
    `${folder}/result.json`,
    JSON.stringify(
      {
        passed: true,
        trial,
        totalMs: Date.now() - started,
        counts,
        perceptions: savedPerceptions,
        scope:
          "Real models and real HTTP approval/session contracts; automated TEST review, recorded camera replay with pauses, not owner approval or physical-camera accuracy",
        uploadDeleted: event.uploadDeleted,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  attempt.status = "passed";
  console.log(
    `Trial ${trial} full workflow PASSED (test-only review and recorded-camera replay).`,
  );
} catch (e) {
  attempt.status = "failed";
  attempt.error = e instanceof Error ? e.message : "Unknown failure";
  await saveState("failure").catch(() => {});
  console.error(attempt.error);
  process.exitCode = 1;
} finally {
  attempt.finished = new Date().toISOString();
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 });
  await browser.close();
}
