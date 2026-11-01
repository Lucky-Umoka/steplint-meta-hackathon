import { describe, expect, it } from "vitest";
import { resolveAvatarMode } from "../src/components/GuideAvatar";

describe("resolveAvatarMode", () => {
  const base = {
    violation: false,
    complete: false,
    uncertain: false,
    busy: false,
  };
  it("stays idle with no signal", () => {
    expect(resolveAvatarMode(base)).toBe("idle");
  });
  it("warns on violation before anything else", () => {
    expect(
      resolveAvatarMode({ ...base, violation: true, complete: true }),
    ).toBe("warning");
  });
  it("celebrates completion only without violation", () => {
    expect(resolveAvatarMode({ ...base, complete: true })).toBe("success");
  });
  it("shows uncertainty instead of success or progress", () => {
    expect(resolveAvatarMode({ ...base, uncertain: true, busy: true })).toBe(
      "uncertain",
    );
  });
  it("thinks while busy with no verdict", () => {
    expect(resolveAvatarMode({ ...base, busy: true })).toBe("thinking");
  });
  it("never reports success from busyness alone", () => {
    expect(resolveAvatarMode({ ...base, busy: true })).not.toBe("success");
  });
  it("never reports success from uncertainty", () => {
    expect(resolveAvatarMode({ ...base, uncertain: true })).not.toBe("success");
  });
});
