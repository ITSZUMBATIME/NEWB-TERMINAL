// Colour themes. A theme is a handful of colours (background, text, accent, a few status colours
// and the 16 terminal colours). Everything else in NEWB is worked out from those, so one click
// recolours the terminal, the editor, every panel and the welcome header.
//
// How: the stylesheet uses variables named after the original NEWB Dark colours (--x2c313a ...).
// For each of them we work out what that colour should be in the chosen theme:
//   greys   keep their place between the theme's background and its text colour,
//   colours keep their hue family (green stays green) but take the theme's own version of it.

import { THEME, UI } from "./theme.js";
import { ORIGINAL_COLORS } from "./original-colors.js";

/* ---------- The themes ---------- */

// bg, ink (text), accent, then the status colours, then the 16 terminal colours
// (black red green yellow blue magenta cyan white, then the bright ones).
const t = (id, name, dark, bg, ink, accent, red, green, amber, orange, purple, cyan, ansi) => ({ id, name, dark, bg, ink, accent, red, green, amber, orange, purple, cyan, ansi });

export const THEMES = [
  t("newb-dark", "NEWB Dark", true, "#14161a", "#c8ccd4", "#4ea1ff", "#ff6369", "#3fb950", "#e0a63a", "#f08c3a", "#b57bee", "#39c5cf",
    ["#1b1e24", "#e5484d", "#3fb950", "#e0a63a", "#4ea1ff", "#b57bee", "#39c5cf", "#c8ccd4", "#5b616b", "#ff6369", "#56d364", "#f2c14e", "#79b8ff", "#d2a8ff", "#56d4dd", "#ffffff"]),
  t("newb-light", "NEWB Light", false, "#fbfbfc", "#24292f", "#0969da", "#cf222e", "#1a7f37", "#9a6700", "#bc4c00", "#8250df", "#1b7c83",
    ["#24292f", "#cf222e", "#116329", "#4d2d00", "#0969da", "#8250df", "#1b7c83", "#6e7781", "#57606a", "#a40e26", "#1a7f37", "#633c01", "#218bff", "#a475f9", "#3192aa", "#8c959f"]),
  t("one-dark", "One Dark", true, "#282c34", "#abb2bf", "#61afef", "#e06c75", "#98c379", "#e5c07b", "#d19a66", "#c678dd", "#56b6c2",
    ["#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf", "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff"]),
  t("dracula", "Dracula", true, "#282a36", "#f8f8f2", "#bd93f9", "#ff5555", "#50fa7b", "#f1fa8c", "#ffb86c", "#ff79c6", "#8be9fd",
    ["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2", "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff"]),
  t("nord", "Nord", true, "#2e3440", "#d8dee9", "#88c0d0", "#bf616a", "#a3be8c", "#ebcb8b", "#d08770", "#b48ead", "#8fbcbb",
    ["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0", "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4"]),
  t("gruvbox-dark", "Gruvbox Dark", true, "#282828", "#ebdbb2", "#83a598", "#fb4934", "#b8bb26", "#fabd2f", "#fe8019", "#d3869b", "#8ec07c",
    ["#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984", "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2"]),
  t("gruvbox-light", "Gruvbox Light", false, "#fbf1c7", "#3c3836", "#076678", "#9d0006", "#79740e", "#b57614", "#af3a03", "#8f3f71", "#427b58",
    ["#fbf1c7", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#7c6f64", "#928374", "#9d0006", "#79740e", "#b57614", "#076678", "#8f3f71", "#427b58", "#3c3836"]),
  t("solarized-dark", "Solarized Dark", true, "#002b36", "#839496", "#268bd2", "#dc322f", "#859900", "#b58900", "#cb4b16", "#6c71c4", "#2aa198",
    ["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"]),
  t("solarized-light", "Solarized Light", false, "#fdf6e3", "#586e75", "#268bd2", "#dc322f", "#859900", "#b58900", "#cb4b16", "#6c71c4", "#2aa198",
    ["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"]),
  t("catppuccin-mocha", "Catppuccin Mocha", true, "#1e1e2e", "#cdd6f4", "#89b4fa", "#f38ba8", "#a6e3a1", "#f9e2af", "#fab387", "#cba6f7", "#94e2d5",
    ["#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de", "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8"]),
  t("catppuccin-latte", "Catppuccin Latte", false, "#eff1f5", "#4c4f69", "#1e66f5", "#d20f39", "#40a02b", "#df8e1d", "#fe640b", "#8839ef", "#179299",
    ["#5c5f77", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#acb0be", "#6c6f85", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#bcc0cc"]),
  t("tokyo-night", "Tokyo Night", true, "#1a1b26", "#c0caf5", "#7aa2f7", "#f7768e", "#9ece6a", "#e0af68", "#ff9e64", "#bb9af7", "#7dcfff",
    ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"]),
  t("monokai", "Monokai", true, "#272822", "#f8f8f2", "#66d9ef", "#f92672", "#a6e22e", "#e6db74", "#fd971f", "#ae81ff", "#a1efe4",
    ["#272822", "#f92672", "#a6e22e", "#f4bf75", "#66d9ef", "#ae81ff", "#a1efe4", "#f8f8f2", "#75715e", "#f92672", "#a6e22e", "#f4bf75", "#66d9ef", "#ae81ff", "#a1efe4", "#f9f8f5"]),
  t("rose-pine", "Rosé Pine", true, "#191724", "#e0def4", "#c4a7e7", "#eb6f92", "#9ccfd8", "#f6c177", "#ea9a97", "#c4a7e7", "#9ccfd8",
    ["#26233a", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4", "#6e6a86", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4"]),
  t("github-dark", "GitHub Dark", true, "#0d1117", "#c9d1d9", "#58a6ff", "#ff7b72", "#3fb950", "#d29922", "#ffa657", "#bc8cff", "#39c5cf",
    ["#484f58", "#ff7b72", "#3fb950", "#d29922", "#58a6ff", "#bc8cff", "#39c5cf", "#b1bac4", "#6e7681", "#ffa198", "#56d364", "#e3b341", "#79c0ff", "#d2a8ff", "#56d4dd", "#f0f6fc"]),
  t("github-light", "GitHub Light", false, "#ffffff", "#24292f", "#0969da", "#cf222e", "#1a7f37", "#9a6700", "#bc4c00", "#8250df", "#1b7c83",
    ["#24292f", "#cf222e", "#116329", "#4d2d00", "#0969da", "#8250df", "#1b7c83", "#6e7781", "#57606a", "#a40e26", "#1a7f37", "#633c01", "#218bff", "#a475f9", "#3192aa", "#8c959f"]),
  t("one-light", "One Light", false, "#fafafa", "#383a42", "#4078f2", "#e45649", "#50a14f", "#c18401", "#986801", "#a626a4", "#0184bc",
    ["#383a42", "#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4", "#0184bc", "#a0a1a7", "#4f525e", "#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4", "#0184bc", "#ffffff"]),
];

/* ---------- Colour maths ---------- */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
export const toHex = (rgb) => `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const mix = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/* ---------- Working out every variable for a theme ---------- */

// The original NEWB Dark colours that everything was designed around.
const ORIGIN = { bg: hexToRgb("#14161a"), ink: hexToRgb("#c8ccd4") };
const ORIGIN_SPAN = luma(ORIGIN.ink) - luma(ORIGIN.bg);
const ANCHOR = { red: "#ff6369", orange: "#f08c3a", amber: "#e0a63a", green: "#3fb950", cyan: "#39c5cf", accent: "#4ea1ff", purple: "#b57bee" };

// Which colour family does an original colour belong to? (null for greys.)
function familyOf(hex) {
  const [h, s] = toHsl(hexToRgb(hex));
  if (s < 0.2) return null;
  if (h >= 345 || h < 20) return "red";
  if (h < 38) return "orange";
  if (h < 65) return "amber";
  if (h < 165) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "accent";
  return "purple";
}
const FAMILY = Object.fromEntries(ORIGINAL_COLORS.map((h) => [h, familyOf(`#${h}`)]));

function greyFor(hex, theme) {
  const bg = hexToRgb(theme.bg);
  const ink = hexToRgb(theme.ink);
  const tt = (luma(hexToRgb(hex)) - luma(ORIGIN.bg)) / ORIGIN_SPAN; // 0 = page background, 1 = text colour
  if (tt >= 0 && tt <= 1) return mix(bg, ink, tt);
  if (tt > 1) return mix(ink, theme.dark ? [255, 255, 255] : [0, 0, 0], clamp((tt - 1) / 0.3));
  // darker than the page (panels, bars): a little darker than the background
  const towardBlack = clamp((-tt * ORIGIN_SPAN) / luma(ORIGIN.bg)) * (theme.dark ? 1 : 0.1);
  return mix(bg, [0, 0, 0], towardBlack);
}

function colourFor(hex, family, theme) {
  const [h0, s0, l0] = toHsl(hexToRgb(hex));
  const [, sA, lA0] = toHsl(hexToRgb(ANCHOR[family]));
  const [hT, sT, lT] = toHsl(hexToRgb(theme[family]));
  // on light themes the tints go light and the bright text colours go dark
  const l = theme.dark ? l0 : 1 - l0;
  const lA = theme.dark ? lA0 : 1 - lA0;
  const lNew = l <= lA ? (lA ? (l * lT) / lA : l) : lT + ((l - lA) * (1 - lT)) / (1 - lA);
  const sNew = clamp(s0 * (sA ? sT / sA : 1));
  return fromHsl(hT, sNew, clamp(lNew));
}

function variablesFor(theme) {
  const vars = {};
  for (const hex of ORIGINAL_COLORS) {
    const fam = FAMILY[hex];
    vars[`--x${hex}`] = toHex(fam ? colourFor(`#${hex}`, fam, theme) : greyFor(`#${hex}`, theme));
  }
  const rgb = (c) => hexToRgb(c).join(", ");
  vars["--accent-rgb"] = rgb(theme.accent);
  vars["--green-rgb"] = rgb(theme.green);
  vars["--ink-rgb"] = rgb(theme.ink);
  vars["--panel-rgb"] = hexToRgb(vars["--x0f1114"]).join(", ");
  return vars;
}

// What the terminal (xterm.js) needs.
function terminalColours(theme) {
  const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  const out = {
    background: theme.bg,
    foreground: theme.ink,
    cursor: theme.cursor || theme.ink,
    cursorAccent: theme.bg,
    selectionBackground: theme.selection || toHex(mix(hexToRgb(theme.bg), hexToRgb(theme.ink), 0.22)),
  };
  names.forEach((n, i) => {
    out[n] = theme.ansi[i];
    out["bright" + n[0].toUpperCase() + n.slice(1)] = theme.ansi[i + 8];
  });
  return out;
}

/* ---------- Choosing and applying ---------- */

const KEY = "akin.theme.v1";
const CUSTOM_KEY = "akin.theme.custom.v1"; // the last list of your own themes, so they are there from the first frame
const DEFAULT_ID = "newb-dark";
let custom = []; // your own themes (from the themes folder), see customthemes.js
const byId = (id) => THEMES.find((x) => x.id === id) || custom.find((x) => x.id === id) || THEMES[0];
const listeners = new Set();
const listListeners = new Set();
let state = { id: DEFAULT_ID, sync: false, darkId: DEFAULT_ID, lightId: "newb-light" };
let current = THEMES[0];

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === "object") state = { ...state, ...saved };
  } catch (_) { /* default */ }
  try {
    const cached = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (Array.isArray(cached)) custom = cached.filter((x) => x && typeof x.id === "string" && x.id.startsWith("custom:"));
  } catch (_) { /* none yet */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* fine */ }
}

const systemIsDark = () => !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;

function effectiveId() {
  return state.sync ? (systemIsDark() ? state.darkId : state.lightId) : state.id;
}

function apply(theme) {
  current = theme;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(variablesFor(theme))) root.style.setProperty(k, v);
  root.style.colorScheme = theme.dark ? "dark" : "light";
  root.dataset.themeDark = theme.dark ? "1" : "0";
  Object.assign(THEME, terminalColours(theme)); // the terminal and the info table read this
  UI.accent = theme.accent;
  UI.onAccent = theme.bg;
  UI.armed = { bg: theme.accent, fg: theme.dark ? theme.bg : "#ffffff" };
  UI.pending = { bg: toHex(mix(hexToRgb(theme.bg), hexToRgb(theme.accent), 0.45)), fg: theme.dark ? "#ffffff" : theme.ink };
  for (const fn of listeners) fn(theme);
}

export const currentTheme = () => current;
export const themeState = () => ({ ...state });
export const customThemes = () => custom;
export const allThemes = () => [...THEMES, ...custom];

/** Be told when the list of your own themes changes. */
export function onThemesListChange(fn) {
  listListeners.add(fn);
  return () => listListeners.delete(fn);
}

/**
 * Give the engine the current list of your own themes (from the themes folder).
 * If the theme in use was edited, it is redrawn on the spot. If it was deleted, NEWB goes back to
 * the default and this returns its name so the caller can say so.
 */
export function setCustomThemes(list) {
  const wantedId = effectiveId();
  const before = custom.find((x) => x.id === wantedId);
  custom = list;
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (_) { /* fine */ }
  let removed = null;
  const missing = (id) => typeof id === "string" && id.startsWith("custom:") && !custom.some((x) => x.id === id);
  if (missing(wantedId)) removed = before ? before.name : wantedId.slice("custom:".length);
  for (const slot of ["id", "darkId", "lightId"]) {
    if (missing(state[slot])) state[slot] = slot === "lightId" ? "newb-light" : DEFAULT_ID;
  }
  if (removed) save();
  const wanted = byId(effectiveId());
  if (removed || JSON.stringify(wanted) !== JSON.stringify(current)) apply(wanted);
  for (const fn of listListeners) fn(custom);
  return removed;
}

/** Be told whenever the theme changes (including once right after you subscribe if `now` is true). */
export function onThemeChange(fn, now = false) {
  listeners.add(fn);
  if (now) fn(current);
}

/** Pick a theme. With "match the system" on, it is remembered for dark or light, whichever the theme is. */
export function setTheme(id) {
  const theme = byId(id);
  if (state.sync) {
    if (theme.dark) state.darkId = theme.id;
    else state.lightId = theme.id;
  } else {
    state.id = theme.id;
    if (theme.dark) state.darkId = theme.id;
    else state.lightId = theme.id;
  }
  save();
  apply(byId(effectiveId()));
  return theme;
}

/** Show a theme without choosing it (the theme picker uses this while you move through the list). */
export function previewTheme(id) {
  apply(byId(id));
}

/** Put back the theme you actually chose, after previewing. */
export function endPreview() {
  apply(byId(effectiveId()));
}

export function setSync(on) {
  state.sync = Boolean(on);
  if (on) {
    if (current.dark) state.darkId = current.id;
    else state.lightId = current.id;
  } else {
    state.id = current.id;
  }
  save();
  apply(byId(effectiveId()));
}

/** Call once at the start, before anything is drawn. */
export function initThemes() {
  load();
  apply(byId(effectiveId()));
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.sync) apply(byId(effectiveId()));
  });
}
