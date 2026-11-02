// The welcome banner, printed into a terminal tab as plain text:
// the AKIN logo made of characters, then the system info as a centred table.
// Because it is ordinary terminal text, it scrolls away like any other output
// and takes no permanent space.
import { THEME } from "./theme.js";

import { stripAnsi, parseAnsi, cutPieces, piecesToAnsi } from "./ansi.js";
import { STYLES, sampleLogo, charFor, SCRAMBLE, logoAspect } from "./asciilogo.js";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const bgRgb = () => [1, 3, 5].map((i) => parseInt(THEME.background.slice(i, i + 2), 16)); // the terminal background

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const width = (s) => [...stripAnsi(s)].length;
const padTo = (s, w) => s + " ".repeat(Math.max(0, w - width(s)));
const fg = (r, g, b) => `${ESC}38;2;${r};${g};${b}m`;

/** How many character columns wide the logo should be for this terminal. */
function logoColumns(termCols, termRows, aspect) {
  let cols = Math.round(termCols * 0.38);
  // Don't let the logo take more than about a third of the height.
  const maxRows = Math.max(7, Math.floor(termRows * 0.32));
  cols = Math.min(cols, Math.floor(maxRows * 2 * aspect));
  return Math.max(24, Math.min(cols, 90, termCols - 2));
}

/** The logo as lines of coloured text. `t` is ms since the start (null = fully settled). */
function logoLines(grid, style, t, margin) {
  const cfg = STYLES[style];
  const BG = bgRgb();
  const [cr, cg, cb] = cfg.color;
  // A faint tint behind the characters keeps the gothic shape solid.
  const tint = BG.map((b, i) => Math.round(b + (cfg.color[i] - b) * 0.24));
  const pad = " ".repeat(margin);
  const lines = [];

  for (let y = 0; y < grid.rows; y++) {
    let line = pad;
    let prev = "";
    for (let x = 0; x < grid.cols; x++) {
      const i = y * grid.cols + x;
      const cov = grid.cov[i];
      const rnd = grid.rand[i];
      const settled = t === null || t >= (x / grid.cols) * 1000 + rnd * 400;

      let ch = cov >= 0.1 ? charFor(style, cov, rnd) : "";
      if (!ch) {
        if (prev) {
          line += RESET;
          prev = "";
        }
        line += " ";
        continue;
      }

      let strength = 0.45 + 0.55 * Math.min(1, cov * 1.15);
      if (!settled) {
        ch = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
        strength = 0.35;
      }
      const r = Math.round(BG[0] + (cr - BG[0]) * strength);
      const g = Math.round(BG[1] + (cg - BG[1]) * strength);
      const b = Math.round(BG[2] + (cb - BG[2]) * strength);
      const bg = settled && cov >= 0.25 ? `;48;2;${tint.join(";")}` : "";
      const sgr = `${ESC}38;2;${r};${g};${b}${bg}m`;
      if (sgr !== prev) {
        line += sgr;
        prev = sgr;
      }
      line += ch;
    }
    lines.push(line + RESET);
  }
  return lines;
}

/** The system info as a centred table: headings on the left, dotted guide, values in a column. */
function infoLines(model, cols, withPalette = true) {
  const cell = (r) => {
    const pieces = parseAnsi(r.raw);
    return {
      label: piecesToAnsi(cutPieces(pieces, 0, r.idx)),
      labelLen: [...r.text.slice(0, r.idx)].length,
      value: piecesToAnsi(cutPieces(pieces, r.idx + 2)),
      valueLen: [...r.text.slice(r.idx + 2)].length,
    };
  };
  const L = model.left.map(cell);
  const R = model.right.map(cell);

  // One heading width for both columns, so every value lines up.
  const longest = Math.max(0, ...[...L, ...R].map((c) => c.labelLen));
  const lw = longest + 4; // heading, a space, at least two dots, a space
  const line = (c) =>
    `${c.label} ${fg(85, 96, 111)}${"·".repeat(lw - c.labelLen - 2)}${RESET} ${c.value}`;
  const lineWidth = (c) => lw + c.valueLen;

  const leftW = Math.max(0, ...L.map(lineWidth));
  const rightW = Math.max(0, ...R.map(lineWidth));
  const gap = 6;
  const sideBySide = leftW + gap + rightW <= cols - 2;
  const blockW = Math.min(sideBySide ? leftW + gap + rightW : Math.max(leftW, rightW), cols - 2);
  const margin = " ".repeat(Math.max(0, Math.floor((cols - blockW) / 2)));

  const out = [""];
  if (model.title) {
    const tw = width(model.title.raw);
    out.push(margin + " ".repeat(Math.max(0, Math.floor((blockW - tw) / 2))) + model.title.raw + RESET);
  }
  out.push(margin + `${fg(58, 65, 80)}${"─".repeat(blockW)}${RESET}`);

  if (sideBySide) {
    for (let i = 0; i < Math.max(L.length, R.length); i++) {
      const l = L[i] ? line(L[i]) : "";
      const r = R[i] ? line(R[i]) : "";
      out.push(margin + padTo(l, leftW) + " ".repeat(gap) + r);
    }
  } else {
    // Too narrow for two columns: stack them, headings still on one line.
    for (const c of L) out.push(margin + line(c));
    out.push("");
    for (const c of R) out.push(margin + line(c));
  }

  // Colour blocks, centred.
  if (withPalette) {
    const blocks = (start) =>
      Array.from({ length: 8 }, (_, i) => `${ESC}${start + i}m   `).join("") + RESET;
    const palMargin = " ".repeat(Math.max(0, Math.floor((cols - 24) / 2)));
    out.push("", palMargin + blocks(40), palMargin + blocks(100));
  }
  out.push("");
  return out;
}

/**
 * Print the banner into a terminal tab. With `animate`, the logo's characters
 * shuffle and settle from left to right (first tab only; it takes about a second and a half).
 */
export async function printBanner(term, model, { style, animate }) {
  const write = (s) => new Promise((resolve) => term.write(s, resolve));
  const useStyle = style === "shade" ? "shade" : "code";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Make everything fit on screen: first drop the colour blocks, then shrink the logo.
  const aspect = await logoAspect();
  const rowsFor = (c) => Math.max(6, Math.round(c / aspect / 2));
  const avail = term.rows - 3; // room for the prompt and a little breathing space
  let logoCols = logoColumns(term.cols, term.rows, aspect);
  let info = infoLines(model, term.cols, true);
  if (1 + rowsFor(logoCols) + info.length > avail) info = infoLines(model, term.cols, false);
  const room = avail - 1 - info.length;
  if (rowsFor(logoCols) > room) {
    logoCols = Math.max(24, Math.floor(Math.max(6, room) * 2 * aspect));
  }

  const grid = await sampleLogo(logoCols, 2, true, 0.9);
  const margin = Math.max(0, Math.floor((term.cols - grid.cols) / 2));

  await write("\r\n");
  if (animate && !reduced) {
    const start = performance.now();
    let first = true;
    for (;;) {
      const t = performance.now() - start;
      const done = t >= 1500;
      const lines = logoLines(grid, useStyle, done ? null : t, margin);
      await write((first ? "" : `${ESC}${grid.rows}A`) + lines.join("\r\n") + "\r\n");
      first = false;
      if (done) break;
      await sleep(70);
    }
  } else {
    await write(logoLines(grid, useStyle, null, margin).join("\r\n") + "\r\n");
  }
  await write(info.join("\r\n") + "\r\n");
}
