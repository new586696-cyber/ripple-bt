/** Ensures only one voice note plays at a time, app-wide. */
let activePause: (() => void) | null = null;

export function claimVoicePlayback(pause: () => void) {
  if (activePause && activePause !== pause) activePause();
  activePause = pause;
}

export function releaseVoicePlayback(pause: () => void) {
  if (activePause === pause) activePause = null;
}
