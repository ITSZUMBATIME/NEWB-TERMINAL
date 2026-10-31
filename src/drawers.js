// The two slide-over drawers:
//   Discover (left):    browse commands by what you want to do, search in plain English.
//   Cheat sheet (right): your favourites, the essentials, and handy keys.
// Commands can be dragged onto the terminal. Dropping types the command for you to check;
// it never presses Enter. Dropping onto "Favourites" pins it.

import { CATEGORIES, ESSENTIALS, KEYS, lookup } from "./commands.js";

const FAV_KEY = "akin.favs.v1";
const BLANK_SPLIT = /(\{\{[^}]+\}\})/;

function loadFavs() {
  try {
    const list = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch (_) {
    return [];
  }
}
function saveFavs(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (_) { /* fine */ }
}

/** A command as web text, with its blanks drawn as little pills. */
function cmdElement(cmd) {
  const code = document.createElement("code");
  code.className = "cmd";
  for (const part of cmd.split(BLANK_SPLIT)) {
    if (!part) continue;
    const m = /^\{\{([^}]+)\}\}$/.exec(part);
    if (m) {
      const pill = document.createElement("span");
      pill.className = "blank";
      pill.textContent = m[1].trim();
      code.append(pill);
    } else {
      code.append(document.createTextNode(part));
    }
  }
  return code;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * options: { onInsert(cmd, risky), toast(msg), focusTerminal(), panesEl }
 * returns { toggle(which), close(which), closeAll() } where which is "discover" or "cheats"
 */
export function initDrawers({ onInsert, toast, focusTerminal, panesEl }) {
  const drawers = {
    discover: document.getElementById("drawer-discover"),
    cheats: document.getElementById("drawer-cheats"),
  };
  const buttons = {
    discover: document.getElementById("open-discover"),
    cheats: document.getElementById("open-cheats"),
  };
  const discoverList = document.getElementById("discover-list");
  const cheatBody = document.getElementById("cheat-body");
  const search = document.getElementById("discover-search");

  let favs = loadFavs();

  /* ---------- Opening and closing ---------- */

  function isOpen(which) {
    return drawers[which].classList.contains("open");
  }
  function open(which) {
    drawers[which].classList.add("open");
    drawers[which].setAttribute("aria-hidden", "false");
    buttons[which].classList.add("active");
    if (which === "discover") {
      setTimeout(() => {
        search.focus();
        search.select(); // typing replaces whatever was searched last time
      }, 120);
    }
  }
  function close(which) {
    const d = drawers[which];
    if (!d.classList.contains("open")) return;
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
    buttons[which].classList.remove("active");
    if (d.contains(document.activeElement)) focusTerminal();
  }
  function toggle(which) {
    if (isOpen(which)) close(which);
    else open(which);
  }
  function closeAll() {
    close("discover");
    close("cheats");
  }

  buttons.discover.addEventListener("click", () => toggle("discover"));
  buttons.cheats.addEventListener("click", () => toggle("cheats"));
  for (const d of Object.values(drawers)) {
    d.querySelector(".drawer-close").addEventListener("click", () => close(d.dataset.drawer));
  }

  // Shortcuts when the keyboard is NOT in the terminal (the terminal has its own handler).
  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".xterm")) return;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      toggle("discover");
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      toggle("cheats");
    } else if (e.key === "Escape" && Object.values(drawers).some((d) => d.contains(e.target))) {
      closeAll();
    }
  });

  // Clicking in the terminal tucks the drawers away.
  panesEl.addEventListener("pointerdown", () => closeAll());

  // Drawers start just under the tab bar, wherever that ends.
  const bar = document.getElementById("tabbar");
  new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`)).observe(bar);

  /* ---------- Discover ---------- */

  function isFav(cmd) {
    return favs.includes(cmd);
  }

  function renderDiscover() {
    discoverList.replaceChildren();
    for (const cat of CATEGORIES) {
      const sec = el("section", "cat");
      sec.dataset.cat = cat.id;
      sec.append(el("h3", "cat-name", cat.name));
      for (const item of cat.items) {
        const card = el("div", "card");
        card.dataset.cmd = item.cmd;
        if (item.risky) card.dataset.risky = "1";
        card.dataset.search = `${item.title} ${item.cmd} ${item.why} ${item.keys || ""} ${cat.name}`.toLowerCase();

        const top = el("div", "card-top");
        top.append(el("span", "card-title", item.title));
        if (item.risky) top.append(el("span", "tag", "careful"));
        const star = el("button", "star", isFav(item.cmd) ? "★" : "☆");
        star.title = "Add to your favourites";
        star.classList.toggle("on", isFav(item.cmd));
        star.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleFav(item.cmd);
        });
        top.append(star);

        card.append(top, cmdElement(item.cmd), el("div", "card-why", item.why));
        card.addEventListener("click", () => {
          if (justDragged) return;
          card.classList.toggle("open");
        });
        sec.append(card);
      }
      discoverList.append(sec);
    }
    const none = el("div", "empty", "Nothing matches. Try different words, like \"copy\", \"delete\" or \"folder\".");
    none.id = "discover-none";
    none.hidden = true;
    discoverList.append(none);
  }

  function applySearch() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let anyShown = false;
    for (const sec of discoverList.querySelectorAll(".cat")) {
      let shown = 0;
      for (const card of sec.querySelectorAll(".card")) {
        const hit = words.every((w) => card.dataset.search.includes(w));
        card.hidden = !hit;
        if (hit) shown++;
      }
      sec.hidden = shown === 0;
      if (shown) anyShown = true;
    }
    document.getElementById("discover-none").hidden = anyShown;
  }
  search.addEventListener("input", applySearch);

  /* ---------- Cheat sheet ---------- */

  function sheetRow(cmd, { removable }) {
    const info = lookup(cmd);
    const row = el("div", "row");
    row.dataset.cmd = cmd;
    if (info?.risky) row.dataset.risky = "1";
    row.append(cmdElement(cmd));
    if (info) row.append(el("span", "row-title", info.title));
    if (removable) {
      const x = el("button", "unpin", "×");
      x.title = "Remove from favourites";
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFav(cmd);
      });
      row.append(x);
    }
    return row;
  }

  function renderCheats() {
    cheatBody.replaceChildren();

    const favSec = el("section", "sheet-sec fav-drop");
    favSec.append(el("h3", "cat-name", "Favourites"));
    if (favs.length) {
      for (const cmd of favs) favSec.append(sheetRow(cmd, { removable: true }));
    } else {
      favSec.append(el("div", "empty", "Star a command in Discover, or drag one here, to keep it handy."));
    }
    cheatBody.append(favSec);

    const ess = el("section", "sheet-sec");
    ess.append(el("h3", "cat-name", "Essentials"));
    for (const cmd of ESSENTIALS) ess.append(sheetRow(cmd, { removable: false }));
    cheatBody.append(ess);

    const keys = el("section", "sheet-sec");
    keys.append(el("h3", "cat-name", "Handy keys"));
    for (const [k, what] of KEYS) {
      const r = el("div", "key-row");
      r.append(el("kbd", "", k), el("span", "row-title", what));
      keys.append(r);
    }
    cheatBody.append(keys);
  }

  function toggleFav(cmd) {
    favs = isFav(cmd) ? favs.filter((c) => c !== cmd) : [...favs, cmd];
    saveFavs(favs);
    renderCheats();
    for (const card of discoverList.querySelectorAll(".card")) {
      const on = isFav(card.dataset.cmd);
      const star = card.querySelector(".star");
      star.textContent = on ? "★" : "☆";
      star.classList.toggle("on", on);
    }
  }

  function addFav(cmd) {
    if (isFav(cmd)) {
      toast("That one is already in your favourites.");
      return;
    }
    toggleFav(cmd);
    toast("Added to your favourites.");
  }

  /* ---------- Drag and drop ---------- */

  let drag = null;
  let justDragged = false;

  function targetAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    if (hit.closest(".fav-drop")) return "fav";
    if (hit.closest(".drawer") || hit.closest("#tabbar")) return null;
    if (hit.closest("#panes")) return "terminal";
    return null;
  }

  function endDrag() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey, true);
    if (drag?.ghost) drag.ghost.remove();
    document.body.classList.remove("dragging");
    panesEl.classList.remove("drop-ready");
    for (const f of document.querySelectorAll(".fav-drop")) f.classList.remove("drop-ready");
    drag = null;
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      endDrag();
    }
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.active = true;
      drag.ghost = el("div", "drag-ghost");
      drag.ghost.append(cmdElement(drag.cmd));
      document.body.append(drag.ghost);
      document.body.classList.add("dragging");
      // Lifting a command out of its drawer slides that drawer out of the way.
      if (drag.from) close(drag.from.dataset.drawer);
    }
    drag.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
    const target = targetAt(e.clientX, e.clientY);
    panesEl.classList.toggle("drop-ready", target === "terminal");
    for (const f of document.querySelectorAll(".fav-drop")) f.classList.toggle("drop-ready", target === "fav");
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag;
    if (d.active) {
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      const target = targetAt(e.clientX, e.clientY);
      endDrag();
      if (target === "terminal") onInsert(d.cmd, d.risky);
      else if (target === "fav") addFav(d.cmd);
    } else {
      endDrag();
    }
  }

  function onDown(e) {
    if (e.button !== 0 || e.target.closest("button")) return;
    const source = e.target.closest("[data-cmd]");
    if (!source) return;
    drag = {
      cmd: source.dataset.cmd,
      risky: source.dataset.risky === "1",
      from: source.closest(".drawer"),
      x0: e.clientX,
      y0: e.clientY,
      active: false,
      ghost: null,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
  }
  discoverList.addEventListener("pointerdown", onDown);
  cheatBody.addEventListener("pointerdown", onDown);

  renderDiscover();
  renderCheats();

  return { toggle, close, closeAll };
}
