/** Event-time clock for camera processing, async request timing and saved logs.
 * Call from event/effect handlers; render should consume stored measurements.
 * Centralized so tests can supply a clock without changing procedural rules. */
export const browserClock = {
  monotonic: () => performance.now(),
  wall: () => Date.now(),
};
