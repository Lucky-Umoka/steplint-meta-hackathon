import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { frameTimingIrregular } from "../src/teach/media";

it("detects variable frame timing (phone clips) so they are normalized before SAM; steady clips are kept", async () => {
  const steady = await readFile(new URL("./fixtures/teach-synthetic.mp4", import.meta.url));
  const variable = await readFile(new URL("./fixtures/teach-vfr.mp4", import.meta.url));
  expect(await frameTimingIrregular(new Blob([steady]))).toBe(false);
  expect(await frameTimingIrregular(new Blob([variable]))).toBe(true);
});
