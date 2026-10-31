// The system info display (the fastfetch-style lines).
// One set of data, shown two ways:
//   - as web text pinned under the logo (layouts "header" and "centred")
//   - as plain terminal text printed into a tab (layout "flow")

import { THEME, COLOR_NAMES } from "./theme.js";
import { stripAnsi, parseAnsi, cutPieces, piecesToFragment } from "./ansi.js";

const E = "\x1b[";

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
    rows.push({ raw: line, text, idx });
  }

  // Left: the software side. Right: the machine itself (starting at "Terminal").
  let split = rows.findIndex((r) => r.text.startsWith("Terminal"));
  if (split <= 0) split = Math.ceil(rows.length / 2);
  return { title, left: rows.slice(0, split), right: rows.slice(split) };
}

/* ---------- Web text ---------- */

function webRow(row) {
  const pieces = parseAnsi(row.raw);
  const el = document.createElement("div");
  el.className = "info-row";
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.append(piecesToFragment(cutPieces(pieces, 0, row.idx + 1))); // label and its colon
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

/* ---------- Terminal text ---------- */

const width = (s) => [...stripAnsi(s)].length;
const padTo = (s, w) => s + " ".repeat(Math.max(0, w - width(s)));

/**
 * Build the text printed at the top of a tab. Two columns when the terminal is
 * wide enough, otherwise one column.
 */
export function flowText(model, cols) {
  const indent = 3;
  const gap = 4;
  const pad = " ".repeat(indent);
  const reset = `${E}0m`;

  const left = model.left.map((r) => r.raw + reset);
  const right = model.right.map((r) => r.raw + reset);
  const leftW = Math.max(0, ...left.map(width));
  const rightW = Math.max(0, ...right.map(width));
  const twoCols = cols >= indent + leftW + gap + rightW + 2;

  const out = [""];
  if (model.title) out.push(pad + model.title.raw + reset);
  const ruleW = twoCols
    ? leftW + gap + rightW
    : Math.min(Math.max(leftW, rightW), Math.max(10, cols - indent - 2));
  out.push(pad + `${E}90m${"─".repeat(ruleW)}${reset}`);

  if (twoCols) {
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) {
      const l = left[i] ?? "";
      const r = right[i] ?? "";
      out.push(pad + padTo(l, leftW) + " ".repeat(gap) + r);
    }
  } else {
    for (const l of [...left, ...right]) out.push(pad + l);
  }

  // Colour blocks, like fastfetch's palette.
  const blocks = (start) =>
    Array.from({ length: 8 }, (_, i) => `${E}${start + i}m   `).join("") + reset;
  out.push("", pad + blocks(40), pad + blocks(100), "");
  return out.join("\r\n") + "\r\n";
}
