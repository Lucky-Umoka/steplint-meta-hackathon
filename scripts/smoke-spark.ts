import { createMetaClient, SPARK_MODEL } from "../src/server/meta/client";
import { validateSparkResponse } from "../src/server/meta/validation";
import { prepareSmoke, reportFailure } from "./smoke-common";

async function main() {
  prepareSmoke();
  const client = createMetaClient();
  console.log(`Calling ${SPARK_MODEL}: one text request, max 128 output tokens, no retries.`);
  const response = await client.responses.create({
    model: SPARK_MODEL,
    input: "Reply with exactly STEPLINT_OK and nothing else.",
    reasoning: { effort: "minimal" },
    max_output_tokens: 128,
    store: false,
  });
  validateSparkResponse(response);
  console.log("Spark live smoke passed: completed response and expected text validated.");
}
main().catch(reportFailure);
