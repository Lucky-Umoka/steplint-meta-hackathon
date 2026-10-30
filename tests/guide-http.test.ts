import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { fixture } from "./fixtures/guide";
import {
  analyse,
  approveGuide,
  practiceSession,
} from "../src/server/guide/http";
import { perceive } from "../src/server/guide/perception";
import { stampGuide, structuralContent } from "../src/server/guide/security";
import { seal } from "../src/server/teach/security";
import { canonical, newRevision } from "../src/guide/versioning";
import { jpegSize } from "../src/server/guide/jpeg";
vi.mock("server-only", () => ({}));
const secret = "guide-http-test-token-at-least-32-characters";
beforeEach(() => {
  vi.stubEnv("TEACH_ACCESS_TOKEN", secret);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Paid network forbidden");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function request(path: string, body: unknown, owner = true) {
  return new Request(`http://localhost:3000/api/teach/guide/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...(owner ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
function approval() {
  const guide = { ...fixture(), approval: null };
  return {
    guide,
    token: seal(guide, "guide-review-v2", "owner-cli"),
    reviewer: "AUTOMATED CONTRACT TEST",
    purpose: "published",
    confirmed: true,
    reviewedStepIds: guide.steps.map((s) => s.id),
    goalReviewed: true,
  };
}
it("requires creator auth and explicit full review, not an automatic draft approval", async () => {
  expect(
    (await approveGuide(request("approve", approval(), false))).status,
  ).toBe(401);
  const missing = approval();
  missing.reviewedStepIds = [];
  expect((await approveGuide(request("approve", missing))).status).toBe(422);
  expect(fetch).not.toHaveBeenCalled();
});
it("real HTTP approval produces a session-independent verified guide", async () => {
  const response = await approveGuide(request("approve", approval()));
  expect(response.status).toBe(200);
  const artifact: unknown = await response.json();
  const opened = await practiceSession(request("session", artifact, false));
  expect(opened.status).toBe(200);
  expect(await opened.json()).toMatchObject({ maximumModelRequests: 6 });
  expect(fetch).not.toHaveBeenCalled();
});
it("a private rehearsal needs creator access, while published reading does not", async () => {
  const artifact = stampGuide(
    { ...fixture(), approval: null },
    "TEST",
    "rehearsal",
  );
  expect(
    (await practiceSession(request("session", artifact, false))).status,
  ).toBe(401);
  expect((await practiceSession(request("session", artifact))).status).toBe(
    200,
  );
});
it("does not let edits replace signed evidence or weaken a condition", async () => {
  const body = approval();
  body.guide.steps[0].condition.minimumChange = 0.15;
  expect((await approveGuide(request("approve", body))).status).toBe(422);
  expect(fetch).not.toHaveBeenCalled();
});
it("wording-only revisions preserve source/rules, need review and do not mutate the old guide", async () => {
  const previous = stampGuide(
      { ...fixture(), approval: null },
      "TEST",
      "published",
    ),
    next = newRevision(previous.guide);
  next.title = "Reviewed wording revision";
  expect(canonical(structuralContent(previous.guide))).toBe(
    canonical(structuralContent(next)),
  );
  const response = await approveGuide(
    request("approve", {
      guide: next,
      previous,
      reviewer: "TEST",
      purpose: "published",
      confirmed: true,
      reviewedStepIds: next.steps.map((s) => s.id),
      goalReviewed: true,
    }),
  );
  expect(response.status).toBe(200);
  expect(previous.guide.revision).toBe(1);
});
it("rejects invalid camera data before any provider spend", async () => {
  const response = await perceive(
    request(
      "perceive",
      {
        token: "invalid",
        image: "data:image/jpeg;base64,/9j/2Q==",
        width: 640,
        height: 480,
        stepIndex: 0,
      },
      false,
    ),
  );
  expect(response.status).toBe(415);
  expect(fetch).not.toHaveBeenCalled();
});
it("validates JPEG headers and image dimensions, not only a MIME string", () => {
  expect(() => jpegSize("data:image/jpeg;base64,/9j/2Q==")).toThrow();
  expect(jpegSize(fixture().images[0].image)).toEqual({
    width: 640,
    height: 480,
  });
});
it("bounds analysis inputs and rejects unconfirmed media without constructing a provider call", async () => {
  const form = new FormData();
  form.append("video", new Blob(["invalid"]), "clip.mp4");
  form.append("audio", new Blob(["invalid"]), "audio.wav");
  form.append("confirmed", "false");
  const req = new Request("http://localhost:3000/api/teach/guide/analyse", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      Authorization: `Bearer ${secret}`,
    },
    body: form,
  });
  expect((await analyse(req)).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("cross-origin requests cannot open a paid perception session", async () => {
  const response = await practiceSession(
    new Request("http://localhost:3000/api/teach/guide/session", {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(response.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects missing source references before any paid upload", async () => {
  const form = new FormData();
  form.append("video", new Blob(["not uploaded"]), "clip.mp4");
  form.append("audio", new Blob(["not uploaded"]), "clip.wav");
  form.append("confirmed", "true");
  const response = await analyse(
    new Request("http://localhost:3000/api/teach/guide/analyse", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Authorization: `Bearer ${secret}`,
      },
      body: form,
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("reference frames");
  expect(fetch).not.toHaveBeenCalled();
});
