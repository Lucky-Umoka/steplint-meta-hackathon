import { expect, it } from "vitest";
import { LOCAL_PRACTICE_COMMANDS } from "../src/practice/local-commands";
import {
  commandFeedback,
  decideDisposition,
  isSelfSpeech,
} from "../src/voice/commands";

const decide = (
  text: string,
  extra: Partial<Parameters<typeof decideDisposition>[0]> = {},
) =>
  decideDisposition({
    text,
    lastFinal: "",
    pending: null,
    commands: LOCAL_PRACTICE_COMMANDS,
    speaking: false,
    now: 0,
    halfDuplex: true,
    ...extra,
  });
it.each([
  ["Guide, start practice", "start-practice"],
  ["Guide, pause", "pause-practice"],
  ["Guide, resume practice", "resume-practice"],
  ["Guide, repeat", "repeat"],
  ["Guide, what should I do next?", "repeat"],
  ["Guide, what next", "repeat"],
])("accepts %s once as %s (15-17)", (text, id) => {
  expect(decide(text)).toMatchObject({ kind: "executed", command: { id } });
  // The same final recognition again (duplicate) is not dispatched twice.
  expect(decide(text, { lastFinal: text })).toEqual({ kind: "ignored" });
});
it("restart needs explicit confirmation, then dispatches once (18)", () => {
  expect(decide("Guide, restart practice").kind).toBe("needs-confirmation");
  const pending = {
    actionId: "restart-practice",
    requestedAt: 0,
    expiresAt: 10_000,
  };
  expect(
    decide("Guide, confirm restart practice", { pending, now: 1000 }),
  ).toMatchObject({
    kind: "executed",
    command: { id: "restart-practice" },
  });
  expect(
    decide("Guide, confirm restart practice", { pending: null, now: 1000 })
      .kind,
  ).toBe("rejected");
});
it("invalid commands are rejected with a clear reason (20)", () => {
  expect(decide("Guide, open the door")).toEqual({ kind: "ignored" });
  expect(
    commandFeedback(
      "Guide, open the door",
      { kind: "ignored" },
      LOCAL_PRACTICE_COMMANDS,
      false,
    ),
  ).toContain("not available");
});
it("valid commands are not dropped while the app speaks (21)", () => {
  for (const text of [
    "Guide, start practice",
    "Guide, resume practice",
    "Guide, repeat",
  ])
    expect(decide(text, { speaking: true }).kind).toBe("executed");
  // Without half-duplex (other pages) the existing interrupt-only rule stays.
  expect(
    decide("Guide, repeat", { speaking: true, halfDuplex: false }).kind,
  ).toBe("ignored");
});
it("the app's own speech is never a command (22)", () => {
  const recentSpeech = ["Practice paused. Say resume practice to continue."];
  expect(isSelfSpeech("resume practice", recentSpeech)).toBe(true);
  expect(decide("resume practice", { recentSpeech })).toEqual({
    kind: "ignored",
  });
  // Even if speech recognition adds a wake word to text we just said.
  expect(
    decide("Guide, resume practice", {
      recentSpeech: ["Guide, resume practice"],
    }),
  ).toEqual({ kind: "ignored" });
  expect(decide("Guide, resume practice", { recentSpeech })).toMatchObject({
    kind: "executed",
  });
});

it("real Chrome continuous results: merged narration, mishearing, sentences, bare commands", async () => {
  const { commandBody, matchCommand, decideDisposition } = await import("../src/voice/commands");
  const { LOCAL_PRACTICE_COMMANDS: C } = await import("../src/practice/local-commands");
  const run = (text: string, recentSpeech: string[] = []) =>
    decideDisposition({ text, lastFinal: "", pending: null, commands: C, speaking: false, now: 0, halfDuplex: true, recentSpeech });
  // App narration merged in front of the learner's command in one final result.
  expect(commandBody("Return bottle to blue lid and retry move to plate Guide pause")).toBe("pause");
  expect(run("Missing unknown obstructed evidence. Guide, pause")).toMatchObject({ kind: "executed", command: { id: "pause-practice" } });
  // Common recognizer spellings of the wake word.
  expect(run("Guy resume practice")).toMatchObject({ kind: "executed", command: { id: "resume-practice" } });
  expect(run("Muse, start the camera please")).toMatchObject({ kind: "executed", command: { id: "start-camera" } });
  // Sentence: most specific phrase wins; "start camera" beats "start".
  expect(matchCommand("start camera", C)?.id).toBe("start-camera");
  expect(matchCommand("stop speaking now", C)?.id).toBe("stop-speaking");
  // Bare exact commands work without a wake word...
  expect(run("pause")).toMatchObject({ kind: "executed", command: { id: "pause-practice" } });
  // ...but a bare fragment of the app's own recent speech is still an echo.
  expect(run("resume practice", ["Practice paused. Say resume practice to continue."])).toEqual({ kind: "ignored" });
  // Bare sentences that are not exactly a command are narration.
  expect(run("I will pause here")).toEqual({ kind: "ignored" });
  // Destructive commands still need their confirmation.
  expect(run("Guide restart practice")).toMatchObject({ kind: "needs-confirmation" });
});

it("echo filtering is whole-word and wake-only results are recognised", async () => {
  const { isSelfSpeech, isWakeOnly } = await import("../src/voice/commands");
  expect(isSelfSpeech("pause", ["Practice paused."])).toBe(false);
  expect(isSelfSpeech("resume practice", ["Say resume practice to continue."])).toBe(true);
  expect(isWakeOnly("Guide,")).toBe(true);
  expect(isWakeOnly("Guide pause")).toBe(false);
});
