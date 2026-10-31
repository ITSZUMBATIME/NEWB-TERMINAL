// AKIN: the window side.
// Shows a terminal (xterm.js) for each tab and connects it to a real shell
// that the Rust side runs.

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./style.css";

const tabsEl = document.getElementById("tabs");
const panesEl = document.getElementById("panes");
const newTabBtn = document.getElementById("new-tab");

const THEME = {
  background: "#14161a",
  foreground: "#c8ccd4",
  cursor: "#c8ccd4",
  selectionBackground: "#3a4150",
  black: "#1b1e24",
  red: "#e5484d",
  green: "#3fb950",
  yellow: "#e0a63a",
  blue: "#4ea1ff",
  magenta: "#b57bee",
  cyan: "#39c5cf",
  white: "#c8ccd4",
  brightBlack: "#5b616b",
  brightRed: "#ff6369",
  brightGreen: "#56d364",
  brightYellow: "#f2c14e",
  brightBlue: "#79b8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#ffffff",
};

const tabs = []; // each: { id, term, fit, pane, tabEl, labelEl }
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
    if (k === "v") {
      // Let the browser paste normally; xterm picks it up.
      return false;
    }
    return true;
  });

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
  new ResizeObserver(() => {
    const tab = activeTab();
    if (tab && tab.opened) fitAndResize(tab);
  }).observe(panesEl);

  await newTab();
}

start();
