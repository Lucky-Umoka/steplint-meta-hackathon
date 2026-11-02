import { test, expect } from "./safe-test";
import {
  MAX_TEACH_BODY,
  MAX_TEACH_VIDEO_BYTES,
  MAX_WAV_BYTES,
} from "../src/media/limits";
import { inspectLessonVideo, validateLessonAudio } from "../src/teach/media";
// Source supplied explicitly: generated local fixture, never a paid-provider test.
test("normalizes a generated 60s clip into a bounded video-only MP4 and 16kHz WAV", async ({
  page,
}) => {
  test.skip(
    !process.env.DURATION_SOURCE,
    "Set DURATION_SOURCE to a generated 60s narrated/audio source fixture.",
  );
  // The owner's Chrome supports AAC encoding. The old MP4 guard wrongly
  // rejected deliberately discarded audio only in that capability branch.
  await page.addInitScript(() => {
    if (typeof AudioEncoder !== "undefined") {
      const original = AudioEncoder.isConfigSupported.bind(AudioEncoder);
      AudioEncoder.isConfigSupported = async (config) =>
        config.codec.startsWith("mp4a") ? { supported: true, config } : original(config);
    }
  });
  await page.route("**/api/teach/access", (route) =>
    route.fulfill({ json: { unlocked: true } }),
  );
  let checked = false;
  await page.route("**/api/teach/lesson", async (route) => {
    const bytes = route.request().postDataBuffer();
    if (!bytes) throw Error("No upload body");
    expect(bytes.length).toBeLessThan(MAX_TEACH_BODY);
    const form = await new Request("http://localhost/upload", {
      method: "POST",
      headers: { "Content-Type": route.request().headers()["content-type"] },
      body: new Uint8Array(bytes),
    }).formData();
    const video = form.get("video"),
      audio = form.get("audio");
    if (!(video instanceof File) || !(audio instanceof File))
      throw Error("Missing media");
    const media = await inspectLessonVideo(video);
    expect(media.info.durationSeconds).toBe(60);
    expect(media.frameTimesMs).toHaveLength(600);
    expect(media.info.audio).toBeNull();
    expect(video.size).toBeLessThanOrEqual(MAX_TEACH_VIDEO_BYTES);
    expect(audio.size).toBeLessThanOrEqual(MAX_WAV_BYTES);
    expect(
      validateLessonAudio(new Uint8Array(await audio.arrayBuffer()), media),
    ).toMatchObject({ sampleRate: 16000, channels: 1, durationSeconds: 60 });
    checked = true;
    await route.fulfill({
      status: 422,
      json: { error: "Offline 60s media check completed; no model request." },
    });
  });
  await page.goto("/teach");
  await page.getByRole("button", { name: "Create new teach" }).click();
  await page
    .getByLabel("Existing lesson MP4")
    .setInputFiles(process.env.DURATION_SOURCE!);
  await expect(page.getByLabel("Prepared lesson preview")).toBeVisible({
    timeout: 45000,
  });
  await page.getByLabel(/I reviewed this recording/).check();
  await page
    .getByRole("button", { name: "Build my lesson", exact: true })
    .click();
  await expect.poll(() => checked).toBe(true);
});
