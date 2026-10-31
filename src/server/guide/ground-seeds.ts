import { validateGuideSelections } from "../../guide/source-context";
import "server-only";
import { conceptCrop, originalBox } from "./crop";
import { reportedConfidence } from "./quality";
import type OpenAI from "openai";
import type { Stream } from "openai/core/streaming";
import {
  buildObjectPrompt,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import type { Selection, LessonMedia } from "../../teach/schema";
import type { z } from "zod";
import type { NativeFramesSchema } from "./discovery";
import { TeachError } from "../teach/security";
export class GroundingUnavailable extends TeachError {
  constructor(
    public readonly reason: "empty_or_uncertain" | "ambiguous" | "unmatched",
    message: string,
  ) {
    super(422, message);
  }
}
export type Seed = { selection: Selection; point: { x: number; y: number } };
function pointFromMask(mask: SegmentationMaskRecord, w: number, h: number) {
  const raster = decodeMaskToRaster(mask.mask),
    mw = mask.mask.width,
    mh = mask.mask.height;
  let sx = 0,
    sy = 0,
    n = 0;
  for (let i = 0; i < raster.length; i++)
    if (raster[i]) {
      sx += i % mw;
      sy += Math.floor(i / mw);
      n++;
    }
  if (!n) throw new TeachError(422, "Segmentation returned an empty object.");
  const cx = sx / n,
    cy = sy / n;
  let best = -1,
    distance = Infinity;
  for (let i = 0; i < raster.length; i++) {
    if (!raster[i]) continue;
    const x = i % mw,
      y = Math.floor(i / mw);
    if (
      x > 0 &&
      x < mw - 1 &&
      y > 0 &&
      y < mh - 1 &&
      ![i - 1, i + 1, i - mw, i + mw].every((j) => raster[j])
    )
      continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  if (best < 0) best = raster.findIndex((v) => v === 1);
  const bounds = mask.bounds;
  return {
    x: Math.max(
      0,
      Math.min(
        w - 1,
        Math.floor(
          bounds.left +
            (((best % mw) + 0.5) / mw) * (bounds.right - bounds.left),
        ),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        h - 1,
        Math.floor(
          bounds.top +
            ((Math.floor(best / mw) + 0.5) / mh) * (bounds.bottom - bounds.top),
        ),
      ),
    ),
  };
}
const overlap = (
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) => {
  const intersection =
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return (
    intersection /
    Math.max(
      1,
      (a.right - a.left) * (a.bottom - a.top) +
        (b.right - b.left) * (b.bottom - b.top) -
        intersection,
    )
  );
};
/** One planned SAM image call per selected part. Concept mode does not trust Spark's foreground points. No failed-call retry. */
export async function groundGuideSeeds(
  client: OpenAI,
  proposals: Selection[],
  concepts: string[],
  frames: z.infer<typeof NativeFramesSchema>,
  media: LessonMedia,
  signal: AbortSignal,
  onResult?: (details: unknown) => void,
  foregroundPoints?: { x: number; y: number; label?: "negative" }[][],
  mode: "box" | "concept" = "box",
): Promise<Seed[]> {
  const size = media.info.video;
  if (!size) throw new TeachError(422, "Video is missing.");
  const seeds: Seed[] = [];
  for (let i = 0; i < proposals.length; i++) {
    const selection = proposals[i],
      frame = frames.find((f) => f.frame === selection.frame);
    if (!frame)
      throw new TeachError(
        422,
        "A native reference for this object is missing. Choose the optional marks or use a shorter clip.",
      );
    if (selection.mark.kind !== "box")
      throw new TeachError(422, "A source object needs a proposed extent.");
    const concept = concepts[i]?.trim();
    if (
      mode === "concept" &&
      (!concept || concept.length > 80 || /[,;\n]/.test(concept))
    )
      throw new TeachError(
        422,
        "SAM grounding needs one short object concept.",
      );
    const view =
      mode === "concept"
        ? await conceptCrop(frame.image, selection.mark, size)
        : {
            left: 0,
            top: 0,
            width: size.width,
            height: size.height,
            image: frame.image,
          };
    const imagePrompt =
      mode === "concept"
        ? concept!
        : buildObjectPrompt({
            size: { width: size.width, height: size.height },
            objects: [
              {
                id: 1,
                prompts: [
                  { box: selection.mark, points: foregroundPoints?.[i] },
                ],
              },
            ],
          });
    const events = await client.post<Stream<ResponsesEvent>>("/responses", {
      body: {
        model: "sam-3.1",
        store: false,
        stream: true,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: imagePrompt },
              { type: "input_image", image_url: view.image, detail: "auto" },
            ],
          },
        ],
        metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      },
      stream: true,
      signal,
      timeout: 60000,
    });
    const decoder = parseImageStream(events);
    for await (const snapshot of decoder)
      if (snapshot.records.length > 200)
        throw new TeachError(
          422,
          "Too many competing objects. Use a clearer reference.",
        );
    const result = await decoder.finalResult;
    if (result.outcome.status !== "completed" || result.diagnostics.length)
      throw new TeachError(
        422,
        `Object segmentation did not complete for ${selection.description}.`,
      );
    const masks = recordsOfKind(result.records, "mask");
    onResult?.({
      objectId: selection.id,
      description: selection.description,
      concept: concepts[i],
      frame: selection.frame,
      outcome: result.outcome.status,
      crop: {
        left: view.left,
        top: view.top,
        width: view.width,
        height: view.height,
      },
      records: recordsOfKind(result.records, "box").map((b) => ({
        bounds: originalBox(b, view),
        boxConfidence: b.confidence ?? null,
        maskConfidence:
          masks.find((m) => m.objectId === b.objectId)?.confidence ?? null,
      })),
      diagnosticCodes: result.diagnostics.map((d) => d.code),
    });
    const candidates = recordsOfKind(result.records, "box")
      .filter(
        (b) =>
          b.right > b.left &&
          b.bottom > b.top &&
          b.left >= 0 &&
          b.top >= 0 &&
          b.right <= view.width &&
          b.bottom <= view.height &&
          (b.right - b.left) * (b.bottom - b.top) <
            view.width * view.height * 0.85,
      )
      .flatMap((box) => {
        const mask = masks.find((m) => m.objectId === box.objectId);
        const confidence = reportedConfidence(box.confidence, mask?.confidence);
        if (
          confidence === null ||
          confidence < 0.9 ||
          !mask ||
          mask.mask.width * mask.mask.height > 1280 * 720 ||
          !decodeMaskToRaster(mask.mask).some((v) => v === 1)
        )
          return [];
        return [{ box: originalBox(box, view), mask }];
      });
    if (!candidates.length)
      throw new GroundingUnavailable(
        "empty_or_uncertain",
        `SAM could not reliably locate ${selection.description}. The mark needs correction before tracking.`,
      );
    const proposed = selection.mark;
    if (proposed.kind !== "box")
      throw new TeachError(
        422,
        "Automatic grounding requires a proposed object extent.",
      );
    let chosen: (typeof candidates)[number];
    if (mode === "concept") {
      const matching = candidates.filter((candidate) => {
        const b = candidate.box,
          x = (b.left + b.right) / 2,
          y = (b.top + b.bottom) / 2;
        return (
          x >= proposed.left &&
          x < proposed.right &&
          y >= proposed.top &&
          y < proposed.bottom
        );
      });
      if (matching.length !== 1)
        throw new GroundingUnavailable(
          matching.length ? "ambiguous" : "unmatched",
          matching.length
            ? `Several similar objects match ${selection.description}; no identity was guessed.`
            : `The SAM outline does not match ${selection.description}. Correct the source mark before tracking.`,
        );
      chosen = matching[0];
    } else {
      candidates.sort(
        (a, b) => overlap(b.box, proposed) - overlap(a.box, proposed),
      );
      if (overlap(candidates[0].box, proposed) < 0.3)
        throw new GroundingUnavailable(
          "unmatched",
          `The SAM outline does not match ${selection.description}. Correct the source mark before tracking.`,
        );
      if (
        candidates.length > 1 &&
        overlap(candidates[0].box, proposed) -
          overlap(candidates[1].box, proposed) <
          0.15
      )
        throw new GroundingUnavailable(
          "ambiguous",
          `Several similar objects match ${selection.description}; no identity was guessed.`,
        );
      chosen = candidates[0];
    }
    const b = chosen.box,
      point = pointFromMask(chosen.mask, view.width, view.height);
    if (
      point.x + view.left < b.left ||
      point.x + view.left >= b.right ||
      point.y + view.top < b.top ||
      point.y + view.top >= b.bottom
    )
      throw new TeachError(
        422,
        "The decoded foreground point is outside its object.",
      );
    seeds.push({
      selection: {
        ...selection,
        mark: {
          kind: "box",
          left: Math.floor(b.left),
          top: Math.floor(b.top),
          right: Math.ceil(b.right),
          bottom: Math.ceil(b.bottom),
        },
      },
      point: { x: point.x + view.left, y: point.y + view.top },
    });
  }
  return seeds;
}
export function groundedVideoRequest(
  fileId: string,
  seeds: Seed[],
  media: LessonMedia,
) {
  const size = media.info.video;
  if (!size) throw new TeachError(422, "Video is missing.");
  const prompt = buildObjectPrompt({
    size: { width: size.width, height: size.height },
    objects: seeds.map((s, i) => ({
      id: i + 1,
      prompts: [
        {
          frame: s.selection.frame,
          box: s.selection.mark.kind === "box" ? s.selection.mark : undefined,
          points: [s.point],
        },
      ],
    })),
  });
  return {
    model: "sam-3.1",
    store: false,
    stream: true,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_video", file_id: fileId },
        ],
      },
    ],
    metadata: {
      mask_encoding: "one_bit",
      include_confidence: "true",
      propagation_direction: "both",
    },
  };
}

/** Spark anchors are proposals; only the returned SAM video geometry can become evidence. */
export function multiFrameVideoRequest(
  fileId: string,
  anchors: Selection[][],
  media: LessonMedia,
  foregroundPoints?: { x: number; y: number; label?: "negative" }[][][],
) {
  const size = media.info.video;
  if (!size) throw new TeachError(422, "Video is missing.");
  const prompt = buildObjectPrompt({
    size: { width: size.width, height: size.height },
    objects: anchors.map((views, i) => ({
      id: i + 1,
      prompts: views.map((view, viewIndex) => {
        if (view.mark.kind === "point")
          return {
            frame: view.frame,
            points: [{ x: view.mark.x, y: view.mark.y }],
          };
        const b = view.mark;
        return {
          frame: view.frame,
          points: foregroundPoints?.[i]?.[viewIndex],
          box: {
            left: b.left,
            top: b.top,
            right: b.right,
            bottom: b.bottom,
          },
        };
      }),
    })),
  });
  return {
    model: "sam-3.1",
    store: false,
    stream: true,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_video", file_id: fileId },
        ],
      },
    ],
    metadata: {
      mask_encoding: "one_bit",
      include_confidence: "true",
      propagation_direction: "both",
    },
  };
}

/** Manual V2 corrections retain the six-part boundary; the legacy four-part route remains unchanged. */
export function guideSelectionRequest(
  fileId: string,
  selections: Selection[],
  media: LessonMedia,
) {
  const chosen = validateGuideSelections(selections, media);
  return multiFrameVideoRequest(
    fileId,
    chosen.map((selection) => [selection]),
    media,
  );
}

export type SeedViewPlan = {
  selection: Selection;
  concept: string;
  mode: "box" | "concept";
  points?: { x: number; y: number; label?: "negative" }[];
};
/** Every distinct view is planned before requests. A missing match is not an observed object. */
export async function groundPlannedGuideViews(
  client: OpenAI,
  plan: SeedViewPlan[],
  frames: z.infer<typeof NativeFramesSchema>,
  media: LessonMedia,
  signal: AbortSignal,
  onResult?: (details: unknown) => void,
  options: { requireEveryObject: boolean } = { requireEveryObject: true },
) {
  if (
    !plan.length ||
    plan.length > 6 ||
    new Set(plan.map((view) => `${view.selection.id}:${view.selection.frame}`))
      .size !== plan.length
  )
    throw new TeachError(422, "Invalid bounded foreground-view plan.");
  const accepted = new Map<string, Seed[]>();
  for (const view of plan) {
    try {
      const [seed] = await groundGuideSeeds(
        client,
        [view.selection],
        [view.concept],
        frames,
        media,
        signal,
        onResult,
        view.points ? [view.points] : undefined,
        view.mode,
      );
      accepted.set(seed.selection.id, [
        ...(accepted.get(seed.selection.id) ?? []),
        seed,
      ]);
      onResult?.({
        objectId: seed.selection.id,
        frame: seed.selection.frame,
        available: true,
      });
    } catch (error) {
      if (!(error instanceof GroundingUnavailable)) throw error;
      onResult?.({
        objectId: view.selection.id,
        frame: view.selection.frame,
        available: false,
        reason: error.reason,
      });
    }
  }
  for (const view of plan)
    if (options.requireEveryObject && !accepted.has(view.selection.id))
      throw new GroundingUnavailable(
        "empty_or_uncertain",
        `SAM could not reliably locate ${view.selection.description} in its planned views. No identity was invented.`,
      );
  return [...accepted].map(([objectId, views]) => ({
    objectId,
    views: views.sort((a, b) => a.selection.frame - b.selection.frame),
  }));
}
