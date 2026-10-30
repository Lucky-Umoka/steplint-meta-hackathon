import { describe, expect, it } from "vitest";
import { readAppJson } from "../src/teach/api-response";
import { ApprovedArtifactSchema } from "../src/teach/approved-artifact";
describe("API response boundaries", () => {
  it.each([200, 204, 401, 413, 502, 503])("handles empty HTTP %i responses without raw JSON exceptions", async (status) => {
    await expect(readAppJson(new Response(null, { status }), "Approval")).rejects.toThrow(/Approval/);
    await expect(readAppJson(new Response(null, { status }), "Approval")).rejects.not.toThrow("Unexpected end of JSON");
  });
  it("does not display gateway HTML or claim success", async () => {
    await expect(readAppJson(new Response("<html>gateway</html>", { status: 502 }), "Approval")).rejects.toThrow("HTTP 502");
    await expect(readAppJson(new Response("not JSON", { status: 200 }), "Approval")).rejects.toThrow("invalid response");
  });
  it("keeps the server's safe actionable error", async () => {
    await expect(readAppJson(Response.json({ error: "Incorrect Teach access code." }, { status: 401 }), "Sign-in")).rejects.toThrow("Incorrect Teach access code");
  });
  it("returns a parsed payload and rejects fake approved artifacts", async () => {
    expect(await readAppJson(Response.json({ valid: true }), "Test")).toEqual({ valid: true });
    expect(ApprovedArtifactSchema.safeParse({}).success).toBe(false);
    expect(ApprovedArtifactSchema.safeParse({ procedure: { approval: null } }).success).toBe(false);
  });
});
