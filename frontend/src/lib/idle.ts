/**
 * Idle-timeout thresholds for auto sign-out (clinical/shared computers).
 * Beware: keep these consistent between warn and logout.
 */
export const IDLE_WARN_MS = 14 * 60 * 1000; // warn the user 14 minutes after last activity
export const IDLE_LOGOUT_MS = 15 * 60 * 1000; // force sign-out after 15 minutes of inactivity
export const IDLE_TICK_MS = 5_000;

export const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
] as const;
