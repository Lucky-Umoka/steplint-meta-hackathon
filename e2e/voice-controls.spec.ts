import { test, expect } from "@playwright/test";
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
  await page.route("**/api/teach/access", (r) =>
    r.fulfill({ json: { unlocked: true } }),
  );
  await page.goto("/teach");
  await page.getByLabel("Enable voice control", { exact: true }).check();
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
  await utter("Guide, start recording");
  await expect(page.getByTestId("voice-command-feedback")).toContainText(
    "while guidance was speaking",
  );
  await page.evaluate(() =>
    Object.defineProperty(window.speechSynthesis, "speaking", {
      configurable: true,
      get: () => false,
    }),
  );
  await utter("Guide, start recording");
  await expect(page.getByTestId("voice-command-feedback")).toContainText(
    "Command sent: start recording",
  );
  await utter("StepLint, discard");
  await expect(page.getByText(/within .*s, or it expires/)).toBeVisible();
  await utter("StepLint, pause");
  await expect(page.getByText(/within .*s, or it expires/)).toHaveCount(0);
  await page.getByLabel("Enable voice control", { exact: true }).uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { qaRecognition: { aborts: number }[] })
            .qaRecognition[0].aborts,
      ),
    )
    .toBe(1);
  await page.getByLabel("Enable voice control", { exact: true }).check();
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
  await expect(
    page.getByText(/Microphone unavailable — use the buttons/),
  ).toBeVisible();
});

test("Teach voice commands drive the real recorder through recording, pause, resume and stop", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class Recognition {
      continuous = true;
      interimResults = true;
      lang = "en-US";
      onresult: ((e: unknown) => void) | null = null;
      onstart: (() => void) | null = null;
      start() {
        this.onstart?.();
        Object.assign(window, {
          utter: (text: string) =>
            this.onresult?.({
              resultIndex: 0,
              results: [{ isFinal: true, 0: { transcript: text } }],
            }),
        });
      }
      abort() {}
      stop() {}
    }
    Object.assign(window, { SpeechRecognition: Recognition });
    window.speechSynthesis.speak = () => {};
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
  await page.getByLabel(/Everyone visible or audible/).check();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await page.getByLabel("Enable voice control", { exact: true }).check();
  const utter = (text: string) =>
    page.evaluate(
      (text) =>
        (window as unknown as { utter: (t: string) => void }).utter(text),
      text,
    );
  await utter("Guide, start recording");
  await expect(page.getByText(/● REC — camera/)).toBeVisible();
  await utter("Step lint, pause recording");
  await expect(page.getByText(/❚❚ Paused/)).toBeVisible();
  await utter("Guide, please resume recording");
  await expect(page.getByText(/● REC — camera/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await utter("Guide, stop recording");
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
});
