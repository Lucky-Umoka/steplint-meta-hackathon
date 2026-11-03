import type { VoiceCommand } from "../voice/commands";
export const LOCAL_PRACTICE_COMMANDS: VoiceCommand[] = [
  {
    id: "start-camera",
    phrases: ["start camera", "open camera", "turn on camera"],
  },
  {
    id: "stop-camera",
    phrases: ["stop camera", "close camera", "turn off camera"],
  },
  {
    id: "capture-setup",
    phrases: ["capture setup", "calibrate", "capture setup for calibration"],
  },
  { id: "start-practice", phrases: ["start practice", "start"] },
  { id: "resume-practice", phrases: ["resume practice", "resume"] },
  { id: "end-practice", phrases: ["end practice", "end session"] },
  {
    id: "restart-practice",
    phrases: ["restart practice"],
    destructive: true,
    confirmPhrase: "confirm restart practice",
  },
  {
    id: "pause-practice",
    phrases: ["pause", "pause practice", "stop", "stop practice"],
  },
  {
    id: "repeat",
    phrases: ["repeat", "repeat step", "what next", "whats next", "what should i do next", "what now"],
  },
  { id: "stop-speaking", phrases: ["stop speaking"] },
];
