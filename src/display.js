// Display settings: how big everything is, and how AKIN looks.
//
//   Size            scales the whole window: buttons, icons, panels, the logo and text.
//                   Works like zoom in a web browser (Ctrl +, Ctrl -, Ctrl 0, or Ctrl + mouse wheel).
//   Terminal text   the size of the letters in the terminal itself.
//   Look            Classic, Flat or Terminal panels and icons.
//
// The welcome screen and logo choices are filled in by main.js (it owns that state).
// Everything is remembered between runs. No sliders: a few clear buttons.

import { getCurrentWebview } from "@tauri-apps/api/webview";
import { el, segmented, makePopover } from "./ui.js";

const KEY = "akin.display.v1";
const DEFAULTS = { scale: 1, font: 14, panels: "classic" };
const SCALE_MIN = 0.6;
const SCALE_MAX = 3;
const FONT_MIN = 9;
const FONT_MAX = 32;
// The sizes Ctrl + and Ctrl - step through, and the quick buttons.
const STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const CHIPS = [0.75, 1, 1.25, 1.5, 2, 3];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

/**
 * options: { onFontChange(px), toast(msg) }
 * returns { state, popover, stepScale(dir), resetScale() }
 */
export function initDisplay({ onFontChange, toast }) {
  const state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* fine */ }
  };

  const pop = document.getElementById("display-pop");
  const scaleVal = document.getElementById("scale-val");
  const fontVal = document.getElementById("font-val");
  const chipBox = document.getElementById("scale-chips");
  const popover = makePopover(pop, document.getElementById("open-display"));

  /* ---------- Size ---------- */

  const chips = CHIPS.map((s) => {
    const b = el("button", "chip", `${Math.round(s * 100)}`);
    b.type = "button";
    b.title = `${Math.round(s * 100)}%`;
    b.addEventListener("click", () => setScale(s));
    chipBox.append(b);
    return { s, b };
  });

  let usingCssZoom = false;
  let zoomToken = 0;

  async function applyScale() {
    const token = ++zoomToken;
    const factor = state.scale;
    scaleVal.textContent = `${Math.round(factor * 100)}%`;
    for (const { s, b } of chips) b.classList.toggle("on", Math.abs(s - factor) < 0.001);
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
    fontVal.textContent = `${state.font} px`;
    onFontChange(state.font);
  }
  function setFont(px) {
    state.font = clamp(Math.round(px), FONT_MIN, FONT_MAX);
    save();
    applyFont();
  }

  /* ---------- Look ---------- */

  const lookSeg = segmented(
    document.getElementById("panel-style"),
    [
      { id: "classic", label: "Classic" },
      { id: "flat", label: "Flat" },
      { id: "terminal", label: "Terminal" },
    ],
    (id) => setLook(id),
  );
  function applyLook() {
    document.documentElement.dataset.panels = state.panels;
    lookSeg.set(state.panels);
  }
  function setLook(name) {
    state.panels = name;
    save();
    applyLook();
  }

  /* ---------- Buttons ---------- */

  document.getElementById("scale-down").addEventListener("click", () => stepScale(-1));
  document.getElementById("scale-up").addEventListener("click", () => stepScale(1));
  document.getElementById("font-down").addEventListener("click", () => setFont(state.font - 1));
  document.getElementById("font-up").addEventListener("click", () => setFont(state.font + 1));
  document.getElementById("display-reset").addEventListener("click", () => {
    setScale(DEFAULTS.scale, { quiet: true });
    setFont(DEFAULTS.font);
    setLook(DEFAULTS.panels);
    toast("Display reset.");
  });

  /* ---------- Go ---------- */

  applyLook();
  applyScale();
  fontVal.textContent = `${state.font} px`; // the terminals aren't created yet; main.js reads state.font for each

  // First time on a very large screen? Say how to make things bigger.
  try {
    const bigScreen = window.screen.width >= 3440 || window.screen.height >= 1600;
    if (bigScreen && state.scale === 1 && !localStorage.getItem("akin.sizehint")) {
      localStorage.setItem("akin.sizehint", "1");
      setTimeout(() => toast("Big screen? Press Ctrl and + to make everything bigger, or use the Display button."), 2500);
    }
  } catch (_) { /* fine */ }

  return { state, popover, stepScale, resetScale };
}
