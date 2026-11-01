// The right-hand slide-over panel: your commands, in branching groups like folders in a
// file explorer (Update > Application updates > Update Flatpak apps ...), plus your favourites.
// The search box understands everyday words ("delete a file", "duplicate", "wifi").
// Commands can be dragged onto the terminal. Dropping types the command for you to check;
// it never presses Enter. Dropping onto "Favourites" pins it.

import { TREE, ESSENTIALS, KEYS, lookup, lookupTree, hintsFor, flattenTree } from "./commands.js";
import { el, cmdElement } from "./ui.js";

const FAV_KEY = "akin.favs.v1";
const OPEN_KEY = "akin.tree.v1";
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

/* ---------- Search that understands everyday words ---------- */

// Little words that don't help find anything.
const STOP = new Set(["a", "an", "the", "to", "my", "me", "i", "how", "do", "does", "want", "can", "you", "of", "in", "on", "and", "or", "for", "with", "some", "is", "it", "this", "that", "what", "where", "when", "please", "need", "like", "not", "working", "fix", "problem", "broken", "help", "just", "cant", "wont", "cannot", "doesnt", "isnt"]);

// Words that mean nearly the same thing, so "delete" also finds "remove".
const SYNONYMS = {
  delete: ["remove", "erase", "rm"], erase: ["delete", "remove"], remove: ["delete", "uninstall", "erase"], uninstall: ["remove"],
  folder: ["directory", "dir"], directory: ["folder"], copy: ["duplicate", "cp"], duplicate: ["copy"],
  rename: ["move", "mv"], move: ["rename", "mv"], find: ["search", "locate"], search: ["find", "grep"],
  look: ["see", "show", "list"], list: ["show", "ls"], see: ["show", "list", "view"], show: ["see", "list", "view"],
  open: ["edit", "view"], install: ["add", "get"], add: ["install"], update: ["upgrade"], upgrade: ["update"],
  internet: ["network", "online", "wifi", "connection"], wifi: ["network", "wireless"], online: ["internet", "network"],
  space: ["disk", "storage"], storage: ["disk", "space"], memory: ["ram"], ram: ["memory"],
  stop: ["kill", "end", "quit"], kill: ["stop", "end"], close: ["exit", "quit"], quit: ["exit", "stop"],
  download: ["get", "fetch", "clone"], undo: ["restore", "revert", "reset"], save: ["commit", "write"],
  password: ["sudo", "passwd"], admin: ["sudo", "root"], read: ["view", "show", "cat"], make: ["create", "new"],
  create: ["make", "new", "mkdir", "touch"], new: ["create", "make"], zip: ["archive", "compress", "tar"], unzip: ["extract", "unpack"],
  restart: ["reboot"], reboot: ["restart"], shutdown: ["power"], computer: ["system", "machine"],
};

const withoutPlural = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

/** Exact: every word you typed appears (plurals count). */
function matchesExactly(haystack, words) {
  return words.every((w) => haystack.includes(w) || haystack.includes(withoutPlural(w)));
}

/** Loose: every word, or a word that means nearly the same, appears. */
function matchesLoosely(haystack, words) {
  return words.every((w) => {
    const forms = [w, withoutPlural(w)];
    for (const f of [...forms]) forms.push(...(SYNONYMS[f] || []));
    return forms.some((f) => haystack.includes(f));
  });
}

function queryWords(text) {
  const all = text.toLowerCase().split(/[^a-z0-9.+_-]+/).filter(Boolean);
  const words = all.filter((w) => !STOP.has(w));
  return words.length ? words : all; // if every word was a little word, use them anyway
}

/**
 * options: { onInsert(cmd, risky), toast(msg), focusTerminal(), panesEl, dragger }
 * returns { toggle(), open(), close(), closeInstant(), isOpen(), addFav(cmd) }
 */
export function initDrawers({ toast, focusTerminal, panesEl, dragger }) {
  const drawer = document.getElementById("drawer-cheats");
  const button = document.getElementById("open-cheats");
  const treeBody = document.getElementById("cheat-body");
  const treeFilter = document.getElementById("tree-filter");

  let favs = load(FAV_KEY, []).filter((x) => typeof x === "string");
  let openIds = new Set(load(OPEN_KEY, [FAV_ID]));

  /* ---------- Opening and closing ---------- */

  const isOpen = () => drawer.classList.contains("open");

  function open() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    button.classList.add("active");
    setTimeout(() => {
      treeFilter.focus();
      treeFilter.select(); // typing replaces whatever you searched last time
    }, 120);
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

  // Shortcuts when the keyboard is NOT in the terminal (the terminal has its own handler).
  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".xterm")) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && e.shiftKey && (k === "s" || k === "d")) {
      e.preventDefault();
      if (k === "d") open();
      else toggle();
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

  /* ---------- The tree ---------- */

  function leaf(item, depth, { removable = false } = {}) {
    const row = el("div", "tn-leaf");
    row.dataset.cmd = item.cmd;
    if (item.risky) row.dataset.risky = "1";
    const name = item.name || item.title || item.cmd;
    // Everything a person might type to find this: its name, the command, the explanation,
    // the groups it sits in, and the everyday wording from the old Discover list.
    row.dataset.search = `${name} ${item.cmd} ${item.why || ""} ${(item.trail || []).join(" ")} ${hintsFor(item.cmd)}`.toLowerCase();
    row.style.setProperty("--d", depth);

    const line = el("div", "tn-line");
    line.append(el("span", "tn-name", name));
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

  function countLeaves(node) {
    return node.children.reduce((n, ch) => n + (ch.children ? countLeaves(ch) : 1), 0);
  }

  function groupNode(node, depth, trail) {
    const id = [...trail, node.name].join(" > ");
    return branch(id, node.name, depth, (kids) => {
      for (const child of node.children) {
        if (child.children) kids.append(groupNode(child, depth + 1, [...trail, node.name]));
        else kids.append(leaf({ ...child, trail: [...trail, node.name] }, depth + 1));
      }
    }, { count: countLeaves(node) });
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
    if (treeFilter.value.trim()) applyFilter();
  }

  function renderTree() {
    treeBody.replaceChildren();

    treeBody.append(branch(FAV_ID, "★ Favourites", 0, () => {}, { count: favs.length, extraClass: "fav-drop top" }));
    renderFavs();

    treeBody.append(
      branch("Essentials", "Essentials", 0, (kids) => {
        for (const cmd of ESSENTIALS) kids.append(leaf(infoFor(cmd) || { name: cmd, cmd }, 1));
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

    refreshStars();
  }

  // Search: a ranked list. Exact matches come first, then ones that only match by similar words
  // ("delete" also finds "remove"). Each result shows the group it lives in.
  const resultsBody = document.getElementById("cheat-results");
  const tools = document.querySelector(".tree-tools");
  const allLeaves = flattenTree().map((item) => ({
    item,
    hay: `${item.name} ${item.cmd} ${item.why || ""} ${item.trail.join(" ")} ${hintsFor(item.cmd)}`.toLowerCase(),
    nameHay: `${item.name} ${hintsFor(item.cmd)}`.toLowerCase(),
  }));
  const MAX_RESULTS = 40;

  function applyFilter() {
    const text = treeFilter.value.trim();
    const words = text ? queryWords(text) : [];
    const searching = words.length > 0;
    treeBody.hidden = searching;
    resultsBody.hidden = !searching;
    tools.hidden = searching;
    if (!searching) return;

    const scored = [];
    for (const entry of allLeaves) {
      let score = 0;
      if (matchesExactly(entry.hay, words)) score = matchesExactly(entry.nameHay, words) ? 4 : 3; // in the name counts most
      else if (matchesLoosely(entry.hay, words)) score = matchesLoosely(entry.nameHay, words) ? 2 : 1;
      if (score) scored.push({ ...entry, score });
    }
    scored.sort((x, y) => y.score - x.score); // stable: ties keep their order in the tree

    // Nothing matched every word? Offer the commands that match the most words.
    let closest = false;
    if (!scored.length) {
      for (const entry of allLeaves) {
        const n = words.filter((w) => matchesLoosely(entry.hay, [w])).length;
        if (n) scored.push({ ...entry, score: n });
      }
      scored.sort((x, y) => y.score - x.score);
      closest = scored.length > 0;
    }

    resultsBody.replaceChildren();
    if (closest) resultsBody.append(el("div", "empty", "No exact match. These are the closest ideas:"));
    for (const r of scored.slice(0, MAX_RESULTS)) {
      const row = leaf(r.item, 0);
      row.classList.add("result");
      row.append(el("div", "tn-trail", r.item.trail.join("  ›  ")));
      resultsBody.append(row);
    }
    if (!scored.length) {
      resultsBody.append(el("div", "empty", "Nothing matches. Try different words, like \"update\", \"copy\" or \"git\"."));
    } else if (scored.length > MAX_RESULTS) {
      resultsBody.append(el("div", "empty", `Showing the best ${MAX_RESULTS} of ${scored.length}. Add a word to narrow it down.`));
    }
    refreshStars();
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

  /* ---------- Go ---------- */

  dragger.attach(treeBody);
  dragger.attach(resultsBody);
  renderTree();

  return { toggle, open, close, closeInstant, isOpen, addFav };
}
