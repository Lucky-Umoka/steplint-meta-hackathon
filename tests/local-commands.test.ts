import { expect, it } from "vitest";
import { LOCAL_PRACTICE_COMMANDS } from "../src/practice/local-commands";
import { decideDisposition } from "../src/voice/commands";
it.each(["Guide pause", "Guide stop speaking"])(
  "executes %s even while guidance is speaking",
  (text) => {
    expect(
      decideDisposition({
        text,
        lastFinal: "",
        pending: null,
        commands: LOCAL_PRACTICE_COMMANDS,
        speaking: true,
        now: 0,
      }).kind,
    ).toBe("executed");
  },
);
it("does not let narration trigger another normal action", () => {
  expect(
    decideDisposition({
      text: "Guide repeat",
      lastFinal: "",
      pending: null,
      commands: LOCAL_PRACTICE_COMMANDS,
      speaking: true,
      now: 0,
    }).kind,
  ).toBe("ignored");
});
