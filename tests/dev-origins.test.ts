import { describe, expect, it } from "vitest";
import { devOrigins } from "../src/config/dev-origins";
describe("development asset origin configuration", () => {
  it("allows local browser HMR without accepting arbitrary hosts", () => { expect(devOrigins({})).toEqual(["127.0.0.1"]); });
  it("adds only exact current-workspace forwarded hosts and configured port", () => {
    const hosts = devOrigins({ CODESPACE_NAME: "my-workspace", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev", PORT: "3002" });
    expect(hosts).toContain("my-workspace-3000.app.github.dev"); expect(hosts).toContain("my-workspace-3001.app.github.dev"); expect(hosts).toContain("my-workspace-3002.app.github.dev");
    expect(hosts.some((h) => h.includes("*"))).toBe(false); expect(hosts).not.toContain("other-workspace-3001.app.github.dev");
  });
  it("uses hostname-only entries for an exact configured public origin", () => { expect(devOrigins({ TEACH_PUBLIC_ORIGIN: "https://preview.example.com:8443" })).toContain("preview.example.com"); });
  it("rejects invalid public origins and does not interpolate malformed workspace names", () => {
    expect(() => devOrigins({ TEACH_PUBLIC_ORIGIN: "https://example.com/path" })).toThrow("exact HTTP");
    expect(devOrigins({ CODESPACE_NAME: "*", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" })).toEqual(["127.0.0.1"]);
  });
});
