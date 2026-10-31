// Reads terminal colour codes (like the ones fastfetch prints) so the same text
// can be shown in the terminal OR as styled web text.

import { THEME, COLOR_NAMES } from "./theme.js";

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function color256(n) {
  if (n < 8) return THEME[COLOR_NAMES[n]];
  if (n < 16) return THEME["bright" + cap(COLOR_NAMES[n - 8])];
  if (n < 232) {
    n -= 16;
    const v = (x) => (x ? 55 + x * 40 : 0);
    return `rgb(${v(Math.floor(n / 36))},${v(Math.floor(n / 6) % 6)},${v(n % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}

function applySgr(st, params) {
  const codes = params === "" ? [0] : params.split(";").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) {
      st.fg = null; st.bold = false; st.ul = false;
    } else if (c === 1) st.bold = true;
    else if (c === 22) st.bold = false;
    else if (c === 4) st.ul = true;
    else if (c === 24) st.ul = false;
    else if (c >= 30 && c <= 37) st.fg = THEME[COLOR_NAMES[c - 30]];
    else if (c >= 90 && c <= 97) st.fg = THEME["bright" + cap(COLOR_NAMES[c - 90])];
    else if (c === 39) st.fg = null;
    else if (c === 38 && codes[i + 1] === 5) { st.fg = color256(codes[i + 2] ?? 0); i += 2; }
    else if (c === 38 && codes[i + 1] === 2) { st.fg = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`; i += 4; }
    else if (c === 48 && codes[i + 1] === 5) i += 2; // background colours: skipped
    else if (c === 48 && codes[i + 1] === 2) i += 4;
  }
}

/** Remove colour codes, leaving the plain visible text. */
export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Split coloured text into pieces: [{ text, fg, bold, ul }]. */
export function parseAnsi(s) {
  const out = [];
  const st = { fg: null, bold: false, ul: false };
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), ...st });
    last = re.lastIndex;
    applySgr(st, m[1]);
  }
  if (last < s.length) out.push({ text: s.slice(last), ...st });
  return out;
}

/** Cut a list of pieces to the visible characters [from, to). */
export function cutPieces(pieces, from, to = Infinity) {
  const out = [];
  let pos = 0;
  for (const p of pieces) {
    const start = pos;
    const end = pos + p.text.length;
    pos = end;
    const a = Math.max(from, start);
    const b = Math.min(to, end);
    if (b > a) out.push({ ...p, text: p.text.slice(a - start, b - start) });
  }
  return out;
}

/** Turn pieces into web elements. */
export function piecesToFragment(pieces) {
  const frag = document.createDocumentFragment();
  for (const p of pieces) {
    const span = document.createElement("span");
    span.textContent = p.text;
    if (p.fg) span.style.color = p.fg;
    if (p.bold) span.style.fontWeight = "bold";
    if (p.ul) span.style.textDecoration = "underline";
    frag.append(span);
  }
  return frag;
}
