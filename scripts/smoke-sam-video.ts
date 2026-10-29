import { parseArgs } from "node:util";
import { createMetaClient } from "../src/server/meta/client";
import { buildSamVideoRequest, segmentVideoFile } from "../src/server/meta/media";
import { inspectMedia, requireSamVideo } from "../src/media/inspect";
import { prepareMediaSmoke, readMedia, sha256 } from "./media-common";
import { reportFailure } from "./smoke-common";

async function main() {
  const { values } = parseArgs({ options: {
    approved: { type: "boolean" }, mp4: { type: "string" }, sha256: { type: "string" },
    concept: { type: "string" }, "frame-prompts": { type: "string" },
  } });
  prepareMediaSmoke(values.approved);
  if (!values.mp4 || !values.sha256) throw new Error("Require --mp4 PATH --sha256 HASH; inspect and approve the file first.");
  if (Boolean(values.concept) === Boolean(values["frame-prompts"])) throw new Error("Choose exactly one --concept noun-phrase or --frame-prompts JSON_PATH.");
  const bytes = await readMedia(values.mp4);
  if (sha256(bytes) !== values.sha256) throw new Error("MP4 hash differs from approved input.");
  const media = requireSamVideo(await inspectMedia(new Blob([bytes])));
  const prompt: unknown = values["frame-prompts"]
    ? JSON.parse((await readMedia(values["frame-prompts"], 16_000)).toString("utf8"))
    : { kind: "concept", text: values.concept };
  // Validate prompt before upload or any paid request.
  buildSamVideoRequest("file-local-validation", media, prompt);
  const client = createMetaClient();
  console.log(`SAM video smoke: one MP4 upload, one sam-3.1 request (≤${media.video?.frames} frames; billing minimum 50), one cleanup delete; no retries.`);
  const summary = await segmentVideoFile(client, new Blob([bytes], { type: "video/mp4" }), media, prompt);
  console.log(JSON.stringify({ result: "SAM video live smoke passed; uploaded MP4 deleted", ...summary, media }, null, 2));
}
main().catch(reportFailure);
