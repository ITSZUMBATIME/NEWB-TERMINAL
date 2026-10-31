// The right-hand slide-over panel. It has two sub-menus:
//   Cheat sheet: commands in branching groups, like folders in a file explorer
//                (Update > Application updates > Update Flatpak apps ...), plus your favourites.
//   Discover:    the plain-English "what do you want to do?" list, with search.
// Commands can be dragged onto the terminal. Dropping types the command for you to check;
// it never presses Enter. Dropping onto "Favourites" pins it.

import { CATEGORIES, TREE, ESSENTIALS, KEYS, lookup, lookupTree } from "./commands.js";
import { el, cmdElement } from "./ui.js";

const FAV_KEY = "akin.favs.v1";
const OPEN_KEY = "akin.tree.v1";
const TAB_KEY = "akin.rtab.v1";
const FAV_ID = "Favourites";

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* fine */ }
}

const infoFor = (cmd) => lookupTree(cmd) || lookup(cmd);

/**
 * options: { onInsert(cmd, risky), toast(msg), focusTerminal(), panesEl, dragger }
 * returns { toggle(), open(tab), close(), closeInstant(), isOpen() }
 */
export function initDrawers({ onInsert, toast, focusTerminal, panesEl, dragger }) {
  const drawer = document.getElementById("drawer-cheats");
  const button = document.getElementById("open-cheats");
  const treeBody = document.getElementById("cheat-body");
  const treeFilter = document.getElementById("tree-filter");
  const discoverList = document.getElementById("discover-list");
  const search = document.getElementById("discover-search");
  const subtabs = [...drawer.querySelectorAll(".subtab")];
  const panels = { tree: document.getElementById("panel-tree"), discover: document.getElementById("panel-discover") };

  let favs = load(FAV_KEY, []).filter((x) => typeof x === "string");
  let openIds = new Set(load(OPEN_KEY, [FAV_ID]));
  let tab = load(TAB_KEY, "tree");
  if (!panels[tab]) tab = "tree";

  /* ---------- Opening, closing, sub-menus ---------- */

  const isOpen = () => drawer.classList.contains("open");

  function showTab(name, focus) {
    tab = name;
    save(TAB_KEY, name);
    for (const b of subtabs) b.classList.toggle("on", b.dataset.tab === name);
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== name;
    if (focus) {
      const input = name === "discover" ? search : treeFilter;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 120);
    }
  }

  function open(name) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    button.classList.add("active");
    showTab(name || tab, true);
  }
  function close() {
    if (!isOpen()) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    button.classList.remove("active");
    if (drawer.contains(document.activeElement)) focusTerminal();
  }
  // Used while dragging out of the panel: no slide animation, so nothing lingers.
  function closeInstant() {
    drawer.classList.add("no-anim");
    close();
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.remove("no-anim")));
  }
  function toggle() {
    if (isOpen()) close();
    else open();
  }

  button.addEventListener("click", toggle);
  drawer.querySelector(".drawer-close").addEventListener("click", close);
  for (const b of subtabs) b.addEventListener("click", () => showTab(b.dataset.tab, true));

  // Shortcuts when the keyboard is NOT in the terminal (the terminal has its own handler).
  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".xterm")) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && e.shiftKey && k === "s") {
      e.preventDefault();
      toggle();
    } else if (e.ctrlKey && e.shiftKey && k === "d") {
      e.preventDefault();
      open("discover");
    } else if (e.key === "Escape" && drawer.contains(e.target)) {
      close();
    }
  });

  // Clicking in the terminal tucks the panel away.
  panesEl.addEventListener("pointerdown", close);

  // The panel starts just under the tab bar, wherever that ends.
  const bar = document.getElementById("tabbar");
  new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`)).observe(bar);

  /* ---------- Favourites ---------- */

  const isFav = (cmd) => favs.includes(cmd);

  function toggleFav(cmd) {
    favs = isFav(cmd) ? favs.filter((c) => c !== cmd) : [...favs, cmd];
    save(FAV_KEY, favs);
    renderFavs();
    refreshStars();
  }

  function addFav(cmd) {
    if (isFav(cmd)) {
      toast("That one is already in your favourites.");
      return;
    }
    toggleFav(cmd);
    toast("Added to your favourites.");
  }

  function refreshStars() {
    for (const star of drawer.querySelectorAll(".star")) {
      const on = isFav(star.closest("[data-cmd]").dataset.cmd);
      star.textContent = on ? "★" : "☆";
      star.classList.toggle("on", on);
    }
  }

  function starButton(cmd) {
    const star = el("button", "star");
    star.title = "Add to your favourites";
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(cmd);
    });
    return star;
  }

  /* ---------- Cheat sheet tree ---------- */

  function leaf(item, depth, { removable = false } = {}) {
    const row = el("div", "tn-leaf");
    row.dataset.cmd = item.cmd;
    if (item.risky) row.dataset.risky = "1";
    row.dataset.search = `${item.name || item.title || ""} ${item.cmd} ${item.why || ""} ${(item.trail || []).join(" ")}`.toLowerCase();
    row.style.setProperty("--d", depth);

    const line = el("div", "tn-line");
    line.append(el("span", "tn-name", item.name || item.title || item.cmd));
    if (item.risky) line.append(el("span", "tag", "careful"));
    if (removable) {
      const x = el("button", "unpin", "×");
      x.title = "Remove from favourites";
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFav(item.cmd);
      });
      line.append(x);
    } else {
      line.append(starButton(item.cmd));
    }
    row.append(line, cmdElement(item.cmd));
    if (item.why) row.append(el("div", "tn-why", item.why));
    return row;
  }

  function branch(id, name, depth, kidsBuilder, { count, extraClass } = {}) {
    const wrap = el("div", `tn-branch${extraClass ? " " + extraClass : ""}`);
    wrap.dataset.id = id;
    wrap.style.setProperty("--d", depth);
    const head = el("div", "tn-head");
    head.append(el("span", "caret"), el("span", "tn-name", name));
    if (count !== undefined) head.append(el("span", "tn-count", String(count)));
    const kids = el("div", "tn-kids");
    kidsBuilder(kids);
    wrap.append(head, kids);
    wrap.classList.toggle("closed", !openIds.has(id));
    head.addEventListener("click", () => {
      if (dragger.justDragged) return;
      wrap.classList.toggle("closed");
      if (wrap.classList.contains("closed")) openIds.delete(id);
      else openIds.add(id);
      save(OPEN_KEY, [...openIds]);
    });
    return wrap;
  }

  function groupNode(node, depth, trail) {
    const id = [...trail, node.name].join(" > ");
    const total = countLeaves(node);
    return branch(id, node.name, depth, (kids) => {
      for (const child of node.children) {
        if (child.children) kids.append(groupNode(child, depth + 1, [...trail, node.name]));
        else kids.append(leaf({ ...child, trail: [...trail, node.name] }, depth + 1));
      }
    }, { count: total });
  }

  function countLeaves(node) {
    return node.children.reduce((n, ch) => n + (ch.children ? countLeaves(ch) : 1), 0);
  }

  function renderFavs() {
    const node = treeBody.querySelector(`.tn-branch[data-id="${FAV_ID}"]`);
    if (!node) return;
    const kids = node.querySelector(".tn-kids");
    kids.replaceChildren();
    if (favs.length) {
      for (const cmd of favs) {
        const info = infoFor(cmd) || { name: cmd, cmd };
        kids.append(leaf({ ...info, cmd }, 1, { removable: true }));
      }
    } else {
      kids.append(el("div", "empty", "Star a command, or drag one here, to keep it handy."));
    }
    node.querySelector(".tn-count").textContent = String(favs.length);
    applyFilter();
  }

  function renderTree() {
    treeBody.replaceChildren();

    treeBody.append(branch(FAV_ID, "★ Favourites", 0, () => {}, { count: favs.length, extraClass: "fav-drop top" }));
    renderFavs();

    treeBody.append(
      branch("Essentials", "Essentials", 0, (kids) => {
        for (const cmd of ESSENTIALS) {
          const info = infoFor(cmd) || { name: cmd, cmd };
          kids.append(leaf(info, 1));
        }
      }, { count: ESSENTIALS.length, extraClass: "top" }),
    );

    for (const group of TREE) {
      const node = groupNode(group, 0, []);
      node.classList.add("top");
      treeBody.append(node);
    }

    treeBody.append(
      branch("Handy keys", "Handy keys", 0, (kids) => {
        for (const [k, what] of KEYS) {
          const r = el("div", "key-row");
          r.append(el("kbd", "", k), el("span", "tn-why", what));
          kids.append(r);
        }
      }, { count: KEYS.length, extraClass: "top" }),
    );

    treeBody.append(el("div", "empty tree-none", "Nothing matches. Try different words, like \"update\", \"copy\" or \"git\"."));
    treeBody.querySelector(".tree-none").hidden = true;
    refreshStars();
  }

  // Filtering: show only matching commands, with the groups that hold them opened up.
  function applyFilter() {
    const words = treeFilter.value.toLowerCase().split(/\s+/).filter(Boolean);
    treeBody.classList.toggle("filtering", words.length > 0);
    let any = false;

    const visit = (node) => {
      let shown = 0;
      for (const kid of node.querySelector(":scope > .tn-kids").children) {
        if (kid.classList.contains("tn-leaf")) {
          const hit = words.every((w) => kid.dataset.search.includes(w));
          kid.hidden = !hit;
          if (hit) shown++;
        } else if (kid.classList.contains("tn-branch")) {
          shown += visit(kid);
        }
      }
      node.hidden = words.length > 0 && shown === 0;
      return shown;
    };

    for (const top of treeBody.querySelectorAll(":scope > .tn-branch")) {
      if (!words.length) {
        top.hidden = false;
        for (const x of top.querySelectorAll("[hidden]")) if (!x.classList.contains("tree-none")) x.hidden = false;
        any = true;
        continue;
      }
      // Skip the plain key list when filtering.
      if (top.dataset.id === "Handy keys") {
        top.hidden = true;
        continue;
      }
      if (visit(top) > 0) any = true;
    }
    const none = treeBody.querySelector(".tree-none"); // not there yet while the tree is first being built
    if (none) none.hidden = any || !words.length;
  }
  treeFilter.addEventListener("input", applyFilter);

  document.getElementById("tree-expand").addEventListener("click", () => {
    for (const b of treeBody.querySelectorAll(".tn-branch")) {
      b.classList.remove("closed");
      openIds.add(b.dataset.id);
    }
    save(OPEN_KEY, [...openIds]);
  });
  document.getElementById("tree-collapse").addEventListener("click", () => {
    openIds = new Set([FAV_ID]);
    for (const b of treeBody.querySelectorAll(".tn-branch")) b.classList.toggle("closed", !openIds.has(b.dataset.id));
    save(OPEN_KEY, [...openIds]);
  });

  /* ---------- Discover ---------- */

  function renderDiscover() {
    discoverList.replaceChildren();
    for (const cat of CATEGORIES) {
      const sec = el("section", "cat");
      sec.append(el("h3", "cat-name", cat.name));
      for (const item of cat.items) {
        const card = el("div", "card");
        card.dataset.cmd = item.cmd;
        if (item.risky) card.dataset.risky = "1";
        card.dataset.search = `${item.title} ${item.cmd} ${item.why} ${item.keys || ""} ${cat.name}`.toLowerCase();

        const top = el("div", "card-top");
        top.append(el("span", "card-title", item.title));
        if (item.risky) top.append(el("span", "tag", "careful"));
        top.append(starButton(item.cmd));

        card.append(top, cmdElement(item.cmd), el("div", "card-why", item.why));
        card.addEventListener("click", () => {
          if (dragger.justDragged) return;
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

  /* ---------- Go ---------- */

  dragger.attach(treeBody);
  dragger.attach(discoverList);

  renderDiscover();
  renderTree();
  showTab(tab, false);

  return { toggle, open, close, closeInstant, isOpen, addFav };
}
