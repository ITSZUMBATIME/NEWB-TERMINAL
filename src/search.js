// The Search tab: find text across one project. Results are grouped by file; click a result and
// the file opens at that line. Hidden files, .gitignore'd files and binaries are skipped.

import { invoke } from "@tauri-apps/api/core";
import { el } from "./ui.js";
import { fileIcon } from "./icons.js";

const KEY = "newb.search.v1";

function loadOptions() {
  try {
    return { matchCase: false, wholeWord: false, regex: false, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch (_) {
    return { matchCase: false, wholeWord: false, regex: false };
  }
}

// Put <mark> around the matching bits of a line.
function highlighted(text, ranges) {
  const out = el("span", "sr-text");
  let at = 0;
  const chars = [...text];
  for (const [s, e] of ranges) {
    if (s < at) continue;
    if (s > at) out.append(chars.slice(at, s).join(""));
    out.append(el("mark", "", chars.slice(s, e).join("")));
    at = e;
  }
  if (at < chars.length) out.append(chars.slice(at).join(""));
  return out;
}

/**
 * options: { input, scopeSelect, caseBtn, wordBtn, regexBtn, summary, results,
 *            getScopes() -> [{ label, path }], getPreferredPath() -> string|null,
 *            onOpen(path, { line, col, len }), toast(msg) }
 * returns { show(), focus() }
 */
export function initSearch({ input, scopeSelect, caseBtn, wordBtn, regexBtn, summary, results, getScopes, getPreferredPath, onOpen, toast }) {
  const opts = loadOptions();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* fine */ }
  };
  let token = 0;
  let timer = null;

  function showToggles() {
    caseBtn.classList.toggle("on", opts.matchCase);
    wordBtn.classList.toggle("on", opts.wholeWord);
    regexBtn.classList.toggle("on", opts.regex);
  }
  const flip = (key) => () => {
    opts[key] = !opts[key];
    save();
    showToggles();
    run();
    input.focus();
  };
  caseBtn.addEventListener("click", flip("matchCase"));
  wordBtn.addEventListener("click", flip("wholeWord"));
  regexBtn.addEventListener("click", flip("regex"));

  /* ---------- Where to search ---------- */

  function fillScopes() {
    const scopes = getScopes();
    const keep = scopeSelect.value;
    scopeSelect.replaceChildren(...scopes.map((s) => {
      const o = el("option", "", s.label);
      o.value = s.path;
      return o;
    }));
    const preferred = getPreferredPath();
    const want = scopes.find((s) => s.path === keep && keep) || scopes.find((s) => preferred && (preferred === s.path || preferred.startsWith(`${s.path}/`)));
    if (want) scopeSelect.value = want.path;
  }
  scopeSelect.addEventListener("change", run);

  /* ---------- Running a search and drawing the results ---------- */

  function clear(message) {
    results.replaceChildren();
    summary.textContent = message || "";
  }

  async function run() {
    clearTimeout(timer);
    const query = input.value;
    const root = scopeSelect.value;
    if (!query || !root) {
      token++;
      clear(root ? "" : "Add a project in the Repos tab, or use the Files folder.");
      return;
    }
    const mine = ++token;
    summary.textContent = "Searching…";
    try {
      const found = await invoke("search_project", { root, query, matchCase: opts.matchCase, wholeWord: opts.wholeWord, useRegex: opts.regex });
      if (mine !== token) return; // a newer search has started
      draw(root, found);
    } catch (err) {
      if (mine !== token) return;
      results.replaceChildren();
      summary.textContent = String(err);
    }
  }

  function draw(root, found) {
    results.replaceChildren();
    const n = found.files.length;
    if (!found.total) {
      summary.textContent = "Nothing found.";
      return;
    }
    summary.textContent = `${found.total}${found.truncated ? "+" : ""} result${found.total === 1 ? "" : "s"} in ${n} file${n === 1 ? "" : "s"}${found.truncated ? ". Showing the first ones, so try a longer word." : ""}`;

    for (const file of found.files) {
      const slash = file.path.lastIndexOf("/");
      const name = file.path.slice(slash + 1);
      const folder = slash === -1 ? "" : file.path.slice(0, slash + 1);

      const group = el("div", "sr-file");
      const head = el("div", "sr-file-head");
      head.append(el("span", "caret"), fileIcon(name, false), el("span", "sr-path", ""), el("span", "sr-count", String(file.hits.length)));
      const path = head.querySelector(".sr-path");
      if (folder) path.append(el("span", "sr-folder", folder));
      path.append(name);
      head.title = file.path;
      head.addEventListener("click", () => group.classList.toggle("closed"));
      group.append(head);

      const hits = el("div", "sr-hits");
      for (const hit of file.hits) {
        const row = el("div", "sr-hit");
        row.append(el("span", "sr-line", String(hit.line)), highlighted(hit.text, hit.ranges));
        const first = hit.ranges[0];
        row.addEventListener("click", () => onOpen(`${root}/${file.path}`, { line: hit.line, col: hit.col, len: first ? first[1] - first[0] : 0 }));
        hits.append(row);
      }
      group.append(hits);
      results.append(group);
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });

  showToggles();

  return {
    show() {
      fillScopes();
      if (input.value) run();
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    },
    focus: () => input.focus(),
  };
}
