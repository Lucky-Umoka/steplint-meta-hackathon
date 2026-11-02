import { test, expect } from "./safe-test";
import { approvedFixture } from "./approved-fixture";

test("selected Practice room plays fresh generated camera frames and paints their actual pixels", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 320, 240);
        requestAnimationFrame(draw);
      };
      draw();
      return canvas.captureStream(30);
    };
  });
  await page.addInitScript(
    (raw) => sessionStorage.setItem("steplint-approved-handoff", raw),
    JSON.stringify(approvedFixture().artifact),
  );
  await page.goto("/practice");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  const video = page.getByLabel("Live work camera", { exact: true });
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  const first = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(first);
  expect(
    await video.evaluate((v: HTMLVideoElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(v, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }),
  ).toEqual([255, 0, 0, 255]);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.srcObject === null))
    .toBe(true);
});
