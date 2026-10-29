import { parseArgs } from "node:util";
import { createMetaClient } from "../src/server/meta/client";
import { transcribeWav, VOICE_MODEL } from "../src/server/meta/media";
import { inspectWav } from "../src/media/inspect";
import { prepareMediaSmoke, readMedia, sha256 } from "./media-common";
import { reportFailure } from "./smoke-common";

async function main() {
  const { values } = parseArgs({ options: { approved: { type: "boolean" }, wav: { type: "string" }, sha256: { type: "string" } } });
  prepareMediaSmoke(values.approved);
  if (!values.wav || !values.sha256) throw new Error("Require --wav PATH --sha256 HASH; inspect and approve the file first.");
  const bytes = await readMedia(values.wav, 1_100_000);
  if (sha256(bytes) !== values.sha256) throw new Error("WAV hash differs from approved input.");
  const media = inspectWav(bytes);
  const client = createMetaClient();
  console.log(`Calling ${VOICE_MODEL}: one ${media.durationSeconds.toFixed(2)} s mono PCM WAV; no retries.`);
  if (!client.apiKey) throw new Error("Meta client has no API key.");
  const start = performance.now();
  const result = await transcribeWav(new Blob([bytes], { type: "audio/wav" }), client.apiKey);
  console.log(JSON.stringify({ result: "Voice live smoke passed", latencyMs: Math.round(performance.now() - start), media, transcript: result.transcript, audioDurationMs: result.audioDurationMs }, null, 2));
}
main().catch(reportFailure);
