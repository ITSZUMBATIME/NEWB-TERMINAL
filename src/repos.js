// The Repos tab: your projects (any folder with a git history in it), each with its branch and
// how many files have changed. Open a project to browse its files like in Files; changed files
// get a letter (M changed, A added, U new, D deleted, R renamed, ! conflict). Click a file to edit it.

import { invoke } from "@tauri-apps/api/core";
import { el, miniForm } from "./ui.js";
import { icon } from "./icons.js";

const KEY = "akin.repos.v1";
const WORD = { M: "Changed", A: "Added", U: "New file", D: "Deleted", R: "Renamed", "!": "Conflict" };

function loadConfig(home) {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c && Array.isArray(c.roots)) {
      return { roots: c.roots.filter((r) => typeof r === "string"), open: Array.isArray(c.open) ? c.open : [] };
    }
  } catch (_) { /* use the default */ }
  return { roots: [`${home}/Projects`], open: [] };
}

/**
 * options: { list, addBtn, refreshBtn, fillTree(container, dir, depth, ctx), dragger, home, toast,
 *            getFilesFolder(), isVisible(), onCd(path) }
 * returns { show, refresh, noteSaved(path) }
 */
export function initRepos({ list, addBtn, refreshBtn, fillTree, dragger, home, toast, getFilesFolder, isVisible, onCd }) {
  const cfg = loadConfig(home);
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) { /* fine */ }
  };
  const pretty = (p) => (p === home ? "~" : p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
  const expand = (p) => (p === "~" ? home : p.startsWith("~/") ? home + p.slice(1) : p).replace(/\/+$/, "") || "/";

  let repos = []; // { path, name, summary, error, node, row, meta, kids, ctx }
  const expandedByRepo = new Map(); // folders opened inside each project, kept when the list is redrawn
  let scanned = false;
  let refreshing = false;
  let gitMissingTold = false;

  /* ---------- What changed, as letters on the file rows ---------- */

  function indexChanges(repo) {
    repo.map = new Map();
    repo.newDirs = [];
    repo.changedDirs = new Set();
    for (const c of repo.summary?.changes || []) {
      const isDir = c.path.endsWith("/");
      const path = isDir ? c.path.slice(0, -1) : c.path;
      if (isDir) repo.newDirs.push(c.path);
      else repo.map.set(path, c.code);
      // every folder above (and a new folder itself) counts as "has changes inside"
      let i = path.indexOf("/");
      while (i !== -1) {
        repo.changedDirs.add(path.slice(0, i));
        i = path.indexOf("/", i + 1);
      }
      if (isDir) repo.changedDirs.add(path);
    }
  }

  function codeFor(repo, rel, isDir) {
    if (!repo.summary) return { code: null, dirChanged: false };
    if (isDir) return { code: null, dirChanged: repo.changedDirs.has(rel) || repo.newDirs.some((d) => `${rel}/`.startsWith(d)) };
    let code = repo.map.get(rel) || null;
    if (!code && repo.newDirs.some((d) => rel.startsWith(d))) code = "U";
    return { code, dirChanged: false };
  }

  function makeContext(repo) {
    return {
      expanded: expandedByRepo.get(repo.path) || expandedByRepo.set(repo.path, new Set()).get(repo.path), // folders opened inside this project
      decorate(row, path, isDir) {
        row.querySelector(":scope > .git-badge")?.remove();
        const { code, dirChanged } = codeFor(repo, path.slice(repo.path.length + 1), isDir);
        row.dataset.git = code || "";
        row.classList.toggle("git-changed", Boolean(code || dirChanged));
        if (code) {
          const badge = el("span", "git-badge", code);
          badge.title = WORD[code] || "";
          row.append(badge);
        }
      },
    };
  }

  function redecorate(repo) {
    for (const row of repo.node.querySelectorAll(".fx-row[data-path]")) {
      if (row !== repo.row) repo.ctx.decorate(row, row.dataset.path, row.dataset.dir === "1");
    }
  }

  function showMeta(repo) {
    const m = repo.meta;
    m.replaceChildren();
    if (repo.error) {
      m.append(el("span", "rp-branch", repo.error.length < 36 ? repo.error : "can't read this one"));
      return;
    }
    const s = repo.summary;
    if (!s) {
      m.append(el("span", "rp-branch", "checking…"));
      return;
    }
    m.append(el("span", "rp-branch", s.branch));
    if (s.ahead) m.append(el("span", "rp-sync", `↑${s.ahead}`));
    if (s.behind) m.append(el("span", "rp-sync", `↓${s.behind}`));
    const n = s.changes.length;
    m.append(el("span", n ? "rp-changes" : "rp-clean", n ? `${n} changed` : "clean"));
  }

  async function refreshSummaries() {
    if (refreshing || !repos.length) return;
    refreshing = true;
    try {
      await Promise.all(
        repos.map(async (repo) => {
          try {
            const next = await invoke("git_summary", { path: repo.path });
            const same = JSON.stringify(next) === JSON.stringify(repo.summary);
            repo.summary = next;
            repo.error = null;
            if (!same) {
              indexChanges(repo);
              showMeta(repo);
              redecorate(repo);
            }
          } catch (err) {
            repo.error = String(err);
            showMeta(repo);
            if (!gitMissingTold && /not installed/.test(repo.error)) {
              gitMissingTold = true;
              toast("git isn't installed, so branches and changes can't be shown.", 5000);
            }
          }
        }),
      );
    } finally {
      refreshing = false;
    }
  }

  /* ---------- Drawing the list ---------- */

  function repoNode(repo) {
    const node = el("div", "fx-node rp-node");
    const row = el("div", "fx-row rp-row");
    row.dataset.path = repo.path;
    row.dataset.name = repo.name;
    row.dataset.dir = "1";
    row.style.setProperty("--d", 0);
    const text = el("div", "rp-text");
    const meta = el("span", "rp-meta");
    text.append(el("span", "fx-name", repo.name), meta);
    const cd = el("button", "fx-cd", "cd");
    cd.title = "Type cd and this project's path in the terminal";
    cd.addEventListener("click", (e) => {
      e.stopPropagation();
      onCd(repo.path);
    });
    row.append(el("span", "caret"), icon("git"), text, cd);
    const kids = el("div", "fx-kids");
    node.append(row, kids);

    Object.assign(repo, { node, row, meta, kids, ctx: makeContext(repo) });
    indexChanges(repo);
    showMeta(repo);

    const openIt = () => {
      row.classList.add("open");
      fillTree(kids, repo.path, 1, repo.ctx);
    };
    row.addEventListener("click", () => {
      if (dragger.justDragged) return;
      if (row.classList.contains("open")) {
        row.classList.remove("open");
        kids.replaceChildren();
        cfg.open = cfg.open.filter((p) => p !== repo.path);
      } else {
        openIt();
        if (!cfg.open.includes(repo.path)) cfg.open.push(repo.path);
      }
      save();
    });
    row.addEventListener("dblclick", () => onCd(repo.path));
    if (cfg.open.includes(repo.path)) openIt();
    return node;
  }

  function rootsSection() {
    const box = el("div", "rp-roots");
    box.append(el("div", "rp-roots-head", "Looking for projects in"));
    for (const root of cfg.roots) {
      const line = el("div", "rp-root");
      line.append(el("span", "rp-root-path", pretty(root)));
      const del = el("button", "rp-root-del");
      del.type = "button";
      del.title = "Stop looking here";
      del.append(icon("close"));
      del.addEventListener("click", () => {
        cfg.roots = cfg.roots.filter((r) => r !== root);
        save();
        scan();
      });
      line.append(del);
      box.append(line);
    }
    const add = el("button", "link-btn strong");
    add.type = "button";
    add.append(icon("plus"), el("span", "", "Add a folder"));
    add.addEventListener("click", showAddForm);
    box.append(add);
    return box;
  }

  function draw() {
    list.replaceChildren();
    if (!repos.length) {
      list.append(
        el(
          "div",
          "empty rp-empty",
          cfg.roots.length
            ? "No projects found yet. A project is a folder with a .git folder inside it. Add the folder where you keep yours, below."
            : "Add the folder where you keep your projects, below.",
        ),
      );
    }
    for (const repo of repos) list.append(repoNode(repo));
    list.append(rootsSection());
  }

  async function scan() {
    list.replaceChildren(el("div", "fx-note", "Looking for projects…"));
    try {
      const found = await invoke("find_repos", { roots: cfg.roots });
      repos = found.map((r) => ({ ...r, summary: null, error: null }));
    } catch (_) {
      repos = [];
    }
    scanned = true;
    draw();
    refreshSummaries();
  }

  /* ---------- Adding a folder ---------- */

  function showAddForm() {
    list.querySelector(".mini-form")?.remove();
    const form = miniForm({
      fields: [{ key: "path", label: "Folder that holds your projects", placeholder: "~/Projects", value: pretty(getFilesFolder()), required: true }],
      submitLabel: "Add folder",
      hint: "NEWB looks inside it for projects. The folder Files is showing is filled in for you.",
      onCancel: () => form.remove(),
      onSave: async (v) => {
        const path = expand(v.path);
        try {
          await invoke("list_dir", { path, showHidden: false });
        } catch (_) {
          toast("That folder doesn't exist.", 3000);
          return;
        }
        if (cfg.roots.includes(path)) {
          toast("That folder is already in the list.", 2500);
          return;
        }
        cfg.roots.push(path);
        save();
        scan();
      },
    });
    list.prepend(form);
    form.focusFirst();
  }

  addBtn.addEventListener("click", showAddForm);
  refreshBtn.addEventListener("click", scan);

  // Keep branches and change counts fresh while the tab is on screen.
  setInterval(() => {
    if (isVisible() && !document.hidden) refreshSummaries();
  }, 4000);
  window.addEventListener("focus", () => {
    if (isVisible()) refreshSummaries();
  });

  return {
    show() {
      if (!scanned) scan();
      else refreshSummaries();
    },
    refresh: scan,
    noteSaved(path) {
      if (repos.some((r) => path.startsWith(`${r.path}/`))) refreshSummaries();
    },
    /** Something changed on disk: list the open projects again and open `dir` so it shows. */
    refreshTrees(dir) {
      for (const repo of repos) {
        const inside = dir && (dir === repo.path || dir.startsWith(`${repo.path}/`));
        if (inside) {
          repo.ctx.expanded.add(dir);
          if (!repo.row.classList.contains("open")) { // open the project so the new item shows
            repo.row.classList.add("open");
            if (!cfg.open.includes(repo.path)) cfg.open.push(repo.path);
            save();
          }
        }
        if (repo.row?.classList.contains("open")) fillTree(repo.kids, repo.path, 1, repo.ctx);
      }
      refreshSummaries();
    },
  };
}
