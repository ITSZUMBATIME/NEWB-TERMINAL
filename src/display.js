// Display settings: how big everything is, and how the panels look.
//
//   Interface size  scales the whole window: buttons, icons, panels, the logo and text.
//                   Works like zoom in a web browser (Ctrl +, Ctrl -, Ctrl 0, or Ctrl + mouse wheel).
//   Terminal text   the size of the letters in the terminal itself.
//   Panel style     Classic, Flat or Terminal looks for the side panels and tab bar.
//
// Everything is remembered between runs. This popover is also where themes and other
// settings will live later.

import { getCurrentWebview } from "@tauri-apps/api/webview";

const KEY = "akin.display.v1";
const DEFAULTS = { scale: 1, font: 14, panels: "classic" };
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
 * options: { onFontChange(px), toast(msg) }
 * returns { state, stepScale(dir), resetScale(), open(), close() }
 */
export function initDisplay({ onFontChange, toast }) {
  const state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* fine */ }
  };

  const pop = document.getElementById("display-pop");
  const openBtn = document.getElementById("open-display");
  const scaleRange = document.getElementById("scale-range");
  const scaleVal = document.getElementById("scale-val");
  const fontRange = document.getElementById("font-range");
  const fontVal = document.getElementById("font-val");
  const styleButtons = [...document.querySelectorAll("#panel-style button")];

  /* ---------- Interface size ---------- */

  let usingCssZoom = false;
  let zoomToken = 0;

  async function applyScale() {
    const token = ++zoomToken;
    const factor = state.scale;
    scaleVal.textContent = `${Math.round(factor * 100)}%`;
    scaleRange.value = String(Math.round(factor * 100));
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
    if (!quiet) toast(`Interface size ${Math.round(state.scale * 100)}%`);
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
    fontRange.value = String(state.font);
    onFontChange(state.font);
  }
  function setFont(px) {
    state.font = clamp(Math.round(px), FONT_MIN, FONT_MAX);
    save();
    applyFont();
  }

  /* ---------- Panel style ---------- */

  function applyPanels() {
    document.documentElement.dataset.panels = state.panels;
    for (const b of styleButtons) b.classList.toggle("on", b.dataset.style === state.panels);
  }
  function setPanels(name) {
    state.panels = name;
    save();
    applyPanels();
  }

  /* ---------- The popover ---------- */

  const isOpen = () => !pop.hidden;
  function open() {
    pop.hidden = false;
    openBtn.classList.add("active");
  }
  function close() {
    pop.hidden = true;
    openBtn.classList.remove("active");
  }
  openBtn.addEventListener("click", () => (isOpen() ? close() : open()));
  window.addEventListener("pointerdown", (e) => {
    if (isOpen() && !pop.contains(e.target) && !openBtn.contains(e.target)) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  // Sliders update as you drag, at most once per screen refresh.
  let pending = 0;
  scaleRange.addEventListener("input", () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => setScale(Number(scaleRange.value) / 100, { quiet: true }));
  });
  fontRange.addEventListener("input", () => setFont(Number(fontRange.value)));
  document.getElementById("scale-down").addEventListener("click", () => stepScale(-1));
  document.getElementById("scale-up").addEventListener("click", () => stepScale(1));
  document.getElementById("font-down").addEventListener("click", () => setFont(state.font - 1));
  document.getElementById("font-up").addEventListener("click", () => setFont(state.font + 1));
  for (const b of styleButtons) b.addEventListener("click", () => setPanels(b.dataset.style));
  document.getElementById("display-reset").addEventListener("click", () => {
    setScale(DEFAULTS.scale, { quiet: true });
    setFont(DEFAULTS.font);
    setPanels(DEFAULTS.panels);
  });

  /* ---------- Go ---------- */

  applyPanels();
  applyScale();
  // The terminal itself isn't created yet; main.js reads state.font when it makes each one.

  // First time on a very large screen? Say how to make things bigger.
  try {
    const bigScreen = window.screen.width >= 3440 || window.screen.height >= 1600;
    if (bigScreen && state.scale === 1 && !localStorage.getItem("akin.sizehint")) {
      localStorage.setItem("akin.sizehint", "1");
      setTimeout(() => toast("Big screen? Press Ctrl and + to make everything bigger, or use the Aa button."), 2500);
    }
  } catch (_) { /* fine */ }

  return { state, stepScale, resetScale, open, close, applyFont };
}
