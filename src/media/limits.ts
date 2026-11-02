/** Shared Teach transport budget; decimal bytes, including multipart headroom. */
export const MAX_LESSON_SECONDS = 60;
export const MAX_LESSON_MS = MAX_LESSON_SECONDS * 1000;
export const MIN_LESSON_SECONDS = 10;
export const LESSON_FRAME_RATE = 10;
export const MAX_LESSON_FRAMES = MAX_LESSON_SECONDS * LESSON_FRAME_RATE;
export const MAX_SOURCE_FRAMES = MAX_LESSON_SECONDS * 60;
export function mediaBudget(profile: "vercel" | "standard") {
  return profile === "vercel"
    ? {
        bodyBytes: 4_000_000,
        videoBytes: 1_980_000,
        videoBitrate: 180_000,
        analysisMs: 280_000,
      }
    : {
        bodyBytes: 12_000_000,
        videoBytes: 8_000_000,
        videoBitrate: 1_000_000,
        analysisMs: 580_000,
      };
}
const configured =
  process.env.NEXT_PUBLIC_TEACH_UPLOAD_PROFILE ||
  (process.env.VERCEL === "1" ? "vercel" : "standard");
if (configured !== "vercel" && configured !== "standard")
  throw new Error(
    "NEXT_PUBLIC_TEACH_UPLOAD_PROFILE must be vercel or standard.",
  );
export const TEACH_UPLOAD_PROFILE = configured;
const budget = mediaBudget(configured);
export const LESSON_VIDEO_BITRATE = budget.videoBitrate;
export const LESSON_AUDIO_RATE = 16_000;
export const MAX_TEACH_VIDEO_BYTES = budget.videoBytes;
export const MAX_WAV_BYTES = 1_930_000;
export const MAX_TEACH_BODY = budget.bodyBytes;
export const MULTIPART_RESERVE_BYTES = 10_000;

// Hobby-compatible host ceiling retained; leave cleanup headroom.
export const TEACH_ANALYSIS_TIMEOUT_MS = budget.analysisMs;
export const SAM_REQUEST_TIMEOUT_MS = 240_000;
