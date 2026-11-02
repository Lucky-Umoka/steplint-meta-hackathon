import { test, expect } from "./safe-test";
import { localFixture } from "../tests/fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import { approveDraft } from "../src/teach/schema";
import { suggestReviews } from "../src/teach/review-suggestions";

test("probe video state", async ({ page }) => {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements = [
    {
      description: "Object at destination",
      status: "covered",
      stepIds: ["transfer"],
      reason: "x",
    },
  ];
  const checks = suggestReviews(local, context);
  const artifact = {
    ...approveDraft(
      local,
      {
        reviewer: "Shot",
        confirmed: true,
        goalConfirmed: true,
        steps: [
          { stepId: "transfer", ...checks.transfer, reviewed: true, conditionConfirmed: true },
        ],
      },
      context,
      1000,
    ),
    approvalReceipt: "mock-only-not-a-real-receipt",
  };
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const draw = () => {
      ctx.fillStyle = "#888";
      ctx.fillRect(0, 0, 320, 240);
      requestAnimationFrame(draw);
    };
    draw();
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
  });
  await page.route("**/api/teach/**", (route) => {
    if (route.request().url().endsWith("/practice-lesson"))
      return route.fulfill({
        json: {
          procedure: artifact.procedure,
          zoneBindings: artifact.zoneBindings,
          sourceLesson: artifact.sourceLesson,
          origin: "teach",
        },
      });
    return route.abort();
  });
  await page.addInitScript(
    (raw) => sessionStorage.setItem("steplint-approved-handoff", raw),
    JSON.stringify(artifact),
  );
  await page.goto("/practice");
  await page.getByLabel("Approved lessons").selectOption(artifact.procedure.id);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await page.waitForTimeout(3000);
  const a = await page.evaluate(() => {
    const v = document.querySelector("video") as HTMLVideoElement | null;
    const box = v?.getBoundingClientRect();
    const cs = v ? getComputedStyle(v) : null;
    return {
      ready: v?.readyState,
      time: v?.currentTime,
      vw: v?.videoWidth,
      vh: v?.videoHeight,
      paused: v?.paused,
      box: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "none",
      display: cs?.display,
      width: cs?.width,
      height: cs?.height,
      tracks: (v?.srcObject as MediaStream | null)?.getVideoTracks().map((t) => `${t.readyState}/${t.muted}`) ?? null,
    };
  });
  await page.waitForTimeout(1000);
  const b = await page.evaluate(() => {
    const v = document.querySelector("video") as HTMLVideoElement | null;
    return { time: v?.currentTime, ready: v?.readyState };
  });
  console.log(`PROBEA ${JSON.stringify(a)}`);
  console.log(`PROBEB ${JSON.stringify(b)}`);
  expect(true).toBe(true);
});
