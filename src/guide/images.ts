import { frameImage } from "../teach/media";
import { evidenceFrames } from "./versioning";
import { GuideSchema, type Guide } from "./schema";
export async function prepareGuideImages(
  guide: Guide,
  video: Blob,
  signal: AbortSignal,
): Promise<Guide> {
  const urls = new Map<number, string>();
  for (const f of evidenceFrames(guide)) {
    signal.throwIfAborted();
    urls.set(f, await frameImage(video, guide.source.frameTimesMs[f]));
  }
  const objects = [];
  for (const obj of guide.objects) {
    signal.throwIfAborted();
    const image = new Image();
    image.src = urls.get(obj.sourceFrame)!;
    await image.decode();
    const box = obj.sourceBox,
      canvas = document.createElement("canvas");
    const w = (box.right - box.left) * image.width,
      h = (box.bottom - box.top) * image.height;
    const scale = Math.min(1, 280 / w, 220 / h);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Reference image preparation is unavailable.");
    ctx.drawImage(
      image,
      box.left * image.width,
      box.top * image.height,
      w,
      h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    objects.push({ ...obj, appearance: canvas.toDataURL("image/jpeg", 0.84) });
  }
  const needed = new Set([
    guide.steps[0].evidence.startFrame,
    guide.goalFrame,
    ...guide.steps.flatMap((s) => [
      s.evidence.startFrame,
      s.evidence.changeFrame,
      s.evidence.endFrame,
    ]),
  ]);
  const result = GuideSchema.parse({
    ...guide,
    objects,
    images: [...urls]
      .filter(([frame]) => needed.has(frame))
      .map(([frame, image]) => ({ frame, image })),
  });
  if (JSON.stringify(result).length > 3_500_000)
    throw Error(
      "The visual guide is too large. Use a shorter lesson with fewer steps.",
    );
  return result;
}
