import { describe, expect, it } from "vitest";
import {
  commandBody,
  confirmPending,
  confirmationExpired,
  decideDisposition,
  matchCommand,
  normalizeUtterance,
  requestConfirmation,
  type VoiceCommand,
} from "../src/voice/commands";

const COMMANDS: VoiceCommand[] = [
  {
    id: "start-recording",
    phrases: ["start recording", "start", "begin recording"],
  },
  { id: "stop-recording", phrases: ["stop recording", "stop", "done"] },
  {
    id: "discard-recording",
    phrases: ["discard recording", "discard"],
    destructive: true,
    confirmPhrase: "confirm discard",
  },
  {
    id: "restart-recording",
    phrases: ["restart recording"],
    destructive: true,
    confirmPhrase: "confirm restart",
  },
];
const decide = (
  text: string,
  extra: Partial<Parameters<typeof decideDisposition>[0]> = {},
) =>
  decideDisposition({
    text,
    lastFinal: "",
    pending: null,
    commands: COMMANDS,
    speaking: false,
    now: 1000,
    ...extra,
  });

describe("normalizeUtterance", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeUtterance("  StepLint,   START Recording! ")).toBe(
      "steplint start recording",
    );
  });
});
describe("commandBody", () => {
  it("requires the activation prefix", () => {
    expect(commandBody("StepLint, stop recording")).toBe("stop recording");
    expect(commandBody("stop recording")).toBe(null);
    expect(commandBody("Please tell StepLint to stop")).toBe(null);
    expect(commandBody("stop steplint")).toBe(null);
  });
});
describe("matchCommand", () => {
  it("matches accepted variations exactly", () => {
    expect(matchCommand("start", COMMANDS)?.id).toBe("start-recording");
    expect(matchCommand("begin recording", COMMANDS)?.id).toBe(
      "start-recording",
    );
  });
  it("rejects near-misses instead of fuzzy matching", () => {
    expect(matchCommand("start recording now", COMMANDS)).toBe(null);
    expect(matchCommand("stop", COMMANDS)?.id).toBe("stop-recording");
  });
});
describe("decideDisposition", () => {
  it("executes a valid command", () => {
    expect(decide("StepLint, done")).toEqual({
      kind: "executed",
      command: expect.objectContaining({ id: "stop-recording" }),
    });
  });
  it("ignores narration without the prefix", () => {
    expect(decide("Now lift the phone out of the tray")).toEqual({
      kind: "ignored",
    });
  });
  it("ignores unrecognized commands with the prefix", () => {
    expect(decide("StepLint, dance")).toEqual({ kind: "ignored" });
  });
  it("ignores duplicates and self-speech", () => {
    expect(decide("StepLint, stop", { lastFinal: "StepLint, stop" })).toEqual({
      kind: "ignored",
    });
    expect(decide("StepLint, stop", { speaking: true })).toMatchObject({
      kind: "executed",
      command: { id: "stop-recording" },
    });
  });
  it("requests confirmation for destructive actions", () => {
    expect(decide("StepLint, discard")).toEqual({
      kind: "needs-confirmation",
      command: expect.objectContaining({ id: "discard-recording" }),
    });
  });
  it("confirms the matching pending action once", () => {
    const pending = requestConfirmation("discard-recording", 1000);
    expect(decide("StepLint, confirm discard", { pending, now: 2000 })).toEqual(
      {
        kind: "executed",
        command: expect.objectContaining({ id: "discard-recording" }),
      },
    );
  });
  it("rejects confirmation for a different action", () => {
    const pending = requestConfirmation("discard-recording", 1000);
    expect(decide("StepLint, confirm restart", { pending, now: 2000 })).toEqual(
      {
        kind: "rejected",
        command: expect.objectContaining({ id: "restart-recording" }),
      },
    );
  });
  it("rejects expired confirmations", () => {
    const pending = requestConfirmation("discard-recording", 1000);
    expect(
      decide("StepLint, confirm discard", { pending, now: 60_000 }),
    ).toEqual({
      kind: "rejected",
      command: expect.objectContaining({ id: "discard-recording" }),
    });
    expect(confirmationExpired(pending, 60_000)).toBe(true);
    expect(confirmPending(pending, "discard-recording", 60_000)).toBe(false);
  });
  it("never marks steps passed: parser has no such action", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(ids).not.toContain("mark-passed");
    expect(decide("StepLint, next step")).toEqual({ kind: "ignored" });
  });
});

it("allows the stop-speaking command to interrupt narration while blocking procedural controls", () => {
  const commands = [
    ...COMMANDS,
    { id: "stop-speaking", phrases: ["stop speaking"] },
  ];
  expect(
    decide("StepLint, stop speaking", { commands, speaking: true }).kind,
  ).toBe("executed");
  expect(decide("StepLint, start", { commands, speaking: true }).kind).toBe(
    "ignored",
  );
});

it.each([
  "Guide, start recording",
  "Step lint, start recording",
  "Guide, could you please start recording please",
])("executes the documented activation: %s", (text) => {
  expect(decide(text).kind).toBe("executed");
});

it("explains ignored speech without inventing an executed action", async () => {
  const { commandFeedback } = await import("../src/voice/commands");
  expect(
    commandFeedback("start recording", { kind: "ignored" }, COMMANDS, false),
  ).toContain("Begin with");
  expect(
    commandFeedback(
      "Guide, open the door",
      { kind: "ignored" },
      COMMANDS,
      false,
    ),
  ).toContain("not available");
});

it("allows explicit pause/end during guidance without admitting start or destructive confirmation", () => {
  const commands = [
    ...COMMANDS,
    { id: "pause-practice", phrases: ["pause practice"] },
    { id: "end-practice", phrases: ["end practice"] },
  ];
  expect(
    decide("Guide, pause practice", { commands, speaking: true }).kind,
  ).toBe("executed");
  expect(decide("Guide, end practice", { commands, speaking: true }).kind).toBe(
    "executed",
  );
  expect(decide("Guide, start", { commands, speaking: true }).kind).toBe(
    "ignored",
  );
  expect(
    decide("Guide, confirm discard", {
      commands,
      speaking: true,
      pending: requestConfirmation("discard-recording", 1000),
    }).kind,
  ).toBe("ignored");
});
