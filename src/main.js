// NEWB: the window side.
// Shows a terminal (xterm.js) for each tab and connects it to a real shell
// that the Rust side runs. Also draws the logo and the system info.

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./style.css";
import { THEME } from "./theme.js";
import { buildModel, renderWeb } from "./info.js";
import { printBanner } from "./banner.js";
import { initDrawers } from "./drawers.js";
import { initExplorer } from "./explorer.js";
import { initDisplay } from "./display.js";
import { handleClipboardKey, initContextMenu } from "./clipboard.js";
import { icon, mountIcons, fileIcon } from "./icons.js";
import { createDragger } from "./drag.js";
import { shellPath, askChoice, el } from "./ui.js";
import { createEditor } from "./editor.js";
import { parseSpec, startTemplate, handleTemplateKey, cancelTemplate, fillBlank, refresh as refreshTemplate } from "./template.js";
import { AsciiLogo, ASCII_STYLES, setLogoColors } from "./asciilogo.js";
import { initThemes, onThemeChange, hexToRgb } from "./themes.js";
import { prefs } from "./prefs.js";
import pkg from "../package.json";
import { createSettingsView } from "./settings.js";
import { initCustomThemes } from "./customthemes.js";
import { initLogo } from "./logo.js";
import { initTour } from "./tour.js";
import { initThemePicker } from "./themepicker.js";
import { initAi } from "./ai.js";
import { TOOL_NAMES } from "./ailevels.js";

initThemes(); // colours first, so nothing flashes the wrong theme

// A tab is a terminal ("term"), a text editor ("editor") or the Settings page ("settings").
const isTerm = (tab) => tab?.kind === "term";
let lastTermId = null; // the terminal you were in last, so the explorer keeps following it
let lastEditorId = null; // and the editor, for the side-by-side view
let splitOn = false; // editor beside terminal
let splitRatio = 0.5; // how much of the width the terminal gets when split

const tabsEl = document.getElementById("tabs");
const panesEl = document.getElementById("panes");
const newTabBtn = document.getElementById("new-tab");

/* ---------- Small helpers for remembering settings ---------- */

function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* fine */ }
}
function loadSetting(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

/* ---------- Main screen: logo + system info ---------- */

const heroEl = document.getElementById("hero");
const toastEl = document.getElementById("logo-toast");
const asciiLogo = new AsciiLogo(document.getElementById("ascii-logo"));

let toastTimer = null;
function toast(message, ms = 3500) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

// Logo styles, all drawn from characters.
const LOGOS = [
  { id: "code", name: "ASCII Code" },
  { id: "dots", name: "Dot Matrix" },
  { id: "shade", name: "ASCII Shade" },
].filter((l) => ASCII_STYLES.includes(l.id));
let logoIndex = 0;

function setLogo(i, announce) {
  logoIndex = (i + LOGOS.length) % LOGOS.length;
  const logo = LOGOS[logoIndex];
  heroEl.dataset.logo = logo.id;
  asciiLogo.setStyle(logo.id);
  saveSetting("akin.logo.v2", logo.id);
  welcomeListeners.forEach((fn) => fn());
  if (announce) toast(`Logo: ${logo.name}.`, 2000);
}
function textLogoStyle() {
  return LOGOS[logoIndex].id === "shade" ? "shade" : "code";
}
const welcomeListeners = new Set();
const welcomeApi = {
  layouts: () => LAYOUTS.map((l) => ({ id: l.id, label: l.name })),
  logos: () => LOGOS.map((l) => ({ id: l.id, label: l.name })),
  layout: () => LAYOUTS[layoutIndex].id,
  logo: () => LOGOS[logoIndex].id,
  setLayout: (id) => setLayout(LAYOUTS.findIndex((l) => l.id === id), true),
  setLogo: (id) => setLogo(LOGOS.findIndex((l) => l.id === id), false),
  subscribe: (fn) => (welcomeListeners.add(fn), () => welcomeListeners.delete(fn)),
};

function cycleLogo() {
  if (heroEl.dataset.layout === "text") {
    // The printed banner can use the two character styles. New tabs pick up the change.
    const next = textLogoStyle() === "code" ? "shade" : "code";
    setLogo(LOGOS.findIndex((l) => l.id === next), false);
    toast(`Logo: ${LOGOS[logoIndex].name}. Open a new tab (Ctrl+Shift+T) to see it.`);
    return;
  }
  setLogo(logoIndex + 1, true);
}

// Layouts for the logo and system info.
const LAYOUTS = [
  { id: "pinned", name: "Header", hint: "the animated logo and info sit above the terminal and scroll away as you work." },
  { id: "text", name: "Text", hint: "the logo and info print at the top of each new tab. Press Ctrl+Shift+T to see it." },
  { id: "logo", name: "Logo only", hint: "just the animated logo, above the terminal." },
  { id: "off", name: "Off", hint: "nothing extra, a plain terminal." },
];
let layoutIndex = 0;
let bannerShown = false;
let infoModel = null;
let infoPromise = null;

const infoEls = {
  title: document.getElementById("info-title"),
  left: document.getElementById("info-left"),
  right: document.getElementById("info-right"),
  palette: document.getElementById("palette"),
};

function setLayout(i, announce) {
  layoutIndex = (i + LAYOUTS.length) % LAYOUTS.length;
  const layout = LAYOUTS[layoutIndex];
  heroEl.dataset.layout = layout.id;
  saveSetting("akin.layout.v4", layout.id);
  welcomeListeners.forEach((fn) => fn());
  if (announce) toast(`Welcome screen: ${layout.name}, ${layout.hint}`, 4500);
}

async function loadInfo() {
  try {
    const info = await invoke("system_info");
    infoModel = buildModel(info.lines);
    renderWeb(infoModel, infoEls);
  } catch (_) {
    infoModel = null; // no info is better than a broken start
  }
}

/* ---------- Dropping commands into the terminal ---------- */

let drawersApi = null;
let display = null;
let customThemes = null;
let logoApi = null;
let tourApi = null;
let themePicker = null;
let aiApi = null;
let explorerApi = null;
let homeDir = "";

const templateIO = (tab) => ({
  send: (text) => invoke("pty_write", { id: tab.id, data: text }),
  toast,
});

// Before NEWB types something for you, wait (briefly) until the shell is back at its prompt.
// If a command is still running, or the shell is off searching for a "command not found" hint
// (Fedora does this and redraws the line while it works), typing now would be echoed in the middle
// of that and come out garbled. If it is still busy after a couple of seconds we type anyway,
// because the program that is running may be waiting for it.
async function waitForPrompt(tab, maxMs = 2500) {
  const started = performance.now();
  let told = false;
  for (;;) {
    let busy = false;
    try { busy = await invoke("pty_busy", { id: tab.id }); } catch (_) { return; }
    if (!busy) return;
    if (performance.now() - started > maxMs) return;
    if (!told && performance.now() - started > 600) {
      told = true;
      toast("Waiting for the terminal to finish…", 2500);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
}

// Type a command at the prompt (never presses Enter). Commands with blanks start the fill-in session.
async function insertCommand(cmd, risky) {
  const tab = activeTab();
  if (!tab) return;
  if (!isTerm(tab)) {
    tab.editor.insertText(parseSpec(cmd).text); // in an editor, the command goes into the file
    return;
  }
  if (!tab.opened) return;
  await waitForPrompt(tab);
  startTemplate(tab, parseSpec(cmd), templateIO(tab));
  keepCursorInView(tab);
  tab.term.focus();
  if (risky) toast("Careful: this one can delete or change things. Check it, then press Enter.");
}

// Type plain text (like "cd ~/Projects") at the prompt. Never presses Enter.
async function typeText(text) {
  const tab = terminalForAction();
  if (!tab || !tab.opened) return;
  await waitForPrompt(tab);
  startTemplate(tab, { text, blanks: [] }, templateIO(tab));
  keepCursorInView(tab);
  tab.term.focus();
}

// A file or folder dropped on the terminal: its path goes into the blank you're on,
// or is typed at the prompt if you aren't filling in blanks.
// The folder this tab's shell is in, so paths can be written the short way.
async function cwdOf(tab) {
  try {
    return await invoke("pty_cwd", { id: tab.id });
  } catch (_) {
    return "";
  }
}

async function insertPath(path) {
  const tab = activeTab();
  if (!tab) return;
  if (!isTerm(tab)) {
    tab.editor.insertText(path);
    return;
  }
  if (!tab.opened) return;
  const text = shellPath(path, homeDir, await cwdOf(tab));
  const io = templateIO(tab);
  if (!tab.template) await waitForPrompt(tab); // (while filling in blanks the shell is already waiting for you)
  if (!fillBlank(tab, text, io)) io.send(text + " ");
  keepCursorInView(tab);
  tab.term.focus();
}

/* ---------- Scrolling header ----------
   The logo/info header sits at the top of the active tab, above the terminal.
   `tab.s` is how far it has scrolled up (0 = fully showing, header height = gone). */

const headerHeight = () => heroEl.offsetHeight; // 0 when the layout hides it

function applyScroll(tab) {
  if (!isTerm(tab)) return;
  const H = headerHeight();
  tab.s = Math.max(0, Math.min(H, tab.s));
  if (tab.id === lastTermId) heroEl.style.transform = `translateY(${-tab.s}px)`;
  tab.holder.style.transform = `translateY(${H - tab.s}px)`;
}

// As output fills the screen, slide the header away so the cursor never gets pushed off the bottom.
function keepCursorInView(tab) {
  if (!isTerm(tab)) return;
  const H = headerHeight();
  if (!H || tab.id !== lastTermId || !tab.opened || !tab.pane.classList.contains("active")) return;
  const buf = tab.term.buffer.active;
  if (buf.type === "alternate") {
    // Full-screen programs (editors and so on) get the whole window.
    tab.s = H;
    applyScroll(tab);
    return;
  }
  if (buf.viewportY !== buf.baseY) return; // you are reading history: leave it alone
  const screen = tab.term.element?.querySelector(".xterm-screen");
  if (!screen) return;
  const cellH = screen.clientHeight / tab.term.rows;
  const need = H + (buf.cursorY + 1) * cellH - tab.holder.clientHeight + 4;
  if (need > tab.s) {
    tab.s = need;
    applyScroll(tab);
  }
}

// Mouse wheel: scrolling down first slides the header away, then the terminal scrolls.
// Scrolling up goes through the terminal's history first, then brings the header back.
let lastWheelZoom = 0;
function wheelZoom(e) {
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheelZoom < 120) return; // one step per notch, not a flood
  lastWheelZoom = now;
  display?.stepScale(e.deltaY < 0 ? 1 : -1);
}

// How far a wheel turn moves, in pixels, and how tall one line of the terminal is.
function wheelPixels(tab, e) {
  const screen = tab.term.element?.querySelector(".xterm-screen");
  const cellH = screen ? screen.clientHeight / tab.term.rows : 16;
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= cellH;
  else if (e.deltaMode === 2) dy *= tab.holder.clientHeight;
  return { dy, cellH };
}

function handleWheel(tab, e) {
  if (e.ctrlKey) {
    wheelZoom(e);
    return false;
  }
  const H = headerHeight();
  if (!H) return true;
  const { dy } = wheelPixels(tab, e);
  if (!dy) return true;

  const buf = tab.term.buffer.active;
  if (buf.type === "alternate") return true;
  if (dy > 0 && tab.s < H) {
    tab.s += dy;
    applyScroll(tab);
    e.preventDefault();
    return false;
  }
  if (dy < 0 && buf.viewportY === 0 && tab.s > 0) {
    tab.s += dy;
    applyScroll(tab);
    e.preventDefault();
    return false;
  }
  return true;
}

// Scrolling works wherever the mouse is. Over the terminal itself xterm handles it (through
// handleWheel above). Over the welcome header, which sits on top, we do the same thing here:
// slide the header away, or scroll the terminal's history.
function scrollFromPanes(e) {
  if (e.target.closest(".xterm")) return;
  const tab = shownTerm();
  if (!tab || !tab.opened) return;
  // With the editor (or Settings) beside the terminal, scrolling over that side is its own business.
  const over = e.target.closest?.(".pane");
  if (over && over !== tab.pane) return;
  if (handleWheel(tab, e) === false) return; // the header moved (or it was a zoom)
  const { dy, cellH } = wheelPixels(tab, e);
  if (!dy) return;
  e.preventDefault();
  tab.term.scrollLines(Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / cellH)));
}

/* ---------- Tabs ---------- */

const tabs = []; // each: { id, term, fit, pane, holder, s, tabEl, labelEl, opened }
let activeId = null;
let nextId = 1;

// Give the keyboard back to whatever is on screen: the terminal or the editor.
function focusActive() {
  const tab = activeTab();
  if (!tab) return;
  if (isTerm(tab)) tab.term.focus();
  else tab.editor.focus();
}

function activeTab() {
  return tabs.find((t) => t.id === activeId);
}

function fitAndResize(tab) {
  if (!tab?.term) return; // (the AI chat tab has a terminal too)
  try {
    tab.fit.fit();
    invoke("pty_resize", { id: tab.id, cols: tab.term.cols, rows: tab.term.rows });
  } catch (_) {
    /* pane not visible yet */
  }
}

// Ctrl+Tab (dir = 1) and Ctrl+Shift+Tab (dir = -1) move between tabs.
function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activate(tabs[(i + dir + tabs.length) % tabs.length].id);
}

// The terminal that is on screen right now (or null if an editor has the whole window).
function shownTerm() {
  const t = tabs.find((x) => x.id === lastTermId && isTerm(x));
  return t && t.pane.classList.contains("active") ? t : null;
}

const splitBtn = document.getElementById("toggle-split");
const splitHandle = document.getElementById("split-handle");

// Decide which panes are showing. Normally just the active tab. With the split on (and at least
// one terminal and one editor open): the last terminal on the left, the last editor on the right.
function layoutPanes() {
  const term = tabs.find((t) => t.id === lastTermId && isTerm(t));
  const editor = tabs.find((t) => t.id === lastEditorId && !isTerm(t));
  const active = activeTab();
  const split = Boolean(splitOn && term && editor);
  panesEl.classList.toggle("split", split);
  splitHandle.hidden = !split;
  for (const t of tabs) {
    const visible = split ? t === term || t === editor : t === active;
    t.pane.classList.toggle("active", visible);
    if (split && visible) t.pane.dataset.side = isTerm(t) ? "left" : "right";
    else delete t.pane.dataset.side;
    t.tabEl.classList.toggle("shown", split && visible && t !== active);
    if (visible && t.kind === "ai" && t.opened) requestAnimationFrame(() => fitAndResize(t));
  }
  const termVisible = term && (split || active === term);
  if (termVisible) {
    heroEl.style.display = ""; // the welcome header belongs to the terminal
    if (term.pane.firstElementChild !== heroEl) term.pane.prepend(heroEl);
    applyScroll(term);
    requestAnimationFrame(() => term.opened && fitAndResize(term)); // its width may have changed
  } else {
    heroEl.style.display = "none";
  }
}

function toggleSplit() {
  splitOn = !splitOn;
  saveSetting("akin.split.v1", splitOn ? "1" : "0");
  splitBtn.classList.toggle("active", splitOn);
  if (splitOn && !tabs.some((t) => !isTerm(t))) toast("Open a file and it will show beside the terminal.", 3500);
  layoutPanes();
  focusActive();
}

function activate(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  activeId = id;
  if (isTerm(tab)) lastTermId = id;
  else lastEditorId = id;
  for (const t of tabs) t.tabEl.classList.toggle("active", t.id === id);
  layoutPanes();
  if (isTerm(tab)) {
    if (tab.opened) {
      fitAndResize(tab);
      keepCursorInView(tab);
      tab.term.focus();
    }
  } else {
    tab.editor.focus();
  }
}

// Keys that NEWB handles itself in a terminal (copy and paste, tabs, panels, shortcuts). Returns the
// function xterm asks for each key: false means NEWB took it, true means pass it on to the shell.
function termKeyHandler(term, id) {
  return (e) => {
    // Copy and paste first: Ctrl+C copies when text is selected, Ctrl+V pastes.
    const clip = handleClipboardKey(e, term, toast);
    if (clip === false) return false;

    if (e.type === "keydown" && e.ctrlKey && !e.altKey && e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
      return false;
    }

    if (e.type === "keydown" && e.ctrlKey && !e.altKey && !e.shiftKey && e.key === ",") {
      e.preventDefault();
      openSettings();
      return false;
    }

    // Interface size: Ctrl +, Ctrl -, Ctrl 0
    if (e.type === "keydown" && e.ctrlKey && !e.altKey && display) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        display.stepScale(1);
        return false;
      }
      if (e.key === "-") {
        e.preventDefault();
        display.stepScale(-1);
        return false;
      }
      if (e.key === "0" && !e.shiftKey) {
        e.preventDefault();
        display.resetScale();
        return false;
      }
    }
    // Ctrl+Space: the quick Ask bar (only when the AI helpers are on).
    if (e.type === "keydown" && e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "Space" && aiApi?.enabled()) {
      e.preventDefault();
      aiApi.openAsk();
      return false;
    }
    if (e.type !== "keydown" || !e.ctrlKey || !e.shiftKey) return true;
    const k = e.key.toLowerCase();
    if (k === "t") {
      e.preventDefault();
      newTab();
      return false;
    }
    if (k === "w") {
      e.preventDefault();
      closeTab(id);
      return false;
    }
    if (k === "l") {
      e.preventDefault();
      cycleLogo();
      return false;
    }
    if (k === "d") {
      e.preventDefault();
      drawersApi?.open("tree");
      return false;
    }
    if (k === "s") {
      e.preventDefault();
      drawersApi?.toggle("tree");
      return false;
    }
    if (k === "k") {
      e.preventDefault();
      drawersApi?.toggle("keys");
      return false;
    }
    if (k === "e") {
      e.preventDefault();
      explorerApi?.toggle();
      return false;
    }
    if (k === "f") {
      e.preventDefault();
      explorerApi?.showSearch();
      return false;
    }
    if (k === "b") {
      e.preventDefault();
      toggleSplit();
      return false;
    }
    if (k === "p") {
      e.preventDefault();
      themePicker?.open();
      return false;
    }
    if (k === "a" && aiApi?.enabled()) {
      e.preventDefault();
      aiApi.startChat();
      return false;
    }
    if (k === "i") return false; // not used by NEWB: nothing is typed into the shell either
    return true;
    };
}

async function newTab() {
  const id = nextId++;

  const pane = document.createElement("div");
  pane.className = "pane";
  panesEl.appendChild(pane);
  const holder = document.createElement("div");
  holder.className = "term-holder";
  pane.appendChild(holder);

  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  const labelEl = document.createElement("span");
  labelEl.className = "label";
  labelEl.textContent = `Terminal ${id}`;
  const closeEl = document.createElement("button");
  closeEl.className = "close";
  closeEl.append(icon("close"));
  closeEl.title = "Close tab (Ctrl+Shift+W)";
  tabEl.append(labelEl, closeEl);
  tabsEl.appendChild(tabEl);

  const term = new Terminal({
    fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace',
    fontSize: display ? display.state.font : 14,
    cursorBlink: prefs.get("cursorBlink"),
    cursorStyle: prefs.get("cursorStyle"),
    scrollback: prefs.get("scrollback"),
    theme: THEME,
    allowProposedApi: true, // needed to highlight blanks in dropped commands
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const tab = { id, kind: "term", term, fit, pane, holder, s: 0, tabEl, labelEl, opened: false };
  tabs.push(tab);

  tabEl.addEventListener("click", () => activate(id));
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  // Show the pane first: xterm can only measure itself when it is visible.
  activate(id);
  term.open(holder);
  tab.opened = true;
  fit.fit();

  term.onData((data) => {
    // Blanks in a dropped command may want this key (typing, Tab, Enter...).
    if (handleTemplateKey(tab, data, templateIO(tab))) {
      keepCursorInView(tab);
      return;
    }
    invoke("pty_write", { id, data });
    keepCursorInView(tab);
  });
  term.attachCustomWheelEventHandler((e) => handleWheel(tab, e));
  term.onWriteParsed(() => {
    keepCursorInView(tab);
    if (tab.template) refreshTemplate(tab);
  });
  term.onCursorMove(() => keepCursorInView(tab));
  term.buffer.onBufferChange(() => keepCursorInView(tab));
  term.onTitleChange((title) => {
    if (title) labelEl.textContent = title;
  });

  term.attachCustomKeyEventHandler(termKeyHandler(term, id));

  // Text layout: print the logo and system info at the top of the tab, above the prompt.
  if (heroEl.dataset.layout === "text") {
    await infoPromise;
    if (infoModel) {
      try {
        await printBanner(term, infoModel, { style: textLogoStyle(), animate: !bannerShown });
      } catch (_) {
        /* no banner is better than a broken start */
      }
      bannerShown = true;
    }
  }

  await invoke("pty_spawn", { id, cols: term.cols, rows: term.rows });
  term.focus();
}

// Save an editor tab. Returns true if it worked.
async function saveEditor(tab) {
  try {
    await invoke("write_text_file", { path: tab.path, text: tab.editor.getText() });
    tab.editor.markSaved();
    toast(`Saved ${tab.name}`, 1500);
    explorerApi?.noteSaved(tab.path);
    if (tab.path.includes("/newb/themes/")) customThemes?.rescan(true); // recolour straight away
    return true;
  } catch (err) {
    toast(`Couldn't save ${tab.name}: ${err}`, 6000);
    return false;
  }
}

// Open a file in an editor tab (or jump to it if it is already open).
async function openFile(path, at) {
  const existing = tabs.find((t) => !isTerm(t) && t.path === path);
  if (existing) {
    activate(existing.id);
    if (at) existing.editor.goTo(at.line, at.col, at.len);
    return;
  }
  let file;
  try {
    file = await invoke("read_text_file", { path });
  } catch (err) {
    toast(String(err), 6000);
    return;
  }
  const id = nextId++;
  const name = path.slice(path.lastIndexOf("/") + 1);

  const pane = document.createElement("div");
  pane.className = "pane";
  panesEl.appendChild(pane);
  const holder = document.createElement("div");
  holder.className = "editor-host";
  pane.appendChild(holder);

  const tabEl = document.createElement("div");
  tabEl.className = "tab editor-tab";
  tabEl.title = path;
  const labelEl = el("span", "label", name);
  const dirtyEl = el("span", "tab-dirty");
  dirtyEl.title = "Not saved yet (Ctrl+S)";
  dirtyEl.append(icon("edit"));
  const closeEl = document.createElement("button");
  closeEl.className = "close";
  closeEl.append(icon("close"));
  closeEl.title = "Close tab (Ctrl+Shift+W)";
  tabEl.append(fileIcon(name, false), labelEl, dirtyEl, closeEl);
  tabsEl.appendChild(tabEl);

  const tab = { id, kind: "editor", path, name, pane, holder, s: 0, tabEl, labelEl, opened: true, dirty: false };
  tab.editor = createEditor({
    host: holder,
    path,
    text: file.text,
    vim: display?.state.editor === "vim",
    tabSize: prefs.get("tabSize"),
    wordWrap: prefs.get("wordWrap"),
    onDirty: (dirty) => {
      tab.dirty = dirty;
      tabEl.classList.toggle("dirty", dirty);
    },
    onSave: () => saveEditor(tab),
    onClose: () => closeTab(id),
  });
  tabs.push(tab);
  tabEl.addEventListener("click", () => activate(id));
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });
  activate(id);
  if (at) tab.editor.goTo(at.line, at.col, at.len);
}

// The Settings page lives in a tab of its own (only one). It borrows the editor tab's plumbing,
// so it gets a do-nothing "editor" with the few methods the rest of the code calls.
function openSettings(sectionId) {
  const existing = tabs.find((t) => t.kind === "settings");
  if (existing) {
    activate(existing.id);
    if (sectionId) existing.view.show(sectionId);
    return;
  }
  const id = nextId++;
  const pane = document.createElement("div");
  pane.className = "pane";
  panesEl.appendChild(pane);
  const holder = document.createElement("div");
  holder.className = "settings-host";
  pane.appendChild(holder);

  const tabEl = document.createElement("div");
  tabEl.className = "tab editor-tab";
  const labelEl = el("span", "label", "Settings");
  const closeEl = document.createElement("button");
  closeEl.className = "close";
  closeEl.append(icon("close"));
  closeEl.title = "Close tab (Ctrl+Shift+W)";
  tabEl.append(icon("settings"), labelEl, closeEl);
  tabsEl.appendChild(tabEl);

  const view = createSettingsView({
    host: holder,
    display,
    toast,
    welcome: welcomeApi,
    projects: explorerApi?.repos,
    version: pkg.version,
    themes: customThemes,
    logo: logoApi,
    ai: aiApi,
    openAiChat: () => aiApi?.startChat(),
    showThemesFolder: () => {
      const folder = customThemes?.dir();
      if (folder) typeText(`cd ${shellPath(folder, homeDir)}`);
    },
    showFontsFolder: () => {
      const folder = logoApi?.dir();
      if (folder) typeText(`cd ${shellPath(folder, homeDir)}`);
    },
  });
  const tab = {
    id, kind: "settings", path: null, name: "Settings", pane, holder, s: 0, tabEl, labelEl, opened: true, dirty: false, view,
    editor: { focus() {}, insertText() {}, goTo() {}, setVim() {}, setTheme() {}, setLayout() {}, getText: () => "", markSaved() {}, destroy: () => view.destroy() },
  };
  tabs.push(tab);
  tabEl.addEventListener("click", () => activate(id));
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });
  activate(id);
  if (sectionId) view.show(sectionId);
}

// The AI chat: Claude Code or Codex running in a tab of its own, started in your folder with the
// permission level you picked. It sits on the "editor" side, so with the split on it shows beside
// your terminal. Like the Settings tab it borrows the editor tab's plumbing (a small stand-in "editor").
async function openAiTab({ tool, name, args, cwd, label }) {
  const existing = tabs.find((t) => t.kind === "ai");
  if (existing) {
    activate(existing.id);
    toast("The AI chat is already open. Close it (Ctrl+Shift+W) to start again with new settings.", 4000);
    return;
  }
  const id = nextId++;
  const pane = document.createElement("div");
  pane.className = "pane";
  panesEl.appendChild(pane);
  const holder = document.createElement("div");
  holder.className = "term-holder ai-holder";
  pane.appendChild(holder);

  const tabEl = document.createElement("div");
  tabEl.className = "tab editor-tab ai-tab";
  const labelEl = el("span", "label", label);
  const closeEl = document.createElement("button");
  closeEl.className = "close";
  closeEl.append(icon("close"));
  closeEl.title = "Close tab (Ctrl+Shift+W)";
  tabEl.append(icon("spark"), labelEl, closeEl);
  tabsEl.appendChild(tabEl);

  const term = new Terminal({
    fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace',
    fontSize: display ? display.state.font : 14,
    cursorBlink: prefs.get("cursorBlink"),
    cursorStyle: prefs.get("cursorStyle"),
    scrollback: prefs.get("scrollback"),
    theme: { ...THEME },
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const tab = {
    id, kind: "ai", term, fit, pane, holder, s: 0, tabEl, labelEl, opened: false, path: null, dirty: false, tool,
    editor: {
      focus: () => term.focus(),
      insertText: (text) => invoke("pty_write", { id, data: text }),
      goTo() {}, setVim() {}, setLayout() {}, getText: () => "", markSaved() {},
      setTheme: () => { term.options.theme = { ...THEME }; },
      destroy() {
        invoke("pty_kill", { id }).catch(() => {});
        try { term.dispose(); } catch (_) { /* already gone */ }
      },
    },
  };
  tabs.push(tab);
  tabEl.addEventListener("click", () => activate(id));
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  activate(id);
  if (!splitOn && tabs.some((t) => isTerm(t))) toggleSplit(); // beside the terminal, where you can see both
  term.open(holder);
  tab.opened = true;
  fit.fit();
  term.onData((data) => invoke("pty_write", { id, data }));
  term.onTitleChange((title) => { if (title) labelEl.textContent = `${title.slice(0, 28)}`; });
  term.attachCustomKeyEventHandler(termKeyHandler(term, id));
  new ResizeObserver(() => { if (tab.opened && pane.classList.contains("active")) fitAndResize(tab); }).observe(holder);

  try {
    await invoke("pty_spawn", { id, cols: term.cols, rows: term.rows, tool, args, cwd });
    toast(`${name} started in ${cwd ? cwd.replace(homeDir, "~") : "your home folder"}.`, 3500);
  } catch (err) {
    toast(`Couldn't start ${name}: ${err}`, 6000);
    closeTab(id, true);
    return;
  }
  term.focus();
}

// Ask what to do with unsaved changes. Returns true if the tab may close.
async function okToClose(tab) {
  if (!tab.dirty) return true;
  const pick = await askChoice({
    title: `Save changes to ${tab.name}?`,
    message: "If you don't save, your changes will be lost.",
    choices: [
      { id: "save", label: "Save", primary: true },
      { id: "discard", label: "Don't save", danger: true },
      { id: "cancel", label: "Cancel", cancel: true },
    ],
  });
  if (pick === "save") return saveEditor(tab);
  return pick === "discard";
}

async function closeTab(id, alreadyExited = false) {
  let tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  if (!isTerm(tab) && !(await okToClose(tab))) return;

  const i = tabs.findIndex((t) => t.id === id); // it may have moved while we asked
  if (i === -1) return;
  tab = tabs[i];
  if (isTerm(tab)) {
    if (!alreadyExited) invoke("pty_kill", { id });
    cancelTemplate(tab);
    if (heroEl.parentElement === tab.pane) panesEl.after(heroEl); // rescue the header before the pane goes
    tab.term.dispose();
  } else {
    tab.editor.destroy();
  }
  tab.pane.remove();
  tab.tabEl.remove();
  tabs.splice(i, 1);
  if (lastTermId === id) lastTermId = tabs.find(isTerm)?.id ?? null;
  if (lastEditorId === id) lastEditorId = tabs.find((t) => !isTerm(t))?.id ?? null;

  if (tabs.length === 0) {
    invoke("quit_app");
  } else if (activeId === id) {
    activate(tabs[Math.max(0, i - 1)].id);
  } else {
    layoutPanes();
  }
}

// A file or folder was renamed in Files/Repos: open editor tabs follow it.
function pathChanged(from, to) {
  for (const t of tabs) {
    if (isTerm(t) || !t.path || !(t.path === from || t.path.startsWith(`${from}/`))) continue;
    t.path = to + t.path.slice(from.length);
    t.name = t.path.slice(t.path.lastIndexOf("/") + 1);
    t.labelEl.textContent = t.name;
    t.tabEl.title = t.path;
  }
}

// A file or folder went to the trash: close its editor tabs (nothing left to save to).
function pathTrashed(path) {
  for (const t of tabs.filter((x) => !isTerm(x) && x.path && (x.path === path || x.path.startsWith(`${path}/`)))) {
    t.dirty = false;
    closeTab(t.id);
  }
}

// The terminal that commands, paths and "cd" should go to. If you are in an editor, that is the
// last terminal you used (we switch to it).
function terminalForAction() {
  const tab = activeTab();
  if (isTerm(tab)) return tab;
  const last = tabs.find((t) => t.id === lastTermId);
  if (!last) {
    toast("Open a terminal tab first (Ctrl+Shift+T).", 3000);
    return null;
  }
  activate(last.id);
  return last;
}

async function start() {
  // The first-run tour (only ever starts by itself on a brand new install, so ask before anything is saved).
  tourApi = initTour({ prepare: () => drawersApi?.closeInstant() });
  tourApi.maybeStart();
  document.getElementById("take-tour").addEventListener("click", () => tourApi.start());

  // Listen first, so no shell output is missed.
  await listen("pty-output", (e) => {
    const t = tabs.find((x) => x.id === e.payload.id);
    if (t?.term) t.term.write(e.payload.data);
  });
  await listen("pty-exit", (e) => closeTab(e.payload.id, true));

  display = initDisplay({
    toast,
    onFontChange: (px) => {
      for (const t of tabs) {
        if (!t.term) continue; // editors follow the --term-font size on their own
        t.term.options.fontSize = px;
        if (t.opened) fitAndResize(t);
      }
    },
    onEditorChange: (isVim) => {
      for (const t of tabs) if (!isTerm(t)) t.editor.setVim(isVim);
    },
  });
  // Your own themes: a folder that is watched, so changes show up while NEWB is running.
  customThemes = initCustomThemes({
    toast,
    openForEdit: async (path) => {
      await openFile(path);
      if (!splitOn) toggleSplit(); // terminal beside the file, so you see the colours change as you save
    },
  });
  customThemes.start();
  themePicker = initThemePicker({ toast, focusBack: focusActive });
  // Everything that is drawn in JavaScript follows the theme.
  onThemeChange((theme) => {
    setLogoColors({ code: hexToRgb(theme.green), shade: hexToRgb(theme.ink), dots: hexToRgb(theme.accent) });
    for (const t of tabs) {
      if (isTerm(t)) t.term.options.theme = { ...THEME };
      else t.editor.setTheme(theme);
    }
    if (infoModel) renderWeb(infoModel, infoEls);
    if (asciiLogo.style) asciiLogo.setStyle(asciiLogo.style); // redraw in the new colours
  }, true);
  prefs.subscribe((key, value) => {
    for (const t of tabs) {
      if (t.term) {
        if (key === "cursorStyle" && !t.template) t.term.options.cursorStyle = value;
        if (key === "cursorBlink") t.term.options.cursorBlink = value;
        if (key === "scrollback") t.term.options.scrollback = value;
      } else if (key === "tabSize" || key === "wordWrap") {
        t.editor.setLayout(prefs.get("tabSize"), prefs.get("wordWrap"));
      }
    }
  });
  document.getElementById("open-settings").addEventListener("click", () => {
    openSettings();
  });

  // Shortcuts when the keyboard is NOT on the terminal (the terminal has its own handler above).
  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".xterm") || !e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    } else if (e.code === "Space" && !e.shiftKey && aiApi?.enabled()) {
      e.preventDefault();
      aiApi.openAsk();
    } else if (e.shiftKey && k === "a" && aiApi?.enabled()) {
      e.preventDefault();
      aiApi.startChat();
    } else if (e.shiftKey && "wtelfbp".includes(k) && k.length === 1) {
      e.preventDefault();
      if (k === "t") newTab();
      else if (k === "w") closeTab(activeId);
      else if (k === "e") explorerApi?.toggle();
      else if (k === "f") explorerApi?.showSearch();
      else if (k === "b") toggleSplit();
      else if (k === "l") cycleLogo();
      else if (k === "p") themePicker?.open();
    } else if (e.key === "," && !e.shiftKey) {
      e.preventDefault();
      openSettings();
    } else if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      display.stepScale(1);
    } else if (e.key === "-") {
      e.preventDefault();
      display.stepScale(-1);
    } else if (e.key === "0" && !e.shiftKey) {
      e.preventDefault();
      display.resetScale();
    }
  });
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey && !e.target.closest?.(".xterm")) wheelZoom(e);
    },
    { passive: false },
  );

  try { homeDir = await invoke("home_dir"); } catch (_) { /* paths just won't be shortened */ }

  // One drag engine for both panels (commands and file paths).
  const dragger = createDragger({
    panesEl,
    // `target` says where it landed: { kind: "terminal" | "fav" | "cat", el }.
    onDrop: (payload, target, at) => {
      if (target.kind === "terminal" && at && panesEl.classList.contains("split")) {
        const r = panesEl.getBoundingClientRect();
        const id = at.x > r.left + r.width * splitRatio ? lastEditorId : lastTermId;
        if (id != null && id !== activeId) activate(id);
      }
      if (payload.kind === "cmd") {
        if (target.kind === "terminal") insertCommand(payload.cmd, payload.risky);
        else if (target.kind === "fav") drawersApi?.addFav(payload.cmd);
        else if (target.kind === "cat") drawersApi?.addToCategory(target.el.dataset.catid, payload.cmd);
      } else if (target.kind === "terminal") {
        insertPath(payload.path);
      }
    },
    onStart: () => asciiLogo.pause(), // keep the screen quiet so the drag stays smooth
    onEnd: () => asciiLogo.resume(),
    onLeaveSource: () => drawersApi?.closeInstant(),
  });

  // The AI helpers (opt-in). Nothing is looked for or started unless they are turned on in Settings.
  aiApi = initAi({
    toast,
    openChat: openAiTab,
    typeText,
    getFolder: async () => {
      const tab = tabs.find((t) => t.id === lastTermId);
      return tab ? (await cwdOf(tab)) || null : null;
    },
  });
  if (aiApi.enabled()) aiApi.detect();
  document.getElementById("open-ai").addEventListener("click", () => aiApi.startChat());

  drawersApi = initDrawers({
    toast,
    focusTerminal: focusActive,
    panesEl,
    dragger,
    onExplain: (cmd) => aiApi?.explain(cmd),
  });
  initContextMenu({
    panesEl,
    getTerm: () => (isTerm(activeTab()) ? activeTab().term : null),
    send: (data) => {
      const tab = activeTab();
      if (isTerm(tab)) invoke("pty_write", { id: tab.id, data });
    },
    toast,
  });
  explorerApi = await initExplorer({
    dragger,
    getActiveTabId: () => (isTerm(activeTab()) ? activeId : lastTermId),
    onCd: async (path) => {
      const tab = terminalForAction();
      if (tab) typeText(`cd ${shellPath(path, homeDir, await cwdOf(tab))}`);
    },
    getActiveFilePath: () => (activeTab() && !isTerm(activeTab()) ? activeTab().path : null),
    onOpenFile: openFile,
    onPathChanged: pathChanged,
    onPathTrashed: pathTrashed,
    toast,
  });

  // Clicking anywhere in the terminal area gives the terminal the keyboard (except on the info
  // text, which you may want to select and copy).
  panesEl.addEventListener("pointerdown", (e) => {
    // with two panes showing, the one you click becomes the active one
    const pane = e.target.closest(".pane");
    const hit = pane && tabs.find((t) => t.pane === pane);
    if (hit && hit.id !== activeId) activate(hit.id);
    if (e.target.closest("#info")) return;
    setTimeout(focusActive, 0);
  });

  panesEl.addEventListener("wheel", scrollFromPanes, { passive: false });

  newTabBtn.addEventListener("click", newTab);

  // Editor beside terminal: the button, the remembered setting, and the draggable divider.
  splitOn = loadSetting("akin.split.v1") === "1";
  splitRatio = Math.min(0.8, Math.max(0.2, parseFloat(loadSetting("akin.split.ratio")) || 0.5));
  panesEl.style.setProperty("--split", `${splitRatio * 100}%`);
  splitBtn.classList.toggle("active", splitOn);
  splitBtn.addEventListener("click", toggleSplit);
  splitHandle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    splitHandle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev) => {
      const r = panesEl.getBoundingClientRect();
      splitRatio = Math.min(0.8, Math.max(0.2, (ev.clientX - r.left) / r.width));
      panesEl.style.setProperty("--split", `${splitRatio * 100}%`);
      const term = shownTerm();
      if (term) requestAnimationFrame(() => fitAndResize(term));
    };
    const up = () => {
      splitHandle.removeEventListener("pointermove", move);
      splitHandle.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
      saveSetting("akin.split.ratio", String(splitRatio));
    };
    splitHandle.addEventListener("pointermove", move);
    splitHandle.addEventListener("pointerup", up);
  });
  // After clicking a control, hand the keyboard back to the terminal so shortcuts keep working.
  const focusTerminal = focusActive;
  document.getElementById("ascii-logo").addEventListener("click", () => { cycleLogo(); focusTerminal(); });

  // What the logo says and which font it uses (chosen in Settings > Appearance).
  logoApi = initLogo({ onChange: () => asciiLogo.refresh() });

  mountIcons(); // fill in the little pictures on the buttons

  const savedLogo = LOGOS.findIndex((l) => l.id === loadSetting("akin.logo.v2"));
  setLogo(savedLogo === -1 ? 0 : savedLogo, false);
  const savedLayout = LAYOUTS.findIndex((l) => l.id === loadSetting("akin.layout.v4"));
  setLayout(savedLayout === -1 ? 0 : savedLayout, false);

  new ResizeObserver(() => {
    const tab = shownTerm();
    if (tab && tab.opened) fitAndResize(tab);
  }).observe(panesEl);
  // When the header changes size (window resize, layout change), keep everything lined up.
  new ResizeObserver(() => {
    const tab = shownTerm();
    if (!tab) return;
    applyScroll(tab);
    keepCursorInView(tab);
  }).observe(heroEl);

  infoPromise = loadInfo();
  await newTab();
}

start();
