// AKIN: the window side.
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
import { AsciiLogo, ASCII_STYLES } from "./asciilogo.js";

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
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
}

// Logo styles. "plain" and "shimmer" are the traced shape; the others are drawn from characters.
const LOGOS = [
  { id: "code", name: "ASCII Code" },
  { id: "dots", name: "Dot Matrix" },
  { id: "shade", name: "ASCII Shade" },
  { id: "plain", name: "Plain" },
  { id: "shimmer", name: "Shimmer" },
];
let logoIndex = 0;

function setLogo(i, announce) {
  logoIndex = (i + LOGOS.length) % LOGOS.length;
  const logo = LOGOS[logoIndex];
  heroEl.dataset.logo = logo.id;
  asciiLogo.setStyle(ASCII_STYLES.includes(logo.id) ? logo.id : null);
  saveSetting("akin.logo.v2", logo.id);
  if (announce) toast(`Logo style: ${logo.name} (${logoIndex + 1} of ${LOGOS.length}). Click the logo for the next one.`);
}
function textLogoStyle() {
  return LOGOS[logoIndex].id === "shade" ? "shade" : "code";
}
function cycleLogo() {
  if (heroEl.dataset.layout === "text") {
    // The printed banner can use the two character styles. New tabs pick up the change.
    const next = textLogoStyle() === "code" ? "shade" : "code";
    setLogo(LOGOS.findIndex((l) => l.id === next), false);
    toast(`Logo style: ${LOGOS[logoIndex].name}. Open a new tab (Ctrl+Shift+T) to see it.`);
    return;
  }
  setLogo(logoIndex + 1, true);
}

// Layouts for the logo and system info.
const LAYOUTS = [
  { id: "text", name: "Text", hint: "logo and info print at the top of each new tab and scroll away like normal output. Press Ctrl+Shift+T to see it." },
  { id: "pinned", name: "Pinned", hint: "animated logo and info stay at the top of the window." },
  { id: "logo", name: "Logo only", hint: "just the animated logo, pinned." },
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
  saveSetting("akin.layout.v3", layout.id);
  if (announce) toast(`Layout: ${layout.name} (${layoutIndex + 1} of ${LAYOUTS.length}): ${layout.hint}`);
}
function cycleLayout() {
  setLayout(layoutIndex + 1, true);
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

/* ---------- Tabs ---------- */

const tabs = []; // each: { id, term, fit, pane, tabEl, labelEl, opened }
let activeId = null;
let nextId = 1;

function activeTab() {
  return tabs.find((t) => t.id === activeId);
}

function fitAndResize(tab) {
  try {
    tab.fit.fit();
    invoke("pty_resize", { id: tab.id, cols: tab.term.cols, rows: tab.term.rows });
  } catch (_) {
    /* pane not visible yet */
  }
}

function activate(id) {
  activeId = id;
  for (const t of tabs) {
    const on = t.id === id;
    t.tabEl.classList.toggle("active", on);
    t.pane.classList.toggle("active", on);
  }
  const tab = activeTab();
  if (tab && tab.opened) {
    fitAndResize(tab);
    tab.term.focus();
  }
}

async function newTab() {
  const id = nextId++;

  const pane = document.createElement("div");
  pane.className = "pane";
  panesEl.appendChild(pane);

  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  const labelEl = document.createElement("span");
  labelEl.className = "label";
  labelEl.textContent = `Terminal ${id}`;
  const closeEl = document.createElement("button");
  closeEl.className = "close";
  closeEl.textContent = "×";
  closeEl.title = "Close tab (Ctrl+Shift+W)";
  tabEl.append(labelEl, closeEl);
  tabsEl.appendChild(tabEl);

  const term = new Terminal({
    fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace',
    fontSize: 14,
    cursorBlink: true,
    scrollback: 5000,
    theme: THEME,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const tab = { id, term, fit, pane, tabEl, labelEl, opened: false };
  tabs.push(tab);

  tabEl.addEventListener("click", () => activate(id));
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  // Show the pane first: xterm can only measure itself when it is visible.
  activate(id);
  term.open(pane);
  tab.opened = true;
  fit.fit();

  term.onData((data) => invoke("pty_write", { id, data }));
  term.onTitleChange((title) => {
    if (title) labelEl.textContent = title;
  });

  term.attachCustomKeyEventHandler((e) => {
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
    if (k === "c") {
      e.preventDefault();
      const sel = term.getSelection();
      if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
      return false;
    }
    if (k === "l") {
      e.preventDefault();
      cycleLogo();
      return false;
    }
    if (k === "i") {
      e.preventDefault();
      cycleLayout();
      return false;
    }
    if (k === "v") {
      // Let the browser paste normally; xterm picks it up.
      return false;
    }
    return true;
  });

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

function closeTab(id, alreadyExited = false) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i === -1) return;
  const tab = tabs[i];
  if (!alreadyExited) invoke("pty_kill", { id });
  tab.term.dispose();
  tab.pane.remove();
  tab.tabEl.remove();
  tabs.splice(i, 1);

  if (tabs.length === 0) {
    invoke("quit_app");
  } else if (activeId === id) {
    activate(tabs[Math.max(0, i - 1)].id);
  }
}

async function start() {
  // Listen first, so no shell output is missed.
  await listen("pty-output", (e) => {
    const t = tabs.find((x) => x.id === e.payload.id);
    if (t) t.term.write(e.payload.data);
  });
  await listen("pty-exit", (e) => closeTab(e.payload.id, true));

  newTabBtn.addEventListener("click", newTab);
  document.querySelector("#hero .logo").addEventListener("click", cycleLogo);
  document.getElementById("ascii-logo").addEventListener("click", cycleLogo);
  document.getElementById("toggle-info").addEventListener("click", cycleLayout);

  const savedLogo = LOGOS.findIndex((l) => l.id === loadSetting("akin.logo.v2"));
  setLogo(savedLogo === -1 ? 0 : savedLogo, false);
  const savedLayout = LAYOUTS.findIndex((l) => l.id === loadSetting("akin.layout.v3"));
  setLayout(savedLayout === -1 ? 0 : savedLayout, false);

  new ResizeObserver(() => {
    const tab = activeTab();
    if (tab && tab.opened) fitAndResize(tab);
  }).observe(panesEl);

  infoPromise = loadInfo();
  await newTab();
}

start();
