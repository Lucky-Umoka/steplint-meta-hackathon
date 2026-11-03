"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideDisposition,
  commandBody,
  commandFeedback,
  isWakeOnly,
  requestConfirmation,
  type CommandDisposition,
  type PendingConfirmation,
  type VoiceCommand,
} from "./commands";

export type VoiceStatus =
  | "off"
  | "requesting"
  | "listening"
  | "unsupported"
  | "denied"
  | "error";
/** Explicit command handling stages (Phase 4). */
export type CommandStage =
  | "received"
  | "accepted"
  | "rejected"
  | "dispatched"
  | "completed"
  | "failed";
/** A host action may confirm its real outcome asynchronously. */
export type ActionOutcome = { ok: boolean; message: string };
export type VoiceEvent = {
  at: number;
  source: "you" | "steplint" | "verdict" | "control" | "guidance";
  text: string;
};
type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        resultIndex: number;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
declare global {
  interface Window {
    SpeechRecognition?: new () => RecognitionInstance;
    webkitSpeechRecognition?: new () => RecognitionInstance;
  }
}
/**
 * Hands-free command recognition over the browser Web Speech API.
 *
 * No StepLint backend or Meta requests: finalized transcripts go through
 * the deterministic allowlist parser. The browser may use its own speech service. While StepLint itself is speaking, results
 * are ignored so it can never command itself. One recognition instance at a
 * time; auto-recovery restarts it if the service stops mid-session.
 */
export function useVoiceControl({
  commands,
  enabled,
  paused,
  onAction,
  onEvent,
  halfDuplex,
  recentSpeech,
  onInterruptSpeech,
}: {
  commands: VoiceCommand[];
  enabled: boolean;
  /** Host-driven pause (e.g. while a confirmation dialog owns the mic). */
  paused?: boolean;
  onAction: (
    id: string,
    disposition: CommandDisposition,
  ) => void | boolean | Promise<ActionOutcome>;
  onEvent?: (event: VoiceEvent) => void;
  /** Valid commands interrupt app speech instead of being dropped. */
  halfDuplex?: boolean;
  /** What the app said recently, so its own speech is never a command. */
  recentSpeech?: () => string[];
  /** Stop the app's speech before handling an interrupting command. */
  onInterruptSpeech?: () => void;
}) {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [lastHeard, setLastHeard] = useState("");
  const [feedback, setFeedback] = useState("");
  const [restartGeneration, setRestartGeneration] = useState(0);
  const restart = useCallback(
    () => setRestartGeneration((value) => value + 1),
    [],
  );
  const [lastDisposition, setLastDisposition] =
    useState<CommandDisposition | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [stage, setStage] = useState<CommandStage | null>(null);
  const live = useRef({
    commands,
    enabled,
    paused: paused ?? false,
    onAction,
    onEvent,
    halfDuplex: halfDuplex ?? false,
    recentSpeech,
    onInterruptSpeech,
    /** Commands dispatched and not yet completed/failed. */
    inFlight: new Set<string>(),
    lastFinal: "",
    lastFinalAt: 0,
    pending: null as PendingConfirmation | null,
    generation: 0,
  });
  useEffect(() => {
    live.current.commands = commands;
    live.current.enabled = enabled;
    live.current.paused = paused ?? false;
    live.current.onAction = onAction;
    live.current.onEvent = onEvent;
    live.current.halfDuplex = halfDuplex ?? false;
    live.current.recentSpeech = recentSpeech;
    live.current.onInterruptSpeech = onInterruptSpeech;
  });
  const dispatch = useCallback((text: string) => {
    const L = live.current;
    if (!L.enabled || L.paused) return;
    setLastHeard(text);
    L.onEvent?.({ at: Date.now(), source: "you", text });
    const now = Date.now();
    const speaking =
      typeof window !== "undefined" && !!window.speechSynthesis?.speaking;
    setStage("received");
    const decision = decideDisposition({
      text,
      lastFinal: now - L.lastFinalAt < 1500 ? L.lastFinal : "",
      pending: L.pending,
      commands: L.commands,
      speaking,
      now,
      halfDuplex: L.halfDuplex,
      recentSpeech: L.recentSpeech?.(),
    });
    // Rejected/ignored speech never consumed an action. Do not suppress the
    // user's immediate retry after narration ends or a command becomes valid.
    if (
      decision.kind === "executed" ||
      decision.kind === "needs-confirmation"
    ) {
      L.lastFinal = text;
      L.lastFinalAt = now;
    }
    setLastDisposition(decision.kind);
    setFeedback(commandFeedback(text, decision, L.commands, speaking));
    if (decision.kind === "ignored" || decision.kind === "rejected")
      setStage("rejected");
    if (decision.kind === "ignored") return;
    // Half-duplex: a valid command stops our own speech, then runs.
    if (L.halfDuplex && speaking) L.onInterruptSpeech?.();
    if (
      L.halfDuplex &&
      decision.kind === "executed" &&
      L.inFlight.has(decision.command.id)
    ) {
      setStage("rejected");
      setFeedback(
        `“${decision.command.phrases[0]}” is already in progress; no second action was applied.`,
      );
      return;
    }
    if (decision.kind === "needs-confirmation") {
      L.pending = requestConfirmation(decision.command.id, now);
      setPending(L.pending);
    }
    if (decision.kind === "executed" || decision.kind === "rejected") {
      L.pending = null;
      setPending(null);
    }
    try {
      if (decision.kind === "executed") setStage("accepted");
      const applied = L.onAction(decision.command.id, decision.kind);
      if (applied instanceof Promise && decision.kind === "executed") {
        const id = decision.command.id;
        L.inFlight.add(id);
        setStage("dispatched");
        setFeedback(`Accepted: ${decision.command.phrases[0]}. Working on it…`);
        applied
          .then((outcome) => {
            setStage(outcome.ok ? "completed" : "failed");
            setFeedback(outcome.message);
            if (!outcome.ok) setLastDisposition("rejected");
          })
          .catch(() => {
            setStage("failed");
            setLastDisposition("rejected");
            setFeedback(
              "The command could not be completed. Use the on-screen control and check the current state.",
            );
          })
          .finally(() => L.inFlight.delete(id));
        return;
      }
      if (decision.kind === "executed" && applied !== false)
        setStage("completed");
      if (applied === false && decision.kind === "executed") {
        setStage("failed");
        L.lastFinal = "";
        L.lastFinalAt = 0;
        setLastDisposition("rejected");
        setFeedback(
          "The action is not available in this state. No command was applied.",
        );
      }
    } catch {
      L.lastFinal = "";
      L.lastFinalAt = 0;
      setStage("failed");
      setLastDisposition("rejected");
      setFeedback(
        "The command could not be applied. Use the on-screen control and check the current state.",
      );
    }
  }, []);
  // Expire stale confirmations; a conflicting action cancels via overwrite.
  // All writes are deferred to timers so the effect body itself never sets
  // state synchronously.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!pending) return;
    const left = pending.expiresAt - Date.now();
    const clear = () => {
      live.current.pending = null;
      setPending(null);
    };
    if (left <= 0) {
      const id = window.setTimeout(clear, 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(clear, left + 50);
    const tick = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(tick);
    };
  }, [pending]);
  useEffect(() => {
    live.current.pending = pending;
  }, [pending]);
  type Session = { rec: RecognitionInstance | null; stopped: boolean };
  function startRecognition(
    session: Session,
    gen: number,
    Impl: new () => RecognitionInstance,
  ) {
    setStatus("requesting");
    try {
      session.rec = new Impl();
    } catch {
      setStatus("error");
      return;
    }
    const rec = session.rec;
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => {
      if (gen === live.current.generation && !session.stopped)
        setStatus("listening");
    };
    // Chrome finalizes at a pause, so "Guide, … pause" can arrive as two
    // final results; a wake-word-only result is joined with the next one.
    let heldWake: { text: string; at: number } | null = null;
    rec.onresult = (event) => {
      if (gen !== live.current.generation || session.stopped) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0].transcript;
        if (isWakeOnly(text)) {
          heldWake = { text, at: Date.now() };
          continue;
        }
        const joined =
          heldWake && Date.now() - heldWake.at < 3000 && !commandBody(text)
            ? `${heldWake.text} ${text}`
            : text;
        heldWake = null;
        dispatch(joined);
      }
    };
    rec.onerror = (event) => {
      if (gen !== live.current.generation || session.stopped) return;
      // Ordinary silence can end a continuous recognition segment without
      // indicating permission or service failure.
      if (event.error === "no-speech") return;
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      )
        setStatus("denied");
      else setStatus("error");
      setFeedback(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission is blocked. Allow it in browser settings, then restart listening."
          : event.error === "audio-capture"
            ? "The microphone is unavailable or in use. Check the selected input, then restart listening."
            : "The browser speech service stopped. Check your connection, then restart listening.",
      );
      // Service/permission failures must not cause an unbounded restart loop.
      session.stopped = true;
      try {
        rec.abort();
      } catch {
        /* Already stopped by the service. */
      }
    };
    rec.onend = () => {
      if (gen !== live.current.generation || session.stopped) return;
      // Service stopped on its own: recover with the same single instance
      // pattern instead of stacking recognizers.
      try {
        rec.start();
      } catch {
        setStatus("error");
      }
    };
    try {
      rec.start();
    } catch {
      setStatus("error");
    }
  }
  useEffect(() => {
    if (!enabled || paused) return;
    const Impl =
      typeof window !== "undefined" &&
      (window.SpeechRecognition ?? window.webkitSpeechRecognition);
    if (!Impl) {
      // Deferred so the effect body never sets state synchronously.
      const id = window.setTimeout(() => setStatus("unsupported"), 0);
      return () => window.clearTimeout(id);
    }
    live.current.lastFinal = "";
    live.current.lastFinalAt = 0;
    const gen = ++live.current.generation;
    const liveRef = live.current;
    const session: Session = { rec: null, stopped: false };
    startRecognition(session, gen, Impl);
    return () => {
      session.stopped = true;
      liveRef.generation++;
      try {
        session.rec?.abort();
      } catch {
        // Teardown best-effort.
      }
      session.rec = null;
    };
    // dispatch is ref-stable via useCallback []; startRecognition only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused, restartGeneration]);
  useEffect(() => {
    if (paused) live.current.lastFinal = "";
  }, [paused]);
  const speakTimeLeft =
    pending !== null
      ? Math.max(0, Math.ceil((pending.expiresAt - nowMs) / 1000))
      : 0;
  return {
    // Derived: disabling needs no state write.
    status: enabled && !paused ? status : "off",
    lastHeard,
    feedback,
    restart,
    availableCommands: commands.map((c) => `Guide, ${c.phrases[0]}`),
    lastDisposition,
    commandStage: stage,
    pending,
    confirmWindowSec: speakTimeLeft,
  };
}
