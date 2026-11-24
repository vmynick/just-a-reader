// Fullscreen + orientation lock. requestFullscreen must start inside a user
// gesture, so enterFullscreen() calls it synchronously before any await.
import { settings } from './settings.js';

export const isStandaloneFullscreen = () => matchMedia('(display-mode: fullscreen)').matches;
export const isFullscreen = () => !!document.fullscreenElement || isStandaloneFullscreen();

export function enterFullscreen() {
  const s = settings();
  let p = Promise.resolve();
  if (s.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    try { p = document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* not allowed */ }
  }
  return p.then(lockOrientation);
}

export async function lockOrientation() {
  const o = settings().orientation;
  try {
    if (o === 'auto') screen.orientation?.unlock?.();
    else await screen.orientation?.lock?.(o);
  } catch { /* only works in fullscreen / installed app */ }
}

export function exitFullscreen() {
  try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
