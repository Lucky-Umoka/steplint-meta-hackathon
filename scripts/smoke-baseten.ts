import { readFile } from "node:fs/promises";
import { z } from "zod";
import { sparkStructured } from "../src/server/meta/spark";
import { prepareSmoke } from "./smoke-common";
async function main() {
  prepareSmoke();
  process.env.SPARK_PROVIDER = "baseten";
  console.log(
    "Baseten meta-models/muse-spark-open-1026: at most 3 requests (text, one image, two frames); no retries or fallback. reasoning_effort omitted pending separate compatibility verification.",
  );
  const image = `data:image/png;base64,${(await readFile(new URL("../tests/fixtures/red-square.png", import.meta.url))).toString("base64")}`;
  for (const images of [[], [image], [image, image]]) {
    const result = await sparkStructured({
      instructions: "Return JSON with ok true.",
      text: 'Return {"ok":true}.',
      images,
      schema: z.object({ ok: z.literal(true) }),
      name: "Smoke",
      maxTokens: 2048,
    });
    console.log(
      JSON.stringify({
        passed: true,
        images: images.length,
        ...result.diagnostic,
      }),
    );
  }
}
main().catch(() => {
  console.error(
    "Baseten smoke blocked or failed; explicit --approved is required. No retry attempted. Inspect server configuration and typed adapter tests.",
  );
  process.exitCode = 1;
});
