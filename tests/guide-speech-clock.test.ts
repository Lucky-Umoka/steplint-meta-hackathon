import { describe, expect, it } from "vitest";
import {
  mouthOpennessAt,
  revealedText,
  spokenPosition,
  type SpeechSnapshot,
} from "../src/components/guide-speech-clock";

const text = "Place the yellow support on the blue base.";
const at = (over: Partial<SpeechSnapshot>): SpeechSnapshot => ({
  text,
  startedAt: 1000,
  boundaryChar: 0,
  boundaryAt: 0,
  rate: 1,
  ...over,
});

describe("Gideon speech clock (mouth + live transcript)", () => {
  it("is closed and shows nothing extra when silent", () => {
    expect(mouthOpennessAt(at({ startedAt: 0 }), 5000)).toBeLessThan(0.05);
    expect(spokenPosition(at({ startedAt: 0 }), 5000)).toBe(0);
  });
  it("reveals whole words only, advancing with time", () => {
    const early = revealedText(text, spokenPosition(at({}), 1300));
    const later = revealedText(text, spokenPosition(at({}), 2600));
    expect(text.startsWith(early)).toBe(true);
    expect(later.length).toBeGreaterThan(early.length);
    expect(early.endsWith(" ")).toBe(false);
    expect(revealedText(text, spokenPosition(at({}), 99_000))).toBe(text);
  });
  it("anchors to the real word boundary and never runs past that word", () => {
    const blue = text.indexOf("blue");
    const s = at({ boundaryChar: blue, boundaryAt: 3000 });
    expect(spokenPosition(s, 3000)).toBe(blue);
    expect(spokenPosition(s, 9000)).toBe(text.indexOf(" ", blue));
  });
  it("opens on vowels and closes on m/b/p", () => {
    const vowel = at({ boundaryChar: text.indexOf("ace") , boundaryAt: 2000 });
    const closed = at({ boundaryChar: text.indexOf("blue"), boundaryAt: 2000 });
    expect(mouthOpennessAt(vowel, 2000)).toBeGreaterThan(0.6);
    expect(mouthOpennessAt(closed, 2000)).toBeLessThan(0.1);
  });
});
