import { approvedFixture } from "./approved-fixture";
import { test, expect } from "./safe-test";
test("voice controls release the recognizer, cancel stale confirmations and do not restart after permission denial", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const sessions: {
      onresult: ((e: unknown) => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      onend: (() => void) | null;
      starts: number;
      aborts: number;
    }[] = [];
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((e: unknown) => void) | null = null;
      onstart: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      starts = 0;
      aborts = 0;
      constructor() {
        sessions.push(this);
      }
      start() {
        this.starts++;
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.aborts++;
        this.onend?.();
      }
    }
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      qaRecognition: sessions,
    });
    window.speechSynthesis.speak = () => {};
    window.speechSynthesis.cancel = () => {};
  });
  await page.addInitScript(
    (raw) => sessionStorage.setItem("steplint-approved-handoff", raw),
    JSON.stringify(approvedFixture().artifact),
  );
  await page.goto("/practice");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { qaRecognition: unknown[] }).qaRecognition
            .length,
      ),
    )
    .toBe(1);
  await page.getByLabel("Enable microphone voice controls").check();
  const utter = async (text: string) =>
    page.evaluate((text) => {
      const sessions = (
        window as unknown as {
          qaRecognition: { onresult: ((e: unknown) => void) | null }[];
        }
      ).qaRecognition;
      sessions.at(-1)!.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: text } }],
      });
    }, text);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { qaRecognition: unknown[] }).qaRecognition
            .length,
      ),
    )
    .toBe(1);
  await page.evaluate(() =>
    Object.defineProperty(window.speechSynthesis, "speaking", {
      configurable: true,
      get: () => true,
    }),
  );
  await page.evaluate(() => {
    const synth = window.speechSynthesis;
    const original = synth.cancel.bind(synth);
    (window as unknown as { qaCancels: number }).qaCancels = 0;
    synth.cancel = () => {
      (window as unknown as { qaCancels: number }).qaCancels++;
      original();
    };
  });
  // Half-duplex (Phase 4, owner decision): a valid command is not dropped
  // while guidance speaks. It interrupts our speech, then runs through the
  // lifecycle, which reports the real outcome (this fixture needs manual setup).
  await utter("Muse, start practice");
  await expect(page.getByTestId("voice-command-feedback")).toContainText(
    "manual calibration",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { qaCancels: number }).qaCancels,
    ),
  ).toBeGreaterThan(0);
  await page.evaluate(() =>
    Object.defineProperty(window.speechSynthesis, "speaking", {
      configurable: true,
      get: () => false,
    }),
  );
  await utter("Muse, pause");
  // A failed lifecycle operation is reported as failed, never as success.
  await expect(page.getByTestId("voice-command-feedback")).toContainText(
    "Practice is not running",
  );
  await expect(page.getByTestId("voice-transcript")).toContainText(
    "Muse, pause",
  );
  await expect(page.getByTestId("voice-transcript")).toContainText(
    "Practice is not running",
  );
  await utter("Guide, restart practice");
  await expect(page.getByTestId("voice-command-feedback")).toContainText(
    "Confirmation required",
  );
  await utter("Muse, pause");
  await expect(page.getByTestId("voice-command-feedback")).not.toContainText(
    "Confirmation required",
  );
  await page.getByLabel("Enable microphone voice controls").uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { qaRecognition: { aborts: number }[] })
            .qaRecognition[0].aborts,
      ),
    )
    .toBe(1);
  await page.getByLabel("Enable microphone voice controls").check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { qaRecognition: unknown[] }).qaRecognition
            .length,
      ),
    )
    .toBe(2);
  const counts = await page.evaluate(() => {
    const rec = (
      window as unknown as {
        qaRecognition: {
          onerror: ((e: { error: string }) => void) | null;
          onend: (() => void) | null;
          starts: number;
          aborts: number;
        }[];
      }
    ).qaRecognition.at(-1)!;
    rec.onerror?.({ error: "not-allowed" });
    rec.onend?.();
    return { starts: rec.starts, aborts: rec.aborts };
  });
  expect(counts).toEqual({ starts: 1, aborts: 1 });
  await expect(page.getByTestId("voice-command-feedback")).toContainText(
    "Microphone permission is blocked",
  );
});

test("Teach recorder buttons drive recording, pause, resume and stop", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.assign(window, { captureStreams: streams });
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#987";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#111";
        ctx.fillRect(Date.now() % 400, 40, 80, 100);
        requestAnimationFrame(draw);
      };
      draw();
      const stream = canvas.captureStream(15);
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      streams.push(stream);
      return stream;
    };
  });
  await page.route("**/api/teach/access", (r) =>
    r.fulfill({ json: { unlocked: true } }),
  );
  await page.goto("/teach");
  await page.getByRole("button", { name: "Create new teach" }).click();
  await page.getByLabel(/Everyone visible or audible/).check();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Preview camera", exact: true })
    .click();
  await expect(page.getByText(/Camera preview — not recording/)).toBeVisible();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.getByText(/● REC — camera/)).toBeVisible();
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await expect(page.getByText(/❚❚ Paused/)).toBeVisible();
  await page
    .getByRole("button", { name: "Resume recording", exact: true })
    .click();
  await expect(page.getByText(/● REC — camera/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { captureStreams: MediaStream[] }
        ).captureStreams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByText(/● REC — camera/)).toHaveCount(0);
  await expect(page.getByLabel("Prepared lesson preview")).toBeVisible();
  // Check the actual browser-encoded MP4 and extracted WAV sent by Teach,
  // stopping at the mocked upload boundary before any model request.
  let mediaChecked = false;
  await page.route("**/api/teach/lesson", async (route) => {
    const bytes = route.request().postDataBuffer();
    if (!bytes) throw Error("Teach upload had no body");
    const form = await new Request("http://localhost/upload", {
      method: "POST",
      headers: { "Content-Type": route.request().headers()["content-type"] },
      body: new Uint8Array(bytes),
    }).formData();
    const video = form.get("video"),
      audio = form.get("audio");
    if (!(video instanceof File) || !(audio instanceof File))
      throw Error("Missing encoded media");
    const { inspectLessonVideo, validateLessonAudio } = await import(
      "../src/teach/media"
    );
    const info = await inspectLessonVideo(video);
    const wav = validateLessonAudio(
      new Uint8Array(await audio.arrayBuffer()),
      info,
    );
    expect(info.info.video?.codec).toBe("avc");
    expect(info.info.video?.width).toBe(640);
    expect(info.info.video?.height).toBe(480);
    expect(wav).toMatchObject({
      channels: 1,
      sampleRate: 16000,
      bitsPerSample: 16,
    });
    expect(bytes.length).toBeLessThan(4_000_000);
    mediaChecked = true;
    await route.fulfill({
      status: 422,
      json: { error: "Offline media checked; no provider called." },
    });
  });
  await page.getByLabel(/I reviewed this recording/).check();
  await page
    .getByRole("button", { name: "Build my lesson", exact: true })
    .click();
  await expect.poll(() => mediaChecked).toBe(true);
});
