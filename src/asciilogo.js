// Draws the AKIN logo out of characters ("ASCII art") on a canvas.
// The shape comes from the real logo file, so the gothic outline is kept.
// Because it is drawn on a canvas it can scale with the window and animate.

import logoUrl from "./assets/akin-logo.svg?url";

const LOGO_ASPECT = 1312 / 520; // width / height of the logo shape

const STYLES = {
  // Classic ASCII: heavy characters in the middle, lighter ones on the edges.
  shade: { cell: 6.2, cellAspect: 2, color: [232, 220, 192], glow: "rgba(232, 220, 192, 0.30)" },
  // Binary: the letters are made of 0s and 1s.
  code: { cell: 6.2, cellAspect: 2, color: [63, 185, 80], glow: "rgba(63, 185, 80, 0.45)" },
  // Dot matrix, like an LED sign.
  dots: { cell: 5, cellAspect: 1, color: [150, 200, 255], glow: "rgba(110, 170, 255, 0.40)" },
};

export const ASCII_STYLES = Object.keys(STYLES);

const RAMP = " .:-=+*#%@";
const INTERIOR = ["@", "@", "#", "%"];
const FONT = '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace';

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
    const cfg = STYLES[this.style];
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.cssW = rect.width;
    this.cssH = rect.height;

    this.cols = clamp(Math.round(rect.width / cfg.cell), 36, 140);
    this.rows = Math.max(6, Math.round(this.cols / LOGO_ASPECT / cfg.cellAspect));

    const img = await loadImage();
    if (!this.style) return;

    // Look at the logo through a grid: how much of each cell is covered?
    const px = 4;
    const off = document.createElement("canvas");
    off.width = this.cols * px;
    off.height = Math.round(this.rows * px * cfg.cellAspect);
    const octx = off.getContext("2d", { willReadFrequently: true });
    octx.drawImage(img, 0, 0, off.width, off.height);
    const data = octx.getImageData(0, 0, off.width, off.height).data;
    const cellH = off.height / this.rows;

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
    this.ghost = this.style === "dots" ? null : ghost;

    const n = this.cols * this.rows;
    this.cov = new Float32Array(n);
    this.rand = new Float32Array(n);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
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
        const i = y * this.cols + x;
        const avg = sum / count / 255;
        // Character styles also light up any cell the logo merely touches, so thin strokes survive.
        this.cov[i] = this.style === "dots" ? avg : Math.max(avg, (peak / 255) * 0.6);
        this.rand[i] = Math.random();
      }
    }
    this.startedAt = performance.now();
    this.frame();
  }

  finalChar(i) {
    const cov = this.cov[i];
    const r = this.rand[i];
    if (this.style === "shade") {
      if (cov < 0.1) return "";
      if (cov > 0.8) return INTERIOR[Math.floor(r * INTERIOR.length)];
      return RAMP[Math.round(Math.pow(cov, 0.8) * (RAMP.length - 1))];
    }
    if (this.style === "code") {
      if (cov < 0.15) return "";
      if (cov < 0.35) return r < 0.5 ? ":" : ".";
      return r < 0.5 ? "0" : "1";
    }
    return "";
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

        let char = this.finalChar(i);
        let alpha = (0.45 + 0.55 * Math.min(1, cov * 1.15)) * (1 + lift * 0.3);
        if (!char) continue;
        if (!settled) {
          char = "01#%@+*:<>/\\"[Math.floor(Math.random() * 12)];
          alpha = 0.35;
        } else if (!this.reduced && Math.random() < 0.012) {
          char = "01#%@+*:<>/\\"[Math.floor(Math.random() * 12)]; // tiny flicker
        }
        ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha)})`;
        ctx.fillText(char, (x + 0.5) * cw, (y + 0.55) * ch);
      }
    }
  }
}
