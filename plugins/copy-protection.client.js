// File: /var/www/VGEpaper/web/plugins/copy-protection.client.js
/**
 * Best-effort deterrence + traceability only — NOT real screenshot
 * prevention. No website, in any framework, can intercept PrintScreen,
 * Cmd+Shift+3/4/5, a phone's screenshot gesture, or a second camera pointed
 * at the screen — none of those ever reach the browser as an event. This
 * plugin blocks the in-browser vectors (selection, copy, right-click,
 * print, devtools shortcuts) and nothing more. Say so plainly in your UI if
 * you surface this as a feature — see the mockup's "About copy protection"
 * menu item for the wording that was reviewed with the client.
 */
import { defineNuxtPlugin } from '#imports';

export default defineNuxtPlugin(() => {
  if (import.meta.server) return;

  document.addEventListener('contextmenu', e => e.preventDefault());
  // No exceptions any more (Nov 2026): the story pull-out's text used to be
  // selectable (`.select-text`); it isn't now. Form fields still work —
  // the browser doesn't fire selectstart for typing into an <input>.
  document.addEventListener('selectstart', e => {
    if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  });
  // Phones: no long-press copy/share/"save image" menu on pages or stories.
  document.documentElement.style.webkitTouchCallout = 'none';
  document.addEventListener('dragstart', e => e.preventDefault());
  document.addEventListener('copy', e => e.preventDefault());
  document.addEventListener('cut', e => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    const k = e.key?.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const blockedWithMod = ['c', 'x', 's', 'p', 'u'];
    const isDevtoolsCombo = (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || k === 'f12';
    if ((mod && blockedWithMod.includes(k)) || isDevtoolsCombo) {
      e.preventDefault();
    }
  });

  window.addEventListener('beforeprint', () => {
    document.body.style.display = 'none';
    setTimeout(() => { document.body.style.display = ''; }, 0);
  });
});