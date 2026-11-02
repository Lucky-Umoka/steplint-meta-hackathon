import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_TEACH_BODY,
  MAX_TEACH_VIDEO,
  MAX_TEACH_JSON,
} from "../src/teach/schema";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("uses Vercel's expected output directory even with local build flags", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STEPLINT_LOCAL_BUILD", "1");
  const { default: config } = await import("../next.config");
  expect(config.distDir).toBe(".next");
  expect(JSON.parse(readFileSync("vercel.json", "utf8")).outputDirectory).toBe(
    config.distDir,
  );
});
it("keeps local production and verification builds isolated", async () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STEPLINT_LOCAL_BUILD", "");
  vi.stubEnv("STEPLINT_VERIFY_BUILD", "");
  expect((await import("../next.config")).default.distDir).toBe(
    ".next-production",
  );
  vi.resetModules();
  vi.stubEnv("STEPLINT_VERIFY_BUILD", "1");
  expect((await import("../next.config")).default.distDir).toBe(".next-verify");
});
it("keeps complete upload and JSON envelopes below Vercel's body cap", () => {
  expect(MAX_TEACH_BODY).toBe(4_000_000);
  expect(MAX_TEACH_VIDEO + 1_100_000).toBeLessThan(MAX_TEACH_BODY);
  expect(MAX_TEACH_JSON).toBeLessThan(4_500_000);
  for (const route of ["lesson", "compile"])
    expect(
      readFileSync(`src/app/api/teach/${route}/route.ts`, "utf8"),
    ).toContain("maxDuration = 300");
});

it("returns a credential-free, noncached health response", async () => {
  const { GET } = await import("../src/app/api/health/route");
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    status: "ok",
    application: "steplint",
  });
});
