import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  GuideSchema,
  ArtifactSchema,
  guideBlockers,
  type Guide,
  type GuideArtifact,
} from "../../guide/schema";
import { canonical, guideContent } from "../../guide/versioning";
import { jpegSize, validateJpeg } from "./jpeg";
import { seal, unseal, TeachError } from "../teach/security";
export const contentHash = (g: Guide) =>
  createHash("sha256")
    .update(canonical(guideContent(g)))
    .digest("hex");
export function stampGuide(
  input: unknown,
  reviewer: string,
  purpose: "rehearsal" | "published",
  testOnly = false,
): GuideArtifact {
  const guide = GuideSchema.parse(input);
  for (const i of guide.images)
    validateJpeg(i.image, guide.source.width, guide.source.height);
  for (const obj of guide.objects) if (obj.appearance) jpegSize(obj.appearance);
  const blockers = guideBlockers(guide);
  if (blockers.length) throw new TeachError(422, blockers[0]);
  const stamped = GuideSchema.parse({
    ...guide,
    approval: {
      reviewer,
      at: Date.now(),
      purpose,
      testOnly,
      contentHash: contentHash(guide),
    },
  });
  const digest = createHash("sha256").update(canonical(stamped)).digest("hex");
  return {
    guide: stamped,
    receipt: seal(
      { digest },
      "guide-v2",
      "approved-guide",
      365 * 24 * 60 * 60 * 1000,
    ),
  };
}
export function verifyArtifact(input: unknown): GuideArtifact {
  const a = ArtifactSchema.parse(input);
  const proof = unseal(a.receipt, "guide-v2", "approved-guide");
  if (
    !proof ||
    typeof proof !== "object" ||
    !("digest" in proof) ||
    proof.digest !==
      createHash("sha256").update(canonical(a.guide)).digest("hex") ||
    a.guide.approval?.contentHash !== contentHash(a.guide)
  )
    throw new TeachError(
      422,
      "This saved guide changed after approval. Return to Teach to review it.",
    );
  return a;
}
export function structuralContent(g: Guide) {
  return {
    ...guideContent(g),
    revision: 0,
    parentRevision: null,
    title: "",
    goal: "",
    initialInstruction: "",
    methodName: "",
    objects: g.objects.map((o) => ({
      ...o,
      label: "",
      description: "",
      appearance: null,
    })),
    steps: g.steps.map((s) => ({
      ...s,
      instruction: "",
      explanation: "",
      correction: "",
    })),
    images: [],
  };
}
type PerceptionSession = {
  id: string;
  guide: Guide;
  expiresAt: number;
  used: number;
  busy: boolean;
};
const globalStore = globalThis as typeof globalThis & {
  stepLintPerception?: Map<string, PerceptionSession>;
  stepLintGuideSpend?: Map<string, { used: number; expiresAt: number }>;
};
const sessions = (globalStore.stepLintPerception ??= new Map<
  string,
  PerceptionSession
>());
const spend = (globalStore.stepLintGuideSpend ??= new Map<
  string,
  { used: number; expiresAt: number }
>());
export function openPerceptionSession(input: unknown) {
  const artifact = verifyArtifact(input);
  const now = Date.now();
  for (const [id, s] of sessions) if (s.expiresAt < now) sessions.delete(id);
  for (const [id, s] of spend) if (s.expiresAt < now) spend.delete(id);
  if (sessions.size >= 12)
    throw new TeachError(
      429,
      "Too many camera sessions. Stop an old session and try again later.",
    );
  const id = randomUUID(),
    session = {
      id,
      guide: artifact.guide,
      expiresAt: now + 45 * 60 * 1000,
      used: 0,
      busy: false,
    };
  sessions.set(id, session);
  return {
    token: seal({ id }, "perception-v2", "practice", 45 * 60 * 1000),
    maximumModelRequests: artifact.guide.relationPlan ? 12 : 6,
  };
}
export function acquirePerception(token: string, requestCost: 1 | 2 = 2) {
  const proof = unseal(token, "perception-v2", "practice");
  if (
    !proof ||
    typeof proof !== "object" ||
    !("id" in proof) ||
    typeof proof.id !== "string"
  )
    throw new TeachError(401, "Start a new camera session.");
  const s = sessions.get(proof.id);
  if (!s || s.expiresAt < Date.now())
    throw new TeachError(401, "Camera setup expired. Start the camera again.");
  if (s.busy) throw new TeachError(409, "The camera is already being checked.");
  const cap = s.guide.relationPlan ? 12 : 6;
  if (s.used + requestCost > cap)
    throw new TeachError(
      429,
      "This camera session reached its AI check limit. Pause and start a new session when ready.",
    );
  const key = `${s.guide.id}:${s.guide.revision}`;
  const total = spend.get(key) ?? {
    used: 0,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  if (total.used + requestCost > 32)
    throw new TeachError(
      429,
      "This guide reached the local test spending limit for today.",
    );
  s.busy = true;
  return {
    guide: s.guide,
    charge() {
      s.used++;
      total.used++;
      spend.set(key, total);
    },
    release() {
      s.busy = false;
    },
    remaining() {
      return cap - s.used;
    },
  };
}
/** Local-test bounds are process-local, not production distributed abuse prevention. */
