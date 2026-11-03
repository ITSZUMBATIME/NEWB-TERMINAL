// The Repos tab: your projects (any folder with a git history in it), each with its branch and
// how many files have changed. Open a project to browse its files like in Files; changed files
// get a letter (M changed, A added, U new, D deleted, R renamed, ! conflict). Click a file to edit it.

import { invoke } from "@tauri-apps/api/core";
import { el, miniForm, shellQuote } from "./ui.js";
import { icon } from "./icons.js";

const KEY = "newb.repos.v1";
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
 *            getFilesFolder(), isVisible(), onCd(path), onOpenFile(path) }
 * returns { show, refresh, noteSaved(path) }
 */
export function initRepos({ list, addBtn, refreshBtn, fillTree, dragger, home, toast, getFilesFolder, isVisible, onCd, onOpenFile }) {
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
    updateSyncButton(repo);
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
              renderChanges(repo);
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

  /* ---------- Git: sync button, changes list, commit ---------- */

  // Say what went wrong in plain words, and what to do about it.
  function explainGitError(err, cmd) {
    const text = String(err);
    if (/Author identity unknown|Please tell me who you are|unable to auto-detect email/i.test(text)) {
      return 'Git doesn\'t know who you are yet. In the terminal, run: git config --global user.name "Your Name" and git config --global user.email "you@example.com"';
    }
    if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Permission denied|publickey/i.test(text)) {
      return `It needs you to sign in first. Run ${cmd} once in the terminal so git can ask for your password or token.`;
    }
    if (/not possible to fast-forward|divergent|diverged|non-fast-forward|rejected/i.test(text)) {
      return `You and the remote both have new changes, so this needs care. Use the terminal for it: ${cmd}`;
    }
    return text.split("\n").slice(0, 3).join(" ");
  }

  // The one button that changes meaning: Publish, Pull, Push, or just Fetch.
  function syncPlan(repo) {
    const s = repo.summary;
    if (!s || !s.has_remote) return null;
    if (!s.has_upstream) return { action: "publish", label: "Publish", cmd: "git push -u origin HEAD", busy: "Publishing…" };
    if (s.behind) return { action: "pull", label: `Pull ${s.behind}`, cmd: "git pull", busy: "Pulling…" };
    if (s.ahead) return { action: "push", label: `Push ${s.ahead}`, cmd: "git push", busy: "Pushing…", strong: true };
    return { action: "fetch", label: "Fetch", cmd: "git fetch", busy: "Checking…" };
  }

  function updateSyncButton(repo) {
    const b = repo.syncBtn;
    const plan = syncPlan(repo);
    b.hidden = !plan;
    if (!plan) return;
    b.textContent = repo.syncing ? plan.busy : plan.label;
    b.disabled = Boolean(repo.syncing);
    b.classList.toggle("strong", Boolean(plan.strong) || plan.action === "pull" || plan.action === "publish");
    b.title = `Runs: ${plan.cmd}`;
  }

  async function doSync(repo) {
    const plan = syncPlan(repo);
    if (!plan || repo.syncing) return;
    repo.syncing = true;
    updateSyncButton(repo);
    try {
      await invoke("git_sync", { path: repo.path, action: plan.action });
      toast(`Done: ${plan.cmd}`, 2500);
    } catch (err) {
      toast(explainGitError(err, plan.cmd), 9000);
    } finally {
      repo.syncing = false;
      refreshSummaries();
      updateSyncButton(repo);
    }
  }

  const checkedFiles = (repo) => (repo.summary?.changes || []).map((c) => c.path).filter((p) => !repo.unchecked.has(p));

  // The command that the Commit button runs, to copy or drag into the terminal.
  function commitCommand(repo, files) {
    const msg = repo.message.trim();
    return `git add -A -- ${files.map(shellQuote).join(" ")} && git commit -m ${shellQuote(msg)}`;
  }

  function updateCommitUi(repo) {
    const ui = repo.commitUi;
    if (!ui) return;
    const all = repo.summary?.changes || [];
    const files = checkedFiles(repo);
    const msg = repo.message.trim();
    ui.all.checked = files.length === all.length && all.length > 0;
    ui.all.indeterminate = files.length > 0 && files.length < all.length;
    ui.button.textContent = repo.committing ? "Committing…" : `Commit ${files.length} file${files.length === 1 ? "" : "s"} to ${repo.summary?.branch ?? "this branch"}`;
    ui.button.disabled = repo.committing || !files.length || !msg;
    if (files.length && msg) {
      const cmd = commitCommand(repo, files);
      ui.chip.dataset.cmd = cmd;
      ui.chipText.textContent = cmd;
      ui.chip.hidden = false;
    } else {
      ui.chip.hidden = true;
      delete ui.chip.dataset.cmd;
    }
  }

  async function commit(repo) {
    const files = checkedFiles(repo);
    const msg = repo.message.trim();
    if (!files.length || !msg || repo.committing) return;
    repo.committing = true;
    updateCommitUi(repo);
    try {
      await invoke("git_commit", { path: repo.path, files, message: msg });
      repo.message = "";
      repo.unchecked.clear();
      toast(`Committed: ${msg}`, 3000);
    } catch (err) {
      toast(explainGitError(err, "git commit"), 9000);
    } finally {
      repo.committing = false;
      await refreshSummaries();
      renderChanges(repo);
    }
  }

  // The "Changes" box under an open project: tick the files, say what you did, commit.
  function renderChanges(repo) {
    const box = repo.changesBox;
    const changes = repo.summary?.changes || [];
    const msgInput = repo.commitUi?.msg;
    const hadFocus = msgInput && document.activeElement === msgInput;
    const caret = hadFocus ? msgInput.selectionStart : 0;
    box.replaceChildren();
    repo.commitUi = null;
    if (!changes.length || !repo.row.classList.contains("open")) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    repo.unchecked = new Set([...repo.unchecked].filter((p) => changes.some((c) => c.path === p)));

    const all = el("input", "gc-check");
    all.type = "checkbox";
    all.title = "Tick or untick every file";
    all.addEventListener("change", () => {
      repo.unchecked = all.checked ? new Set() : new Set(changes.map((c) => c.path));
      for (const cb of box.querySelectorAll(".gc-file .gc-check")) cb.checked = all.checked;
      updateCommitUi(repo);
    });
    const head = el("label", "gc-head");
    head.append(all, el("span", "", `Changes · ${changes.length} file${changes.length === 1 ? "" : "s"}`));
    box.append(head);

    for (const c of changes) {
      const isDir = c.path.endsWith("/");
      const row = el("div", "gc-file");
      row.dataset.git = c.code;
      const cb = el("input", "gc-check");
      cb.type = "checkbox";
      cb.checked = !repo.unchecked.has(c.path);
      cb.addEventListener("change", () => {
        if (cb.checked) repo.unchecked.delete(c.path);
        else repo.unchecked.add(c.path);
        updateCommitUi(repo);
      });
      const name = el("span", "gc-name", c.path);
      name.title = c.code === "D" || isDir ? c.path : `Open ${c.path}`;
      if (c.code !== "D" && !isDir) name.addEventListener("click", () => onOpenFile(`${repo.path}/${c.path}`));
      const badge = el("span", "git-badge", c.code);
      badge.title = WORD[c.code] || "";
      row.append(cb, name, badge);
      box.append(row);
    }

    const msg = el("input", "gc-msg");
    msg.type = "text";
    msg.placeholder = "Describe what you changed";
    msg.spellcheck = true;
    msg.value = repo.message;
    msg.addEventListener("input", () => {
      repo.message = msg.value;
      updateCommitUi(repo);
    });
    msg.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(repo);
      }
    });
    const button = el("button", "gc-commit");
    button.type = "button";
    button.addEventListener("click", () => commit(repo));
    const chip = el("div", "gc-chip");
    chip.title = "The same thing as a command. Drag it into the terminal to run it yourself.";
    const chipText = el("code", "", "");
    chip.append(chipText);
    box.append(msg, button, chip);

    repo.commitUi = { all, msg, button, chip, chipText };
    updateCommitUi(repo);
    if (hadFocus) {
      msg.focus();
      msg.setSelectionRange(caret, caret);
    }
  }

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
    const syncBtn = el("button", "rp-sync-btn");
    syncBtn.type = "button";
    syncBtn.hidden = true;
    syncBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      doSync(repo);
    });
    row.append(el("span", "caret"), icon("git"), text, cd, syncBtn); // sync stays put when "cd" appears on hover
    const changesBox = el("div", "gc-box");
    changesBox.hidden = true;
    const kids = el("div", "fx-kids");
    node.append(row, changesBox, kids);

    Object.assign(repo, { node, row, meta, kids, syncBtn, changesBox, unchecked: new Set(), message: "", ctx: makeContext(repo) });
    indexChanges(repo);
    showMeta(repo);

    const openIt = () => {
      row.classList.add("open");
      fillTree(kids, repo.path, 1, repo.ctx);
      renderChanges(repo);
    };
    row.addEventListener("click", () => {
      if (dragger.justDragged) return;
      if (row.classList.contains("open")) {
        row.classList.remove("open");
        kids.replaceChildren();
        renderChanges(repo);
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
        rootsChanged();
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
        rootsChanged();
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

  const rootListeners = new Set();
  const rootsChanged = () => rootListeners.forEach((fn) => fn());

  return {
    /** The folders NEWB looks in for projects (used by Settings > Projects). */
    roots: () => [...cfg.roots],
    pretty,
    subscribeRoots(fn) {
      rootListeners.add(fn);
      return () => rootListeners.delete(fn);
    },
    /** Add a folder. Resolves with an error message, or null if it worked. */
    async addRoot(text) {
      const path = expand(text.trim());
      try {
        await invoke("list_dir", { path, showHidden: false });
      } catch (_) {
        return "That folder doesn't exist.";
      }
      if (cfg.roots.includes(path)) return "That folder is already in the list.";
      cfg.roots.push(path);
      save();
      scan();
      rootsChanged();
      return null;
    },
    removeRoot(path) {
      cfg.roots = cfg.roots.filter((r) => r !== path);
      save();
      scan();
      rootsChanged();
    },
    /** The projects found so far (for the Search tab's "where to look" list). */
    list: () => repos.map((x) => ({ name: x.name, path: x.path })),
    /** Resolves once the first look for projects has finished. */
    async ready() {
      if (!scanned) await scan();
    },
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
