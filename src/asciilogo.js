// Draws the AKIN logo out of characters ("ASCII art").
// The shape comes from the real logo file, so the gothic outline is kept.
// Two ways to show it:
//   - AsciiLogo: animated, on a canvas (used by the pinned layout)
//   - sampleLogo + charFor: the raw character grid (used by the printed banner)

import logoUrl from "./assets/akin-logo.svg?url";

const LOGO_ASPECT = 1312 / 520; // width / height of the logo shape

export const STYLES = {
  // Classic ASCII: heavy characters in the middle, lighter ones on the edges.
  shade: { cell: 6.2, cellAspect: 2, color: [232, 220, 192], glow: "rgba(232, 220, 192, 0.30)" },
  // Binary: the letters are made of 0s and 1s.
  code: { cell: 6.2, cellAspect: 2, color: [63, 185, 80], glow: "rgba(63, 185, 80, 0.45)" },
  // Dot matrix, like an LED sign.
  dots: { cell: 5, cellAspect: 1, color: [150, 200, 255], glow: "rgba(110, 170, 255, 0.40)" },
};

export const ASCII_STYLES = Object.keys(STYLES);
export const LOGO_ASPECT_RATIO = LOGO_ASPECT;

const RAMP = " .:-=+*#%@";
const INTERIOR = ["@", "@", "#", "%"];
const FONT = '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace';
export const SCRAMBLE = "01#%@+*:<>/\\";

let imagePromise = null;
function loadImage() {
  if (!imagePromise) {
    imagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = logoUrl;
    });
  }
  return imagePromise;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Look at the logo through a grid of `cols` columns and report how much of each
 * cell the logo covers (0 to 1). `cellAspect` is how much taller a cell is than wide.
 */
export async function sampleLogo(cols, cellAspect, softEdges = true, edgeBoost = 0.6) {
  const rows = Math.max(6, Math.round(cols / LOGO_ASPECT / cellAspect));
  const img = await loadImage();

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

  async layout() {
    if (!this.style) return;
    const style = this.style;
    const cfg = STYLES[style];
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.cssW = rect.width;
    this.cssH = rect.height;

    const cols = clamp(Math.round(rect.width / cfg.cell), 36, 140);
    const grid = await sampleLogo(cols, cfg.cellAspect, style !== "dots");
    const img = await loadImage();
    if (this.style !== style) return;

    const changed = !this.cov || this.cols !== grid.cols || this.rows !== grid.rows || this.drawnStyle !== style;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cov = grid.cov;
    this.rand = grid.rand;
    this.drawnStyle = style;

    // A faint, solid copy of the logo drawn behind the characters keeps the shape readable.
    const [gr, gg, gb] = cfg.color;
    const ghost = document.createElement("canvas");
    ghost.width = this.canvas.width;
    ghost.height = this.canvas.height;
    const gctx = ghost.getContext("2d");
    gctx.drawImage(img, 0, 0, ghost.width, ghost.height);
    gctx.globalCompositeOperation = "source-in";
    gctx.fillStyle = `rgb(${gr},${gg},${gb})`;
    gctx.fillRect(0, 0, ghost.width, ghost.height);
    this.ghost = style === "dots" ? null : ghost;

    if (changed) this.startedAt = performance.now(); // only shuffle in when something really changed
    this.frame();
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
