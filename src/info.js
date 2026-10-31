// The system info display (the fastfetch-style lines).
// One set of data, shown two ways:
//   - as web text pinned under the logo (layout "pinned")
//   - as terminal text printed into a tab (see banner.js)

import { THEME, COLOR_NAMES } from "./theme.js";
import { stripAnsi, parseAnsi, cutPieces, piecesToFragment } from "./ansi.js";

// Rows with these headings are left out (add more names here to hide more).
const HIDDEN_LABELS = new Set(["Terminal"]);

/** Turn the raw lines from Rust into: a title, and rows split into two columns. */
export function buildModel(lines) {
  let title = null;
  const rows = [];
  for (const line of lines) {
    const text = stripAnsi(line);
    if (!text.trim()) continue; // blank lines and colour-block lines
    if (/^[-─=\s]+$/.test(text)) continue; // the dashed rule
    const idx = text.indexOf(": ");
    if (idx === -1) {
      if (!title) title = { raw: line, text };
      continue;
    }
    if (HIDDEN_LABELS.has(text.slice(0, idx))) continue;
    rows.push({ raw: line, text, idx });
  }

  // Two columns of equal height (the left one gets the extra row if the count is odd).
  const split = Math.ceil(rows.length / 2);
  return { title, left: rows.slice(0, split), right: rows.slice(split) };
}

/* ---------- Web text ---------- */

function webRow(row) {
  const pieces = parseAnsi(row.raw);
  const el = document.createElement("div");
  el.className = "info-row";
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  const name = document.createElement("span");
  name.className = "name"; // the colon is added by the stylesheet, where the layout wants one
  name.append(piecesToFragment(cutPieces(pieces, 0, row.idx)));
  const lead = document.createElement("span");
  lead.className = "lead"; // faint dotted line that guides the eye to the value
  lbl.append(name, lead);
  const val = document.createElement("span");
  val.className = "val";
  val.append(piecesToFragment(cutPieces(pieces, row.idx + 2)));
  el.append(lbl, document.createTextNode(" "), val);
  return el;
}

export function renderWeb(model, els) {
  els.title.replaceChildren();
  els.left.replaceChildren();
  els.right.replaceChildren();
  els.palette.replaceChildren();

  // Both columns share one heading width, so every value lines up.
  const longest = Math.max(0, ...[...model.left, ...model.right].map((r) => [...r.text.slice(0, r.idx)].length));
  els.title.closest("#info-inner").style.setProperty("--lw", `${longest + 3}ch`);

  if (model.title) els.title.append(piecesToFragment(parseAnsi(model.title.raw)));
  for (const r of model.left) els.left.append(webRow(r));
  for (const r of model.right) els.right.append(webRow(r));

  for (const prefix of ["", "bright"]) {
    for (const name of COLOR_NAMES) {
      const key = prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
      const sw = document.createElement("span");
      sw.style.background = THEME[key];
      els.palette.append(sw);
    }
  }
}
