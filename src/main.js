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
import { initAbout } from "./about.js";
import { handleClipboardKey, initContextMenu } from "./clipboard.js";
import { icon, mountIcons } from "./icons.js";
import { createDragger } from "./drag.js";
import { shellPath, segmented } from "./ui.js";
import { parseSpec, startTemplate, handleTemplateKey, cancelTemplate, fillBlank, refresh as refreshTemplate } from "./template.js";
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
let logoSeg = null;

function setLogo(i, announce) {
  logoIndex = (i + LOGOS.length) % LOGOS.length;
  const logo = LOGOS[logoIndex];
  heroEl.dataset.logo = logo.id;
  asciiLogo.setStyle(logo.id);
  logoSeg?.set(logo.id);
  saveSetting("akin.logo.v2", logo.id);
  if (announce) toast(`Logo: ${logo.name}.`, 2000);
}
function textLogoStyle() {
  return LOGOS[logoIndex].id === "shade" ? "shade" : "code";
}
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
let layoutSeg = null;
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
  layoutSeg?.set(layout.id);
  saveSetting("akin.layout.v4", layout.id);
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
let aboutApi = null;
let display = null;
let explorerApi = null;
let homeDir = "";

const templateIO = (tab) => ({
  send: (text) => invoke("pty_write", { id: tab.id, data: text }),
  toast,
});

// Type a command at the prompt (never presses Enter). Commands with blanks start the fill-in session.
function insertCommand(cmd, risky) {
  const tab = activeTab();
  if (!tab || !tab.opened) return;
  startTemplate(tab, parseSpec(cmd), templateIO(tab));
  keepCursorInView(tab);
  tab.term.focus();
  if (risky) toast("Careful: this one can delete or change things. Check it, then press Enter.");
}

// Type plain text (like "cd ~/Projects") at the prompt. Never presses Enter.
function typeText(text) {
  const tab = activeTab();
  if (!tab || !tab.opened) return;
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
  if (!tab || !tab.opened) return;
  const text = shellPath(path, homeDir, await cwdOf(tab));
  const io = templateIO(tab);
  if (!fillBlank(tab, text, io)) io.send(text + " ");
  keepCursorInView(tab);
  tab.term.focus();
}

/* ---------- Scrolling header ----------
   The logo/info header sits at the top of the active tab, above the terminal.
   `tab.s` is how far it has scrolled up (0 = fully showing, header height = gone). */

const headerHeight = () => heroEl.offsetHeight; // 0 when the layout hides it

function applyScroll(tab) {
  const H = headerHeight();
  tab.s = Math.max(0, Math.min(H, tab.s));
  if (tab.id === activeId) heroEl.style.transform = `translateY(${-tab.s}px)`;
  tab.holder.style.transform = `translateY(${H - tab.s}px)`;
}

// As output fills the screen, slide the header away so the cursor never gets pushed off the bottom.
function keepCursorInView(tab) {
  const H = headerHeight();
  if (!H || tab.id !== activeId || !tab.opened) return;
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
  const tab = activeTab();
  if (!tab || !tab.opened) return;
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

// Ctrl+Tab (dir = 1) and Ctrl+Shift+Tab (dir = -1) move between tabs.
function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activate(tabs[(i + dir + tabs.length) % tabs.length].id);
}

function activate(id) {
  activeId = id;
  for (const t of tabs) {
    const on = t.id === id;
    t.tabEl.classList.toggle("active", on);
    t.pane.classList.toggle("active", on);
  }
  const tab = activeTab();
  if (tab) {
    tab.pane.prepend(heroEl); // the header travels with the active tab
    applyScroll(tab);
  }
  if (tab && tab.opened) {
    fitAndResize(tab);
    keepCursorInView(tab);
    tab.term.focus();
  }
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
    cursorBlink: true,
    scrollback: 5000,
    theme: THEME,
    allowProposedApi: true, // needed to highlight blanks in dropped commands
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const tab = { id, term, fit, pane, holder, s: 0, tabEl, labelEl, opened: false };
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

  term.attachCustomKeyEventHandler((e) => {
    // Copy and paste first: Ctrl+C copies when text is selected, Ctrl+V pastes.
    const clip = handleClipboardKey(e, term, toast);
    if (clip === false) return false;

    if (e.type === "keydown" && e.ctrlKey && !e.altKey && e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
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
    if (k === "i") return false; // not used by NEWB: nothing is typed into the shell either
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
  cancelTemplate(tab);
  if (heroEl.parentElement === tab.pane) panesEl.after(heroEl); // rescue the header before the pane goes
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

  display = initDisplay({
    toast,
    onFontChange: (px) => {
      for (const t of tabs) {
        t.term.options.fontSize = px;
        if (t.opened) fitAndResize(t);
      }
    },
  });
  // Shortcuts when the keyboard is NOT on the terminal (the terminal has its own handler above).
  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".xterm") || !e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    } else if (e.shiftKey && "wtel".includes(k) && k.length === 1) {
      e.preventDefault();
      if (k === "t") newTab();
      else if (k === "w") closeTab(activeId);
      else if (k === "e") explorerApi?.toggle();
      else if (k === "l") cycleLogo();
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
    onDrop: (payload, target) => {
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

  drawersApi = initDrawers({
    toast,
    focusTerminal: () => activeTab()?.term.focus(),
    panesEl,
    dragger,
  });
  aboutApi = initAbout({
    openCheats: () => drawersApi.open("tree"),
    openKeys: () => drawersApi.open("keys"),
  });
  initContextMenu({
    panesEl,
    getTerm: () => activeTab()?.term,
    send: (data) => {
      const tab = activeTab();
      if (tab) invoke("pty_write", { id: tab.id, data });
    },
    toast,
  });
  explorerApi = await initExplorer({
    dragger,
    getActiveTabId: () => activeId,
    onCd: async (path) => {
      const tab = activeTab();
      if (tab) typeText(`cd ${shellPath(path, homeDir, await cwdOf(tab))}`);
    },
    toast,
  });

  // Clicking anywhere in the terminal area gives the terminal the keyboard (except on the info
  // text, which you may want to select and copy).
  panesEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#info")) return;
    setTimeout(() => activeTab()?.term.focus(), 0);
  });

  panesEl.addEventListener("wheel", scrollFromPanes, { passive: false });

  newTabBtn.addEventListener("click", newTab);
  // After clicking a control, hand the keyboard back to the terminal so shortcuts keep working.
  const focusTerminal = () => activeTab()?.term.focus();
  document.getElementById("ascii-logo").addEventListener("click", () => { cycleLogo(); focusTerminal(); });

  // Welcome screen and logo choices live in the Display panel.
  layoutSeg = segmented(
    document.getElementById("seg-layout"),
    LAYOUTS.map((l) => ({ id: l.id, label: l.name })),
    (id) => setLayout(LAYOUTS.findIndex((l) => l.id === id), true),
  );
  logoSeg = segmented(
    document.getElementById("seg-logo"),
    LOGOS.map((l) => ({ id: l.id, label: l.name })),
    (id) => setLogo(LOGOS.findIndex((l) => l.id === id), false),
  );

  mountIcons(); // fill in the little pictures on the buttons

  const savedLogo = LOGOS.findIndex((l) => l.id === loadSetting("akin.logo.v2"));
  setLogo(savedLogo === -1 ? 0 : savedLogo, false);
  const savedLayout = LAYOUTS.findIndex((l) => l.id === loadSetting("akin.layout.v4"));
  setLayout(savedLayout === -1 ? 0 : savedLayout, false);

  new ResizeObserver(() => {
    const tab = activeTab();
    if (tab && tab.opened) fitAndResize(tab);
  }).observe(panesEl);
  // When the header changes size (window resize, layout change), keep everything lined up.
  new ResizeObserver(() => {
    const tab = activeTab();
    if (!tab) return;
    applyScroll(tab);
    keepCursorInView(tab);
  }).observe(heroEl);

  infoPromise = loadInfo();
  await newTab();
}

start();
