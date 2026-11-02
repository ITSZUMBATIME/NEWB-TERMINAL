// Display settings: how big everything is, and how NEWB looks. The Settings tab is where
// people change them; this file keeps the values, applies them and remembers them.
//
//   Size            scales the whole window: buttons, icons, panels, the logo and text.
//                   Works like zoom in a web browser (Ctrl +, Ctrl -, Ctrl 0, or Ctrl + mouse wheel).
//   Terminal text   the size of the letters in the terminal itself.
//   Look            Classic, Flat or Terminal panels and icons.
//   Editor keys     Friendly or Vim.
//
// The welcome screen and logo choices are kept by main.js (it owns that state).
// Everything is remembered between runs.

import { getCurrentWebview } from "@tauri-apps/api/webview";

const KEY = "akin.display.v1";
const DEFAULTS = { scale: 1, font: 14, panels: "classic", editor: "friendly" };
const SCALE_MIN = 0.6;
const SCALE_MAX = 3;
const FONT_MIN = 9;
const FONT_MAX = 32;
// The sizes Ctrl + and Ctrl - step through.
const STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

/**
 * options: { onFontChange(px), onEditorChange(isVim), toast(msg) }
 * returns { state, stepScale(dir), resetScale(), setScale, setFont, setLook, setEditor, subscribe }
 */
export function initDisplay({ onFontChange, onEditorChange, toast }) {
  const state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* fine */ }
  };

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  /* ---------- Size ---------- */

  let usingCssZoom = false;
  let zoomToken = 0;

  async function applyScale() {
    const token = ++zoomToken;
    const factor = state.scale;
    try {
      // The browser engine's own zoom: sharp at every size, and the window layout follows it.
      await getCurrentWebview().setZoom(factor);
      if (usingCssZoom) document.documentElement.style.zoom = "";
      usingCssZoom = false;
    } catch (_) {
      // If that isn't allowed for some reason, fall back to the page's own zoom.
      if (token === zoomToken) {
        document.documentElement.style.zoom = String(factor);
        usingCssZoom = true;
      }
    }
  }

  function setScale(value, { quiet = false } = {}) {
    state.scale = clamp(Math.round(value * 100) / 100, SCALE_MIN, SCALE_MAX);
    save();
    applyScale();
    emit();
    if (!quiet) toast(`Size ${Math.round(state.scale * 100)}%`);
  }

  function stepScale(dir) {
    const cur = state.scale;
    const next = dir > 0 ? STEPS.find((s) => s > cur + 0.001) : [...STEPS].reverse().find((s) => s < cur - 0.001);
    setScale(next ?? (dir > 0 ? SCALE_MAX : SCALE_MIN));
  }

  const resetScale = () => setScale(1);

  /* ---------- Terminal text ---------- */

  function applyFont() {
    document.documentElement.style.setProperty("--term-font", `${state.font}px`); // the editor uses it too
    onFontChange(state.font);
  }
  function setFont(px) {
    state.font = clamp(Math.round(px), FONT_MIN, FONT_MAX);
    save();
    applyFont();
    emit();
  }

  /* ---------- Look ---------- */

  function applyLook() {
    document.documentElement.dataset.panels = state.panels;
  }
  function setLook(name) {
    state.panels = name;
    save();
    applyLook();
    emit();
  }

  /* ---------- Editor ---------- */

  function setEditor(id) {
    state.editor = id === "vim" ? "vim" : "friendly";
    save();
    onEditorChange?.(state.editor === "vim");
    emit();
  }

  /* ---------- Go ---------- */

  applyLook();
  applyScale();
  document.documentElement.style.setProperty("--term-font", `${state.font}px`);

  // First time on a very large screen? Say how to make things bigger.
  try {
    const bigScreen = window.screen.width >= 3440 || window.screen.height >= 1600;
    if (bigScreen && state.scale === 1 && !localStorage.getItem("akin.sizehint")) {
      localStorage.setItem("akin.sizehint", "1");
      setTimeout(() => toast("Big screen? Press Ctrl and + to make everything bigger, or open Settings with the cog at the top right."), 2500);
    }
  } catch (_) { /* fine */ }

  return {
    state,
    stepScale,
    resetScale,
    setScale,
    setFont,
    setLook,
    setEditor,
    /** Be told when any of these change (the Settings tab keeps itself up to date this way). */
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
}
