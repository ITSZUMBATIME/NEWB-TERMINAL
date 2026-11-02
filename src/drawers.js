// The right-hand slide-over panel. It has two tabs:
//   Cheat sheet  your commands, in branching groups like folders in a file explorer
//                (Update > Application updates > Update Flatpak apps ...), your favourites,
//                and your own categories. The search box understands everyday words.
//   Shortcuts    every keyboard shortcut, in plain English.
// Commands can be dragged onto the terminal. Dropping types the command for you to check;
// it never presses Enter. Dropping onto "Favourites" pins it, and onto one of your own
// categories files it there.

import { TREE, ESSENTIALS, SHORTCUTS, lookup, lookupTree, hintsFor, flattenTree } from "./commands.js";
import { el, cmdElement, askChoice, miniForm } from "./ui.js";
import { icon, groupIconName } from "./icons.js";

const FAV_KEY = "akin.favs.v1";
const OPEN_KEY = "akin.tree.v1";
const TAB_KEY = "akin.rtab.v2";
const CUSTOM_KEY = "akin.custom.v1";
const FAV_ID = "Favourites";
const MINE_ID = "My categories";

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
const uid = () => Math.random().toString(36).slice(2, 9);

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
 * options: { toast(msg), focusTerminal(), panesEl, dragger }
 * returns { toggle(tab), open(tab), close(), closeInstant(), isOpen(), addFav(cmd), addToCategory(id, cmd) }
 */
export function initDrawers({ toast, focusTerminal, panesEl, dragger }) {
  const drawer = document.getElementById("drawer-cheats");
  const buttons = { tree: document.getElementById("open-cheats"), keys: document.getElementById("open-keys") };
  const panels = { tree: document.getElementById("panel-tree"), keys: document.getElementById("panel-keys") };
  const subtabs = [...drawer.querySelectorAll(".subtab")];
  const treeBody = document.getElementById("cheat-body");
  const resultsBody = document.getElementById("cheat-results");
  const treeFilter = document.getElementById("tree-filter");
  const keysFilter = document.getElementById("keys-filter");
  const keysBody = document.getElementById("keys-body");
  const tools = document.querySelector(".tree-tools");

  let favs = load(FAV_KEY, []).filter((x) => typeof x === "string");
  let openIds = new Set(load(OPEN_KEY, [FAV_ID, MINE_ID]));
  let custom = load(CUSTOM_KEY, []).filter((c) => c && typeof c.name === "string" && Array.isArray(c.items));
  let tab = load(TAB_KEY, "tree");
  if (!panels[tab]) tab = "tree";

  /* ---------- Opening, closing, tabs ---------- */

  const isOpen = () => drawer.classList.contains("open");

  function updateButtons() {
    for (const [name, b] of Object.entries(buttons)) b.classList.toggle("active", isOpen() && tab === name);
  }

  function showTab(name, focus) {
    tab = name;
    save(TAB_KEY, name);
    for (const b of subtabs) b.classList.toggle("on", b.dataset.tab === name);
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== name;
    updateButtons();
    if (focus) {
      const input = name === "keys" ? keysFilter : treeFilter;
      setTimeout(() => {
        input.focus();
        input.select(); // typing replaces whatever you searched last time
      }, 120);
    }
  }

  // `focus: false` leaves the keyboard alone (used when a form is about to take it).
  function open(name, { focus = true } = {}) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    showTab(name && panels[name] ? name : tab, focus);
  }
  function close() {
    if (!isOpen()) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    updateButtons();
    if (drawer.contains(document.activeElement)) focusTerminal();
  }
  // Used while dragging out of the panel: no slide animation, so nothing lingers.
  function closeInstant() {
    drawer.classList.add("no-anim");
    close();
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.remove("no-anim")));
  }
  function toggle(name) {
    if (isOpen() && (!name || name === tab)) close();
    else open(name);
  }

  buttons.tree.addEventListener("click", () => toggle("tree"));
  buttons.keys.addEventListener("click", () => toggle("keys"));
  drawer.querySelector(".drawer-close").addEventListener("click", close);
  for (const b of subtabs) b.addEventListener("click", () => showTab(b.dataset.tab, true));

  // Shortcuts when the keyboard is NOT in the terminal (the terminal has its own handler).
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.contains(e.target) && !e.target.closest?.(".mini-form")) {
      close();
      return;
    }
    if (e.target.closest?.(".xterm") || !e.ctrlKey || !e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      toggle("tree");
    } else if (k === "d") {
      e.preventDefault();
      open("tree");
    } else if (k === "k") {
      e.preventDefault();
      toggle("keys");
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
      star.classList.toggle("on", isFav(star.closest("[data-cmd]").dataset.cmd));
    }
  }

  function starButton(cmd) {
    const star = el("button", "star");
    star.title = "Add to your favourites";
    star.append(icon("star"));
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(cmd);
    });
    return star;
  }

  function iconButton(name, title, className, onClick) {
    const b = el("button", className);
    b.type = "button";
    b.title = title;
    b.append(icon(name));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /* ---------- Rows and groups ---------- */

  /**
   * One command. `opts.removable` shows a remove button (favourites).
   * `opts.mine` ({ cat, item }) shows edit and delete buttons (your own commands).
   */
  function leaf(item, depth, opts = {}) {
    const row = el("div", "tn-leaf");
    row.dataset.cmd = item.cmd;
    if (item.risky) row.dataset.risky = "1";
    const name = item.name || item.title || item.cmd;
    row.style.setProperty("--d", depth);

    const line = el("div", "tn-line");
    line.append(el("span", "tn-name", name));
    if (item.risky) line.append(el("span", "tag", "careful"));
    if (opts.mine) {
      line.append(
        iconButton("edit", "Edit this command", "mini-act", () => editMine(opts.mine.cat, opts.mine.item, row)),
        iconButton("trash", "Delete this command", "mini-act", () => deleteMine(opts.mine.cat, opts.mine.item)),
      );
    }
    if (opts.removable) line.append(iconButton("close", "Remove from favourites", "unpin", () => toggleFav(item.cmd)));
    else line.append(starButton(item.cmd));

    row.append(line, cmdElement(item.cmd));
    if (item.why) row.append(el("div", "tn-why", item.why));
    return row;
  }

  function branch(id, name, depth, kidsBuilder, { count, extraClass, iconName, actions } = {}) {
    const wrap = el("div", `tn-branch${extraClass ? " " + extraClass : ""}`);
    wrap.dataset.id = id;
    wrap.style.setProperty("--d", depth);
    const head = el("div", "tn-head");
    head.append(el("span", "caret"));
    if (iconName) head.append(icon(iconName));
    head.append(el("span", "tn-name", name));
    if (actions) head.append(...actions);
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

  const countLeaves = (node) => node.children.reduce((n, ch) => n + (ch.children ? countLeaves(ch) : 1), 0);

  function groupNode(node, depth, trail) {
    const id = [...trail, node.name].join(" > ");
    return branch(id, node.name, depth, (kids) => {
      for (const child of node.children) {
        if (child.children) kids.append(groupNode(child, depth + 1, [...trail, node.name]));
        else kids.append(leaf({ ...child, trail: [...trail, node.name] }, depth + 1));
      }
    }, { count: countLeaves(node), iconName: depth === 0 ? groupIconName(node.name) : null });
  }

  function renderFavs() {
    const node = treeBody.querySelector(`.tn-branch[data-id="${FAV_ID}"]`);
    if (!node) return;
    const kids = node.querySelector(".tn-kids");
    kids.replaceChildren();
    if (favs.length) {
      for (const cmd of favs) kids.append(leaf({ ...(infoFor(cmd) || { name: cmd }), cmd }, 1, { removable: true }));
    } else {
      kids.append(el("div", "empty", "Star a command, or drag one here, to keep it handy."));
    }
    node.querySelector(".tn-count").textContent = String(favs.length);
    if (treeFilter.value.trim()) applyFilter();
  }

  /* ---------- Your own categories ---------- */

  const saveCustom = () => save(CUSTOM_KEY, custom);
  const totalMine = () => custom.reduce((n, c) => n + c.items.length, 0);


  const commandFields = (item = {}) => [
    { key: "name", label: "Name", placeholder: "e.g. Update my game", value: item.name, required: true },
    { key: "cmd", label: "Command", placeholder: "e.g. cp {{file}} {{to}}", value: item.cmd, required: true },
    { key: "why", label: "Description (optional)", placeholder: "What does it do?", value: item.why },
  ];
  const BLANK_HINT = "Put {{name}} where you want a blank to fill in later, like  cp {{file}} {{to}}.";

  function addMine(cat, kidsEl, beforeEl) {
    const form = miniForm({
      fields: commandFields(),
      submitLabel: "Add command",
      hint: BLANK_HINT,
      onCancel: () => form.remove(),
      onSave: (v) => {
        cat.items.push({ id: uid(), name: v.name, cmd: v.cmd, why: v.why });
        saveCustom();
        renderMine();
        toast(`Added to "${cat.name}".`);
      },
    });
    kidsEl.insertBefore(form, beforeEl || null);
    form.focusFirst();
  }

  function editMine(cat, item, rowEl) {
    const form = miniForm({
      fields: commandFields(item),
      submitLabel: "Save",
      hint: BLANK_HINT,
      onCancel: () => form.replaceWith(rowEl),
      onSave: (v) => {
        Object.assign(item, { name: v.name, cmd: v.cmd, why: v.why });
        saveCustom();
        renderMine();
      },
    });
    rowEl.replaceWith(form);
    form.focusFirst();
  }

  function deleteMine(cat, item) {
    cat.items = cat.items.filter((i) => i.id !== item.id);
    saveCustom();
    renderMine();
    toast("Deleted.", 1800);
  }

  function renameCategory(cat, headEl) {
    const form = miniForm({
      fields: [{ key: "name", label: "Category name", value: cat.name, required: true }],
      submitLabel: "Save",
      onCancel: () => renderMine(),
      onSave: (v) => {
        cat.name = v.name;
        saveCustom();
        renderMine();
      },
    });
    headEl.replaceWith(form);
    form.focusFirst();
  }

  async function deleteCategory(cat) {
    if (cat.items.length) {
      const n = cat.items.length;
      const pick = await askChoice({
        title: `Delete "${cat.name}"?`,
        message: `This also deletes its ${n} command${n === 1 ? "" : "s"}.`,
        choices: [
          { id: "delete", label: "Delete", danger: true },
          { id: "keep", label: "Keep it", primary: true, cancel: true },
        ],
      });
      if (pick !== "delete") return;
    }
    custom = custom.filter((c) => c.id !== cat.id);
    saveCustom();
    renderMine();
  }

  function mineNode() {
    const kidsBuilder = (kids) => {
      if (!custom.length) {
        kids.append(el("div", "empty", "Make your own groups of commands. Press New category above, then drag commands in, or add your own."));
      }
      for (const cat of custom) {
        const node = branch(`my:${cat.id}`, cat.name, 1, (ck) => {
          for (const item of cat.items) ck.append(leaf({ ...item, trail: [MINE_ID, cat.name] }, 2, { mine: { cat, item } }));
          const add = el("button", "add-row");
          add.type = "button";
          add.append(icon("plus"), el("span", "", "Add a command"));
          add.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!ck.querySelector(".mini-form")) addMine(cat, ck, add);
          });
          ck.append(add);
        }, {
          count: cat.items.length,
          extraClass: "cat-drop",
          iconName: "folder",
          actions: [],
        });
        node.dataset.catid = cat.id;
        const head = node.querySelector(".tn-head");
        head.querySelector(".tn-name").after(
          iconButton("edit", "Rename this category", "mini-act", () => renameCategory(cat, head)),
          iconButton("trash", "Delete this category", "mini-act", () => deleteCategory(cat)),
        );
        kids.append(node);
      }
    };
    return branch(MINE_ID, "My categories", 0, kidsBuilder, { count: totalMine(), extraClass: "top", iconName: "mine" });
  }

  /** Rebuild just the "My categories" section, then the search index. */
  function renderMine() {
    const old = treeBody.querySelector(`.tn-branch[data-id="${MINE_ID}"]`);
    const fresh = mineNode();
    fresh.classList.add("top");
    if (old) old.replaceWith(fresh);
    refreshStars();
    if (treeFilter.value.trim()) applyFilter();
  }

  function startNewCategory() {
    open("tree", { focus: false });
    treeFilter.value = "";
    applyFilter();
    openIds.add(MINE_ID);
    save(OPEN_KEY, [...openIds]);
    renderMine();
    const node = treeBody.querySelector(`.tn-branch[data-id="${MINE_ID}"]`);
    node.classList.remove("closed");
    const kids = node.querySelector(":scope > .tn-kids");
    kids.querySelector(".mini-form")?.remove();
    const form = miniForm({
      fields: [{ key: "name", label: "Name of your new category", placeholder: "e.g. My game, Work, Server", required: true }],
      submitLabel: "Create",
      onCancel: () => form.remove(),
      onSave: (v) => {
        const cat = { id: uid(), name: v.name, items: [] };
        custom.push(cat);
        saveCustom();
        openIds.add(`my:${cat.id}`);
        save(OPEN_KEY, [...openIds]);
        renderMine();
        toast(`Made "${cat.name}". Drag commands into it, or press Add a command.`);
      },
    });
    kids.prepend(form);
    node.scrollIntoView({ block: "nearest" });
    form.focusFirst();
  }

  /** Copy a command into one of your own categories (from dragging). */
  function addToCategory(catId, cmd) {
    const cat = custom.find((c) => c.id === catId);
    if (!cat) return;
    if (cat.items.some((i) => i.cmd === cmd)) {
      toast(`"${cat.name}" already has that one.`);
      return;
    }
    const info = infoFor(cmd);
    cat.items.push({ id: uid(), name: info?.name || info?.title || cmd, cmd, why: info?.why || "" });
    saveCustom();
    openIds.add(`my:${cat.id}`);
    renderMine();
    toast(`Added to "${cat.name}".`);
  }

  document.getElementById("tree-add").addEventListener("click", startNewCategory);

  /* ---------- The whole tree ---------- */

  function renderTree() {
    treeBody.replaceChildren();

    treeBody.append(branch(FAV_ID, FAV_ID, 0, () => {}, { count: favs.length, extraClass: "fav-drop top", iconName: "star" }));
    renderFavs();

    const mine = mineNode();
    mine.classList.add("top");
    treeBody.append(mine);

    treeBody.append(
      branch("Essentials", "Essentials", 0, (kids) => {
        for (const cmd of ESSENTIALS) kids.append(leaf(infoFor(cmd) || { name: cmd, cmd }, 1));
      }, { count: ESSENTIALS.length, extraClass: "top", iconName: "bolt" }),
    );

    for (const group of TREE) {
      const node = groupNode(group, 0, []);
      node.classList.add("top");
      treeBody.append(node);
    }
    refreshStars();
  }

  /* ---------- Search ---------- */

  const treeLeaves = flattenTree().map((item) => ({
    item,
    hay: `${item.name} ${item.cmd} ${item.why || ""} ${item.trail.join(" ")} ${hintsFor(item.cmd)}`.toLowerCase(),
    nameHay: `${item.name} ${hintsFor(item.cmd)}`.toLowerCase(),
  }));
  const MAX_RESULTS = 40;

  function allLeaves() {
    const mine = custom.flatMap((cat) =>
      cat.items.map((item) => {
        const full = { ...item, trail: [MINE_ID, cat.name] };
        return { item: full, hay: `${item.name} ${item.cmd} ${item.why || ""} ${cat.name} my`.toLowerCase(), nameHay: item.name.toLowerCase() };
      }),
    );
    return [...mine, ...treeLeaves];
  }

  // A ranked list. Exact matches come first, then ones that only match by similar words
  // ("delete" also finds "remove"). Each result shows the group it lives in.
  function applyFilter() {
    const text = treeFilter.value.trim();
    const words = text ? queryWords(text) : [];
    const searching = words.length > 0;
    treeBody.hidden = searching;
    resultsBody.hidden = !searching;
    tools.hidden = searching;
    if (!searching) return;

    const leaves = allLeaves();
    let scored = [];
    for (const entry of leaves) {
      let score = 0;
      if (matchesExactly(entry.hay, words)) score = matchesExactly(entry.nameHay, words) ? 4 : 3; // in the name counts most
      else if (matchesLoosely(entry.hay, words)) score = matchesLoosely(entry.nameHay, words) ? 2 : 1;
      if (score) scored.push({ ...entry, score });
    }
    scored.sort((x, y) => y.score - x.score); // stable: ties keep their order

    // Nothing matched every word? Offer the commands that match the most words.
    let closest = false;
    if (!scored.length) {
      for (const entry of leaves) {
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

  /* ---------- Shortcuts tab ---------- */

  function renderKeys() {
    const words = keysFilter.value.toLowerCase().split(/\s+/).filter(Boolean);
    keysBody.replaceChildren();
    let any = false;
    for (const group of SHORTCUTS) {
      const rows = group.rows.filter((r) => {
        const hay = `${group.name} ${r.keys.join(" ")} ${r.what}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      if (!rows.length) continue;
      any = true;
      const sec = el("section", "key-group");
      sec.append(el("h3", "", group.name));
      for (const r of rows) {
        const row = el("div", "keys-row");
        const combo = el("span", "combo");
        r.keys.forEach((k, i) => {
          if (i > 0 && r.keys.length > 1 && !k.includes(" ")) combo.append(el("span", "plus", "+"));
          combo.append(el("kbd", "", k));
        });
        row.append(el("span", "what", r.what), combo);
        sec.append(row);
      }
      keysBody.append(sec);
    }
    if (!any) keysBody.append(el("div", "empty", "No shortcut matches. Try \"copy\", \"tab\" or \"size\"."));
  }
  keysFilter.addEventListener("input", renderKeys);

  /* ---------- Go ---------- */

  dragger.attach(treeBody);
  dragger.attach(resultsBody);
  renderTree();
  renderKeys();
  showTab(tab, false);

  return { toggle, open, close, closeInstant, isOpen, addFav, addToCategory, startNewCategory };
}
