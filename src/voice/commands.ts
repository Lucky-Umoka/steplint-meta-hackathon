/**
 * Deterministic voice-command parser. No model, no network.
 *
 * A finalized transcript executes at most one allowlisted action, and only
 * when it carries the "steplint" activation prefix. Anything else is
 * narration, not a command. Destructive actions always go through an
 * explicit one-time, time-limited confirmation.
 */
export type CommandDisposition =
  | "executed"
  | "ignored"
  | "rejected"
  | "needs-confirmation";
export type VoiceCommand = {
  id: string;
  /** Exact accepted utterances after normalization (activation removed). */
  phrases: string[];
  destructive?: boolean;
  confirmPhrase?: string;
};
export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,!?;:()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/**
 * Wake words, including the documented avatar name, the spaced spelling of
 * StepLint and common recognizer spellings of "guide"/"muse". In continuous
 * recognition the browser often prepends earlier speech (including the app's
 * own narration picked up by the microphone) to the same final result, so the
 * LAST wake word anywhere in the transcript starts the command.
 */
const WAKE = /(?:^|\s)(?:(?:hey|okay|ok)\s+)?(?:step[ -]*lint|steplint|guide|guyed|guy|guys|(?:ai\s+)?muse|mews)\s+/g;
/** A final result that is only the wake word ("Guide"), held for the next. */
export function isWakeOnly(text: string): boolean {
  return /^(?:(?:hey|okay|ok)\s+)?(?:step[ -]*lint|steplint|guide|guyed|guy|guys|(?:ai\s+)?muse|mews)$/.test(
    normalizeUtterance(text),
  );
}
export function commandBody(text: string): string | null {
  const clean = normalizeUtterance(text);
  let start = -1;
  for (const match of clean.matchAll(WAKE)) start = match.index! + match[0].length;
  if (start < 0) return null;
  const body = clean
    .slice(start)
    .replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/, "")
    .replace(/\s+please$/, "")
    .trim();
  return body || null;
}
export function commandFeedback(
  text: string,
  decision: Disposition,
  commands: VoiceCommand[],
  speaking: boolean,
): string {
  if (decision.kind === "needs-confirmation")
    return "Confirmation required. No change has been made yet.";
  if (decision.kind === "rejected")
    return "That confirmation is not active. Say the original command again.";
  if (decision.kind === "executed")
    return `Command sent: ${decision.command.phrases[0]}.`;
  if (!commandBody(text) && !bareCommand(text, commands))
    return "No command recognized. Say a listed command, for example “pause” or “Guide, resume practice”.";
  if (speaking)
    return commands.some((command) => command.id === "stop-speaking")
      ? "No command executed while guidance was speaking. Say “Guide, stop speaking”, then try again."
      : "No command executed while guidance was speaking. Try again after it finishes.";
  if (!matchCommand(commandBody(text)!, commands))
    return "That command is not available here. Use one of the listed commands.";
  return "Duplicate recognition ignored; no second action was applied.";
}
export function matchCommand(
  body: string,
  commands: VoiceCommand[],
): VoiceCommand | null {
  for (const command of commands)
    for (const phrase of command.phrases) if (body === phrase) return command;
  // Filler words never change which command was meant ("pause the practice").
  body = body.replace(/\b(?:the|a|my|now|this)\b/g, " ").replace(/\s+/g, " ").trim();
  for (const command of commands)
    for (const phrase of command.phrases) if (body === phrase) return command;
  // A command inside a longer sentence ("pause the practice", "please resume
  // practice now"): whole-word phrase containment, most specific (longest)
  // phrase wins; two different commands at that length are ambiguous.
  const padded = ` ${body} `;
  let best: { command: VoiceCommand; length: number; tie: boolean } | null =
    null;
  for (const command of commands)
    for (const phrase of command.phrases) {
      if (!padded.includes(` ${phrase} `)) continue;
      if (!best || phrase.length > best.length)
        best = { command, length: phrase.length, tie: false };
      else if (phrase.length === best.length && best.command.id !== command.id)
        best.tie = true;
    }
  return best && !best.tie ? best.command : null;
}
/**
 * A bare utterance that is exactly one command phrase ("pause", "resume
 * practice") is also a command; self-speech is filtered before this.
 */
export function bareCommand(
  text: string,
  commands: VoiceCommand[],
): VoiceCommand | null {
  const clean = normalizeUtterance(text);
  for (const command of commands)
    for (const phrase of command.phrases) if (clean === phrase) return command;
  return null;
}
export type PendingConfirmation = {
  actionId: string;
  requestedAt: number;
  expiresAt: number;
};
export type Disposition =
  | { kind: "executed"; command: VoiceCommand }
  | { kind: "ignored" }
  | { kind: "rejected"; command: VoiceCommand }
  | { kind: "needs-confirmation"; command: VoiceCommand };
/**
 * Pure decision step behind the hook: finalized transcript in, single
 * disposition out. Interim results never reach here; duplicates and
 * self-speech are filtered before matching.
 */
/**
 * True when the heard text is (part of) something the app itself just said:
 * the microphone picked up our own speech output. Never a user command.
 */
export function isSelfSpeech(text: string, recentSpeech: string[]): boolean {
  const heard = normalizeUtterance(text);
  return (
    heard.length > 0 &&
    // Whole words: "pause" is not an echo of "practice paused".
    recentSpeech.some((spoken) =>
      ` ${normalizeUtterance(spoken)} `.includes(` ${heard} `),
    )
  );
}
export function decideDisposition(input: {
  text: string;
  lastFinal: string;
  pending: PendingConfirmation | null;
  commands: VoiceCommand[];
  speaking: boolean;
  now: number;
  /**
   * Half-duplex turn-taking (canonical Practice, Phase 4): a valid wake-word
   * command is handled even while the app speaks — the caller stops the
   * app's speech first. Without it, only interrupt commands pass.
   */
  halfDuplex?: boolean;
  /** Text the app spoke recently; matching transcripts are self-speech. */
  recentSpeech?: string[];
}): Disposition {
  if (input.text === input.lastFinal) return { kind: "ignored" };
  if (input.recentSpeech && isSelfSpeech(input.text, input.recentSpeech))
    return { kind: "ignored" };
  const body =
    commandBody(input.text) ??
    (bareCommand(input.text, input.commands) ? normalizeUtterance(input.text) : null);
  if (!body) return { kind: "ignored" };
  // The user can silence narration hands-free. All other interface commands
  // remain blocked during self-speech so narration cannot control the app,
  // unless the caller uses explicit half-duplex turn-taking.
  if (input.speaking && !input.halfDuplex) {
    const interrupt = matchCommand(body, input.commands);
    return interrupt &&
      [
        "stop-speaking",
        "pause-practice",
        "end-practice",
        "pause-recording",
        "stop-recording",
      ].includes(interrupt.id) &&
      !interrupt.destructive
      ? { kind: "executed", command: interrupt }
      : { kind: "ignored" };
  }
  const confirm = input.commands.find(
    (c) =>
      c.destructive &&
      !!c.confirmPhrase &&
      ` ${body} `.includes(` ${c.confirmPhrase} `),
  );
  if (confirm)
    return confirmPending(input.pending, confirm.id, input.now)
      ? { kind: "executed", command: confirm }
      : { kind: "rejected", command: confirm };
  const command = matchCommand(body, input.commands);
  if (!command) return { kind: "ignored" };
  if (command.destructive) return { kind: "needs-confirmation", command };
  return { kind: "executed", command };
}
export const CONFIRM_WINDOW_MS = 10_000;
export function requestConfirmation(
  actionId: string,
  now: number,
): PendingConfirmation {
  return { actionId, requestedAt: now, expiresAt: now + CONFIRM_WINDOW_MS };
}
/** One-time use: returns true only for the matching unexpired pending action. */
export function confirmPending(
  pending: PendingConfirmation | null,
  actionId: string,
  now: number,
): boolean {
  return (
    pending !== null &&
    pending.actionId === actionId &&
    now <= pending.expiresAt
  );
}
export function confirmationExpired(
  pending: PendingConfirmation | null,
  now: number,
): boolean {
  return pending !== null && now > pending.expiresAt;
}
