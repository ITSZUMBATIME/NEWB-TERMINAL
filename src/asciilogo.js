// Draws the logo out of characters ("ASCII art").
// The shape comes from the built-in AKIN picture (traced from the FT Vortex font), or from
// any text you type drawn in a font you choose. See logo.js for how that choice is made.
// Two ways to show it:
//   - AsciiLogo: animated, on a canvas (used by the pinned layout)
//   - sampleLogo + charFor: the raw character grid (used by the printed banner)

import logoUrl from "./assets/akin-logo.svg?url";

const BUILTIN_ASPECT = 1312 / 520; // width / height of the built-in logo shape

export const STYLES = {
  // Classic ASCII: heavy characters in the middle, lighter ones on the edges.
  shade: { cell: 6.2, cellAspect: 2, color: [232, 220, 192], glow: "rgba(232, 220, 192, 0.30)" },
  // Binary: the letters are made of 0s and 1s.
  code: { cell: 6.2, cellAspect: 2, color: [63, 185, 80], glow: "rgba(63, 185, 80, 0.45)" },
  // Dot matrix, like an LED sign.
  dots: { cell: 5, cellAspect: 1, color: [150, 200, 255], glow: "rgba(110, 170, 255, 0.40)" },
};

export const ASCII_STYLES = Object.keys(STYLES);

/** Recolour the logo styles for a theme. Each value is [r, g, b]. */
export function setLogoColors({ code, shade, dots }) {
  const set = (name, rgb, alpha) => {
    STYLES[name].color = rgb;
    STYLES[name].glow = `rgba(${rgb.join(", ")}, ${alpha})`;
  };
  set("code", code, 0.45);
  set("shade", shade, 0.3);
  set("dots", dots, 0.4);
}

const RAMP = " .:-=+*#%@";
const INTERIOR = ["@", "@", "#", "%"];
const FONT = '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace';
export const SCRAMBLE = "01#%@+*:<>/\\";

/* ---------- What the logo shows ---------- */

// { kind: "svg" }                      the built-in AKIN picture
// { kind: "text", text, family, weight }   some text in a font
let source = { kind: "svg" };
let logoPromise = null;

/** Change what the logo shows. Nothing is drawn until the next layout (see AsciiLogo.refresh). */
export function setLogoSource(next) {
  source = next;
  logoPromise = null;
}

function loadSvg() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, aspect: BUILTIN_ASPECT });
    img.onerror = reject;
    img.src = logoUrl;
  });
}

/** Draw the text big on a hidden canvas, trimmed to the letters, so it can be sampled like a picture. */
async function renderText({ text, family, weight = "400" }) {
  const size = 320;
  const font = `${weight} ${size}px ${family}`;
  try {
    await document.fonts.load(font, text);
  } catch (_) { /* draw with whatever is there */ }
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const m = probe.measureText(text);
  // A thin outline in the same colour fattens thin strokes, which would otherwise vanish when the
  // letters are turned into a grid of characters.
  const stroke = Math.round(size * 0.035);
  const pad = Math.round(size * 0.06) + stroke;
  const inkW = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
  const inkH = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  // Very short text would make a narrow, tall logo with mushy characters, so give it some room.
  const w = Math.max(inkW + pad * 2, Math.round((inkH + pad * 2) * 1.2));
  const h = inkH + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = stroke;
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";
  const x = Math.round((w - inkW) / 2 + m.actualBoundingBoxLeft);
  const y = pad + Math.ceil(m.actualBoundingBoxAscent);
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  return { img: canvas, aspect: w / h };
}

function loadLogo() {
  if (!logoPromise) {
    const mine = source;
    logoPromise = (mine.kind === "text" ? renderText(mine) : loadSvg()).catch(() => loadSvg());
  }
  return logoPromise;
}

/** Width divided by height of whatever the logo is showing now. */
export async function logoAspect() {
  return (await loadLogo()).aspect;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Look at the logo through a grid of `cols` columns and report how much of each
 * cell the logo covers (0 to 1). `cellAspect` is how much taller a cell is than wide.
 */
export async function sampleLogo(cols, cellAspect, softEdges = true, edgeBoost = 0.6) {
  const { img, aspect } = await loadLogo();
  const rows = Math.max(6, Math.round(cols / aspect / cellAspect));

  const px = 4;
  const off = document.createElement("canvas");
  off.width = cols * px;
  off.height = Math.round(rows * px * cellAspect);
  const octx = off.getContext("2d", { willReadFrequently: true });
  octx.drawImage(img, 0, 0, off.width, off.height);
  const data = octx.getImageData(0, 0, off.width, off.height).data;
  const cellH = off.height / rows;

  const cov = new Float32Array(cols * rows);
  const rand = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      let count = 0;
      let peak = 0;
      const y0 = Math.floor(y * cellH);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * cellH));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x * px; xx < (x + 1) * px; xx++) {
          const a = data[(yy * off.width + xx) * 4 + 3];
          sum += a;
          if (a > peak) peak = a;
          count++;
        }
      }
      const i = y * cols + x;
      const avg = sum / count / 255;
      // Character styles also light up any cell the logo merely touches, so thin strokes survive.
      cov[i] = softEdges ? Math.max(avg, (peak / 255) * edgeBoost) : avg;
      rand[i] = Math.random();
    }
  }
  return { cols, rows, cov, rand };
}

/** The character for one cell once it has "settled" ("" means leave it empty). */
export function charFor(style, cov, r) {
  if (style === "shade") {
    if (cov < 0.1) return "";
    if (cov > 0.8) return INTERIOR[Math.floor(r * INTERIOR.length)];
    return RAMP[Math.round(Math.pow(cov, 0.8) * (RAMP.length - 1))];
  }
  if (style === "code") {
    if (cov < 0.15) return "";
    if (cov < 0.35) return r < 0.5 ? ":" : ".";
    return r < 0.5 ? "0" : "1";
  }
  return "";
}

export class AsciiLogo {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.style = null;
    this.timer = null;
    this.layoutToken = 0;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    new ResizeObserver(() => this.layout()).observe(canvas);
  }

  /** Switch to one of the styles above, or null to stop drawing. */
  setStyle(name) {
    this.style = name && STYLES[name] ? name : null;
    clearInterval(this.timer);
    this.timer = null;
    if (!this.style) return;
    this.layout();
    if (!this.reduced) this.timer = setInterval(() => this.frame(), 66);
  }

  /** Stop animating (used while dragging, so nothing competes for the screen). */
  pause() {
    clearInterval(this.timer);
    this.timer = null;
  }

  resume() {
    if (this.style && !this.timer && !this.reduced) this.timer = setInterval(() => this.frame(), 66);
  }

  async layout() {
    if (!this.style) return;
    const style = this.style;
    const cfg = STYLES[style];
    const token = ++this.layoutToken;

    // Find out what the logo is first: its shape decides how big the canvas should be.
    const logo = await loadLogo();
    if (this.style !== style || token !== this.layoutToken) return;
    document.documentElement.style.setProperty("--logo-aspect", String(logo.aspect));
    const rect = this.canvas.getBoundingClientRect(); // measured after the size above took effect
    if (rect.width < 10) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);

    // Characters smaller than about 6.5 real pixels turn to mush, so when the interface is zoomed
    // out, use fewer, larger characters.
    const cell = Math.max(cfg.cell, 6.5 / dpr);
    const cols = clamp(Math.round(rect.width / cell), 30, 140);
    const grid = await sampleLogo(cols, cfg.cellAspect, style !== "dots");
    // A newer layout started while we waited (or the style changed): let that one finish.
    if (this.style !== style || token !== this.layoutToken) return;

    // A faint, solid copy of the logo drawn behind the characters keeps the shape readable.
    const [gr, gg, gb] = cfg.color;
    const ghost = document.createElement("canvas");
    ghost.width = width;
    ghost.height = height;
    const gctx = ghost.getContext("2d");
    gctx.drawImage(logo.img, 0, 0, ghost.width, ghost.height);
    gctx.globalCompositeOperation = "source-in";
    gctx.fillStyle = `rgb(${gr},${gg},${gb})`;
    gctx.fillRect(0, 0, ghost.width, ghost.height);

    // Only the first picture of a style (or a new logo) shuffles in. Resizing or recolouring just redraws it.
    const fresh = !this.cov || this.drawnStyle !== style;

    // Swap everything in one go. Resizing a canvas wipes it, so we do that last and draw
    // straight away: the logo never goes blank (that was the flash when the window changed shape).
    this.canvas.width = width;
    this.canvas.height = height;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cov = grid.cov;
    this.rand = grid.rand;
    this.drawnStyle = style;
    this.ghost = style === "dots" ? null : ghost;
    if (fresh) this.startedAt = performance.now();
    this.frame();
  }

  /** The logo's source changed (see setLogoSource): draw it afresh, letters shuffling in. */
  refresh() {
    this.cov = null;
    this.layout();
  }

  frame() {
    if (!this.style || !this.cov || document.hidden) return;
    const cfg = STYLES[this.style];
    const ctx = this.ctx;
    const dpr = this.canvas.width / this.cssW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const cw = this.cssW / this.cols;
    const ch = this.cssH / this.rows;
    const now = performance.now();
    const t = this.reduced ? 1e9 : now - this.startedAt;
    const [cr, cg, cb] = cfg.color;

    // A bright band slowly sweeps across, like a scanner.
    const bandPos = (((now / 3400) % 1.5) - 0.25) * this.cols;
    const bandW = this.cols * 0.07;

    if (this.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.ghost, 0, 0, this.cssW, this.cssH);
      ctx.restore();
    }

    const isDots = this.style === "dots";
    if (!isDots) {
      ctx.font = `bold ${(ch * 0.86).toFixed(1)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const cov = this.cov[i];
        if (cov < 0.1) continue;

        // Start-up: characters shuffle, then settle from left to right.
        const settleAt = (x / this.cols) * 1100 + this.rand[i] * 500;
        const settled = t >= settleAt;

        const d = (x - bandPos) / bandW;
        const lift = Math.exp(-d * d); // 0..1, strongest under the band
        const mix = lift * 0.65;
        const r = Math.round(cr + (255 - cr) * mix);
        const g = Math.round(cg + (255 - cg) * mix);
        const b = Math.round(cb + (255 - cb) * mix);

        if (isDots) {
          const base = settled ? Math.sqrt(cov) : 0.25;
          const radius = Math.max(0.4, Math.min(cw, ch) * 0.46 * base * (1 + lift * 0.25));
          ctx.fillStyle = `rgba(${r},${g},${b},${settled ? 0.55 + 0.45 * cov : 0.35})`;
          ctx.beginPath();
          ctx.arc((x + 0.5) * cw, (y + 0.5) * ch, radius, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        let char = charFor(this.style, cov, this.rand[i]);
        let alpha = (0.45 + 0.55 * Math.min(1, cov * 1.15)) * (1 + lift * 0.3);
        if (!char) continue;
        if (!settled) {
          char = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
          alpha = 0.35;
        } else if (!this.reduced && Math.random() < 0.012) {
          char = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]; // tiny flicker
        }
        ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha)})`;
        ctx.fillText(char, (x + 0.5) * cw, (y + 0.55) * ch);
      }
    }
  }
}
