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
    .replace(/[.,!?;:()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Explicit wake words, including the documented avatar name and the common
 * spaced speech-recognition spelling of StepLint. No fuzzy action matching. */
export function commandBody(text: string): string | null {
  const clean = normalizeUtterance(text);
  const activation = clean.match(
    /^(?:(?:hey|okay)\s+)?(?:step[ -]*lint|guide|(?:ai\s+)?muse)\s+(.+)$/,
  );
  if (!activation) return null;
  return activation[1]
    .replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/, "")
    .replace(/\s+please$/, "")
    .trim();
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
  if (!commandBody(text))
    return "No command executed. Begin with “Muse”, “Guide” or “StepLint”, for example “Guide, pause”.";
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
export function decideDisposition(input: {
  text: string;
  lastFinal: string;
  pending: PendingConfirmation | null;
  commands: VoiceCommand[];
  speaking: boolean;
  now: number;
}): Disposition {
  if (input.text === input.lastFinal) return { kind: "ignored" };
  const body = commandBody(input.text);
  if (!body) return { kind: "ignored" };
  // The user can silence narration hands-free. All other interface commands
  // remain blocked during self-speech so narration cannot control the app.
  if (input.speaking) {
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
    (c) => c.destructive && c.confirmPhrase === body,
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
