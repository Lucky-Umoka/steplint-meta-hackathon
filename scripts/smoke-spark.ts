import { z } from "zod";
import { sparkStructured } from "../src/server/meta/spark";
import { prepareSmoke, reportFailure } from "./smoke-common";

// Explicitly invoked live smoke (npm run smoke:spark). Muse Spark runs only on
// Baseten (BASETEN_API_KEY), never on the Meta API.
async function main() {
  prepareSmoke();
  console.log(
    "Calling Baseten meta-models/muse-spark-open-1026: one text request, max 512 output tokens, no retries.",
  );
  const result = await sparkStructured({
    instructions: "Answer with the requested JSON only.",
    text: 'Return {"reply":"STEPLINT_OK"}.',
    schema: z.strictObject({ reply: z.literal("STEPLINT_OK") }),
    name: "SmokeReply",
    maxTokens: 512,
  });
  console.log(
    `Spark live smoke passed on ${result.diagnostic.provider}: validated reply ${result.data.reply}.`,
  );
}
main().catch(reportFailure);
