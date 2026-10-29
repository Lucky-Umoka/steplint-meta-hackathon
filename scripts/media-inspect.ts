import { inspectMedia, inspectWav, requireSamVideo } from "../src/media/inspect";
import { readMedia, sha256 } from "./media-common";
import { reportFailure } from "./smoke-common";

async function main() {
  const [mp4Path, wavPath] = process.argv.slice(2);
  if (!mp4Path || !wavPath || process.argv.length !== 4) throw new Error("Usage: npm run media:inspect -- clip.mp4 audio.wav (local inspection only)");
  const mp4 = await readMedia(mp4Path);
  const wav = await readMedia(wavPath, 1_100_000);
  console.log(JSON.stringify({ mp4: { ...requireSamVideo(await inspectMedia(new Blob([mp4]))), sha256: sha256(mp4) }, wav: { ...inspectWav(wav), sha256: sha256(wav) } }, null, 2));
}
main().catch(reportFailure);
