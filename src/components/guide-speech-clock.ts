/**
 * Gideon's speech clock, shared by his mouth and his live transcript so lips
 * and words stay together. Display only: it never replaces or changes the
 * voice system. A passive tap listens to the real utterance's `start`,
 * `boundary` (word) and `end` events; between word boundaries — or on voices
 * that emit none — position advances at the measured speaking pace.
 */
export const SPEECH_CHARS_PER_SECOND = 14.5;

export type SpeechSnapshot = {
  text: string;
  startedAt: number; // performance.now() at utterance start; 0 = silent
  boundaryChar: number; // last real word boundary (character index)
  boundaryAt: number; // performance.now() of that boundary; 0 = none yet
  rate: number;
};

const SILENT: SpeechSnapshot = {
  text: "",
  startedAt: 0,
  boundaryChar: 0,
  boundaryAt: 0,
  rate: 1,
};
let snapshot: SpeechSnapshot = SILENT;
const listeners = new Set<() => void>();
const emit = (next: SpeechSnapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

let tapped = false;
/** Install the passive listener once per page. Safe to call repeatedly. */
export function installSpeechTap(): void {
  if (tapped || typeof window === "undefined") return;
  const synth = window.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof synth.speak !== "function") return;
  tapped = true;
  try {
    const speak = synth.speak.bind(synth);
    const cancel = synth.cancel.bind(synth);
    synth.speak = (utterance: SpeechSynthesisUtterance) => {
      try {
        utterance.addEventListener("start", () =>
          emit({
            text: utterance.text,
            startedAt: performance.now(),
            boundaryChar: 0,
            boundaryAt: 0,
            rate: utterance.rate || 1,
          }),
        );
        utterance.addEventListener("boundary", (event) => {
          if (snapshot.text !== utterance.text || event.name === "sentence")
            return;
          emit({
            ...snapshot,
            boundaryChar: event.charIndex,
            boundaryAt: performance.now(),
          });
        });
        const finish = () => {
          if (snapshot.text === utterance.text) emit(SILENT);
        };
        utterance.addEventListener("end", finish);
        utterance.addEventListener("error", finish);
      } catch {
        /* Display tap only: never block speech. */
      }
      speak(utterance);
    };
    synth.cancel = () => {
      emit(SILENT);
      cancel();
    };
  } catch {
    tapped = false;
  }
}

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getSpeechSnapshot = () => snapshot;
export const getServerSpeechSnapshot = () => SILENT;

/** Character currently being spoken, anchored to the latest real boundary. */
export function spokenPosition(s: SpeechSnapshot, now: number): number {
  if (!s.startedAt || !s.text) return 0;
  const cps = SPEECH_CHARS_PER_SECOND * s.rate;
  const from = s.boundaryAt ? s.boundaryChar : 0;
  const at = s.boundaryAt || s.startedAt;
  let pos = from + ((now - at) / 1000) * cps;
  if (s.boundaryAt) {
    // Do not run past the end of the current word before the next boundary.
    const wordEnd = s.text.indexOf(" ", s.boundaryChar + 1);
    if (wordEnd > 0) pos = Math.min(pos, wordEnd);
  }
  return Math.max(0, Math.min(s.text.length, Math.floor(pos)));
}

/** Words revealed so far (whole words, so text never shows half-words). */
export function revealedText(text: string, position: number): string {
  if (position >= text.length) return text;
  const end = text.indexOf(" ", position);
  return text.slice(0, end < 0 ? text.length : end);
}

/**
 * Mouth opening 0..1 for the character being spoken: wide on a/o, open on
 * other vowels, closed on m/b/p, half-open on other letters, nearly shut
 * between words, with a light syllable wobble.
 */
export function mouthOpennessAt(
  s: SpeechSnapshot,
  now: number,
): number {
  if (!s.startedAt || !s.text) return 0.02;
  const i = spokenPosition(s, now);
  if (i >= s.text.length) return 0.02;
  const c = s.text[i].toLowerCase();
  const wobble = 0.85 + 0.15 * Math.sin(now / 45);
  if (c === "a" || c === "o") return 0.95 * wobble;
  if ("eiuy".includes(c)) return 0.7 * wobble;
  if ("mbp".includes(c)) return 0.04;
  if (/[a-z0-9]/.test(c)) return 0.38 * wobble;
  return 0.06;
}
