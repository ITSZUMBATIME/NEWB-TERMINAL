// The left-hand file explorer. It is docked: when open, it pushes the terminal across
// instead of covering it. Browse folders like in a file manager, then:
//   - drag a file or folder onto the terminal to type its path (or drop it onto a blank)
//   - double-click a folder (or press its "cd" button) to type "cd <folder>" for you
// By default it follows the folder your terminal is in.

import { invoke } from "@tauri-apps/api/core";
import { el, icon } from "./ui.js";

const KEY = "akin.explorer.v1";
const MIN_W = 190;
const MAX_W = 560;

function loadState() {
  try {
    return { open: true, w: 290, hidden: false, follow: true, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch (_) {
    return { open: true, w: 290, hidden: false, follow: true };
  }
}

const join = (dir, name) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
const parentOf = (p) => (p === "/" ? "/" : p.slice(0, p.lastIndexOf("/")) || "/");

/**
 * options: { dragger, getActiveTabId(), onCd(path), toast(msg) }
 * returns { toggle, open, close, isOpen, refresh }
 */
export async function initExplorer({ dragger, getActiveTabId, onCd, toast }) {
  const root_ = document.getElementById("explorer");
  const workspace = document.getElementById("workspace");
  const tree = document.getElementById("fx-tree");
  const pathEl = document.getElementById("fx-path");
  const btn = { home: byId("fx-home"), up: byId("fx-up"), follow: byId("fx-follow"), hidden: byId("fx-hidden"), refresh: byId("fx-refresh"), open: byId("open-files") };
  function byId(id) {
    return document.getElementById(id);
  }

  const state = loadState();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* fine */ }
  };

  let home = "/";
  try { home = await invoke("home_dir"); } catch (_) { /* keep / */ }

  let root = home;
  const expanded = new Set(); // folders the person has opened
  let selected = null;

  /* ---------- Open, close, resize ---------- */

  const isOpen = () => state.open;

  function applyOpen() {
    workspace.classList.toggle("fx-open", state.open);
    btn.open.classList.toggle("active", state.open);
    root_.setAttribute("aria-hidden", state.open ? "false" : "true");
  }
  function open() {
    state.open = true;
    save();
    applyOpen();
    sync();
  }
  function close() {
    state.open = false;
    save();
    applyOpen();
  }
  function toggle() {
    if (state.open) close();
    else open();
  }
  btn.open.addEventListener("click", toggle);

  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".xterm")) return;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      toggle();
    }
  });

  document.documentElement.style.setProperty("--fx-w", `${state.w}px`);
  const handle = document.getElementById("fx-resize");
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev) => {
      const w = Math.max(MIN_W, Math.min(MAX_W, ev.clientX - root_.getBoundingClientRect().left));
      document.documentElement.style.setProperty("--fx-w", `${w}px`);
      state.w = w;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
      save();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });

  /* ---------- Listing folders ---------- */

  async function listDir(path) {
    return invoke("list_dir", { path, showHidden: state.hidden });
  }

  function rowFor(entry, dir, depth) {
    const path = join(dir, entry.name);
    const wrap = el("div", "fx-node");
    const row = el("div", "fx-row");
    row.dataset.path = path;
    row.dataset.name = entry.name;
    if (entry.is_dir) row.dataset.dir = "1";
    row.style.setProperty("--d", depth);
    row.classList.toggle("hidden-file", entry.hidden);
    row.classList.toggle("link", entry.is_link);

    row.append(el("span", `caret${entry.is_dir ? "" : " none"}`), icon(entry.is_dir ? "folder" : "file"), el("span", "fx-name", entry.name));

    if (entry.is_dir) {
      const cd = el("button", "fx-cd", "cd");
      cd.title = "Type cd and this folder's path in the terminal";
      cd.addEventListener("click", (e) => {
        e.stopPropagation();
        typeCd(path);
      });
      row.append(cd);
    }
    wrap.append(row);

    if (entry.is_dir) {
      const kids = el("div", "fx-kids");
      wrap.append(kids);
      row.addEventListener("click", () => {
        if (dragger.justDragged) return;
        select(row);
        toggleFolder(row, kids, path, depth);
      });
      row.addEventListener("dblclick", () => typeCd(path));
      if (expanded.has(path)) {
        row.classList.add("open");
        fill(kids, path, depth + 1);
      }
    } else {
      row.addEventListener("click", () => {
        if (dragger.justDragged) return;
        select(row);
      });
    }
    return wrap;
  }

  function select(row) {
    selected?.classList.remove("sel");
    selected = row;
    row.classList.add("sel");
  }

  async function fill(container, dir, depth) {
    container.replaceChildren(el("div", "fx-note", "Loading…"));
    try {
      const { entries, truncated } = await listDir(dir);
      container.replaceChildren();
      if (!entries.length) {
        const n = el("div", "fx-note", "(empty)");
        n.style.setProperty("--d", depth);
        container.append(n);
      }
      for (const entry of entries) container.append(rowFor(entry, dir, depth));
      if (truncated) {
        const n = el("div", "fx-note", "Too many items to show them all.");
        n.style.setProperty("--d", depth);
        container.append(n);
      }
    } catch (_) {
      const n = el("div", "fx-note", "Can't open this folder.");
      n.style.setProperty("--d", depth);
      container.replaceChildren(n);
    }
  }

  function toggleFolder(row, kids, path, depth) {
    if (expanded.has(path)) {
      expanded.delete(path);
      row.classList.remove("open");
      kids.replaceChildren();
    } else {
      expanded.add(path);
      row.classList.add("open");
      fill(kids, path, depth + 1);
    }
  }

  function typeCd(path) {
    onCd(path);
  }

  /* ---------- The top bar and root folder ---------- */

  function showPath() {
    const shown = root === home ? "~" : root.startsWith(home + "/") ? `~${root.slice(home.length)}` : root;
    pathEl.textContent = shown;
    pathEl.title = root;
    btn.up.disabled = root === "/";
    btn.follow.classList.toggle("on", state.follow);
    btn.hidden.classList.toggle("on", state.hidden);
  }

  async function render() {
    showPath();
    selected = null;
    await fill(tree, root, 0);
  }

  function setRoot(path, { manual = false } = {}) {
    if (manual && state.follow) {
      state.follow = false; // you took the wheel: stop following the terminal
      save();
    }
    root = path;
    expanded.clear();
    render();
  }

  btn.home.addEventListener("click", () => setRoot(home, { manual: true }));
  btn.up.addEventListener("click", () => setRoot(parentOf(root), { manual: true }));
  btn.refresh.addEventListener("click", () => render());
  btn.hidden.addEventListener("click", () => {
    state.hidden = !state.hidden;
    save();
    render();
  });
  btn.follow.addEventListener("click", () => {
    state.follow = !state.follow;
    save();
    showPath();
    if (state.follow) {
      sync();
      toast("The explorer now follows the folder your terminal is in.");
    } else {
      toast("The explorer stays where you leave it.");
    }
  });

  // Follow the terminal: look at which folder its shell is in a couple of times a second.
  async function sync() {
    if (!state.open || !state.follow || document.hidden) return;
    const id = getActiveTabId();
    if (id == null) return;
    try {
      const cwd = await invoke("pty_cwd", { id });
      if (cwd && cwd !== root) setRoot(cwd);
    } catch (_) {
      /* the tab may have just closed */
    }
  }
  setInterval(sync, 1200);

  dragger.attach(tree);
  applyOpen();
  await render();
  sync();

  return { toggle, open, close, isOpen, refresh: render, sync };
}
