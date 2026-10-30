export const PROCESSING_STAGES = [
  { id: "upload", title: "Upload and transcribe", detail: "Upload the video once and transcribe its audio." },
  { id: "discover", title: "Find task components", detail: "Spark proposes the objects and their initial marks." },
  { id: "track", title: "Track with SAM", detail: "Follow the marked components through the clip." },
  { id: "draft", title: "Draft and validate", detail: "Create candidate steps, validate the response and delete the temporary upload." },
  { id: "review", title: "Ready for your review", detail: "Check the marks, evidence and rules before approving." },
] as const;
export type ProcessingStage = typeof PROCESSING_STAGES[number]["id"];
export function stageFromMessage(message: string): ProcessingStage | undefined {
  if (message.startsWith("Finding task")) return "discover";
  if (message.startsWith("Found ") || message.startsWith("Tracking ")) return "track";
  if (message.startsWith("Drafting candidate")) return "draft";
  return undefined;
}
