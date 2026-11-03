// Small settings that don't belong to the theme or the Display panel: cursor, editor details,
// which side tabs to show. Kept in one place so the Settings page, the terminal, the editor and
// the left panel can all read them and be told when they change.

const KEY = "newb.prefs.v1";

export const DEFAULT_PREFS = {
  cursorStyle: "block", // block | bar | underline
  cursorBlink: true,
  scrollback: 5000, // lines of history kept in each terminal
  tabSize: 2,
  wordWrap: false,
  lineNumbers: true,
  showRepos: true,
  showSearch: true,
  logoText: "AKIN", // what the welcome logo says
  logoFont: "vortex", // vortex | metal-mania | mono | file:<name of a font in the fonts folder>
  aiOn: false, // the AI helpers are opt-in: off until you turn them on
  aiTool: "", // claude | codex ("" = the first one found)
  aiLevel: "ask", // see ailevels.js
  aiSudo: false, // allow the AI to use sudo
};

let state = { ...DEFAULT_PREFS };
try {
  Object.assign(state, JSON.parse(localStorage.getItem(KEY)));
} catch (_) { /* defaults */ }

const listeners = new Set();

// Some settings are easiest to apply with a little CSS switch on the page.
function applyToPage() {
  const root = document.documentElement;
  root.dataset.lineNumbers = state.lineNumbers ? "1" : "0";
  root.dataset.showRepos = state.showRepos ? "1" : "0";
  root.dataset.showSearch = state.showSearch ? "1" : "0";
  root.dataset.ai = state.aiOn ? "1" : "0";
}
applyToPage();

export const prefs = {
  get: (key) => state[key],
  all: () => ({ ...state }),
  set(key, value) {
    if (!(key in DEFAULT_PREFS) || state[key] === value) return;
    state[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* fine */ }
    applyToPage();
    for (const fn of listeners) fn(key, value, state);
  },
  reset() {
    for (const [k, v] of Object.entries(DEFAULT_PREFS)) prefs.set(k, v);
  },
  /** Be told when a setting changes: fn(key, value, allSettings). */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
