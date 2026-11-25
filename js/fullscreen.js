// Fullscreen + orientation lock. requestFullscreen must start inside a user
// gesture, so enterFullscreen() calls it synchronously before any await.
// Installed as an app (display: fullscreen) the page is already fullscreen, so we
// skip requestFullscreen there: Chrome would otherwise show its address notice.
import { settings } from './settings.js';

export const isInstalledApp = () => ['fullscreen', 'standalone', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
export const isStandaloneFullscreen = () => matchMedia('(display-mode: fullscreen)').matches;
export const isFullscreen = () => !!document.fullscreenElement || isStandaloneFullscreen();

export function enterFullscreen() {
  const s = settings();
  let p = Promise.resolve();
  if (s.fullscreen && !isFullscreen() && document.documentElement.requestFullscreen) {
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

// ---------------------------------------------------------------- install as app
let installEvent = null;
const installListeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own button instead of the mini-infobar
  installEvent = e;
  installListeners.forEach((fn) => fn(true));
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  installListeners.forEach((fn) => fn(false));
});

export const canInstall = () => !!installEvent && !isInstalledApp();
export const onInstallChange = (fn) => { installListeners.add(fn); return () => installListeners.delete(fn); };

/** Show Chrome's install dialog. Resolves true if the user accepted. */
export async function installApp() {
  if (!installEvent) return false;
  const e = installEvent;
  installEvent = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  installListeners.forEach((fn) => fn(canInstall()));
  return choice?.outcome === 'accepted';
}
