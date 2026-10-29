import { readFile } from "node:fs/promises";
import { parseImageStream } from "@meta-sam/parser";
import { createMetaClient, SAM_MODEL } from "../src/server/meta/client";
import { validateSamResult } from "../src/server/meta/validation";
import { prepareSmoke, reportFailure } from "./smoke-common";

async function main() {
  prepareSmoke();
  const client = createMetaClient();
  const image = await readFile(new URL("../tests/fixtures/red-square.png", import.meta.url));
  if (image.length > 100_000 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("SAM fixture must be a PNG under 100 KB.");
  }
  console.log(`Calling ${SAM_MODEL}: one 256×256 synthetic image, one prompt, no retries.`);
  const events = await client.responses.create({
    model: SAM_MODEL,
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: "red square" },
      { type: "input_image", image_url: `data:image/png;base64,${image.toString("base64")}`, detail: "auto" },
    ] }],
    stream: true,
    metadata: { mask_encoding: "one_bit" },
    store: false,
  });
  const result = await parseImageStream(events).finalResult;
  const counts = validateSamResult(result);
  console.log("SAM live smoke passed: completed stream and decoded nonempty masks validated.", counts);
}
main().catch(reportFailure);
