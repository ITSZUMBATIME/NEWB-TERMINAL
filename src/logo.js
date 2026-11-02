// What the welcome logo says and which font it is drawn in.
//
//   Text   anything you type (default "AKIN"), up to 14 characters.
//   Font   "FT Vortex", Metal Mania, a bold monospace, or any font file you put in
//          ~/.config/newb/fonts.
//
// FT Vortex is free for personal use only, so NEWB can't ship it. The plain AKIN logo is built in
// (it was traced from FT Vortex), and for any other text in FT Vortex you add your own copy of the
// font file to the fonts folder. Metal Mania (open licence) is the stand-in until you do.

import "@fontsource/metal-mania/latin-400.css";
import { invoke } from "@tauri-apps/api/core";
import { prefs } from "./prefs.js";
import { setLogoSource } from "./asciilogo.js";

const MAX_CHARS = 14;
const MONO = '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace';

const clean = (text) => (String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS)) || "AKIN";
const isBuiltInText = (text) => text.toUpperCase() === "AKIN";
const pretty = (stem) =>
  stem.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * options: { onChange() }   called after the logo's source changed, so it can be redrawn
 * returns { text, font, setText, setFont, options, note, subscribe, rescan, dir, prettyDir, maxChars }
 */
export function initLogo({ onChange }) {
  let userFonts = []; // { id, label, alias, vortex, face }
  let dir = null;
  let home = "";
  let stamp = null;
  let busy = false;
  const listeners = new Set();

  /* ---------- Working out what to draw ---------- */

  const vortexFile = () => userFonts.find((f) => f.vortex);

  function resolve() {
    const text = clean(prefs.get("logoText"));
    const want = prefs.get("logoFont");
    const metal = { kind: "text", text, family: '"Metal Mania"', weight: "400" };
    if (want === "vortex") {
      if (isBuiltInText(text)) return { spec: { kind: "svg" }, note: "" };
      const file = vortexFile();
      if (file) return { spec: { kind: "text", text, family: `"${file.alias}"`, weight: "400" }, note: "" };
      return {
        spec: metal,
        note: "FT Vortex is free for personal use only, so NEWB can't include it. Put your own copy of the font file in the fonts folder and this text will use it. Until then it uses Metal Mania.",
      };
    }
    if (want === "metal-mania") return { spec: metal, note: "" };
    if (want === "mono") return { spec: { kind: "text", text, family: MONO, weight: "800" }, note: "" };
    const file = userFonts.find((f) => f.id === want);
    if (file) return { spec: { kind: "text", text, family: `"${file.alias}"`, weight: "400" }, note: "" };
    return { spec: metal, note: "That font file isn't in the fonts folder any more, so this uses Metal Mania." };
  }

  let current = resolve();

  function apply() {
    current = resolve();
    setLogoSource(current.spec);
    onChange();
    for (const fn of listeners) fn();
  }

  /* ---------- Fonts you added ---------- */

  async function rescan(force = false) {
    if (busy) return;
    busy = true;
    try {
      const res = await invoke("scan_fonts", { since: force ? null : stamp });
      if (!res) return; // not running inside the app
      dir = res.dir;
      if (!res.fonts) return;
      stamp = res.stamp;
      for (const f of userFonts) document.fonts.delete(f.face);
      const next = [];
      for (const file of res.fonts) {
        try {
          const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
          const alias = `newb-user-${next.length}-${file.name}`;
          const face = new FontFace(alias, bytes.buffer);
          await face.load();
          document.fonts.add(face);
          next.push({ id: `file:${file.name}`, label: pretty(file.name), alias, vortex: /vortex/i.test(file.name), face });
        } catch (_) { /* not a font the browser can read: skip it */ }
      }
      userFonts = next;
      // Redraw the logo only if what it draws changed (your font arrived); always tell Settings.
      const now = resolve();
      const changed = JSON.stringify(now.spec) !== JSON.stringify(current.spec);
      current = now;
      if (changed) {
        setLogoSource(current.spec);
        onChange();
      }
      for (const fn of listeners) fn();
    } catch (_) {
      /* can't read the folder right now: keep what we have */
    } finally {
      busy = false;
    }
  }

  /* ---------- What Settings uses ---------- */

  const api = {
    maxChars: MAX_CHARS,
    text: () => clean(prefs.get("logoText")),
    font: () => prefs.get("logoFont"),
    setText: (text) => prefs.set("logoText", clean(text)),
    setFont: (id) => prefs.set("logoFont", id),
    options() {
      const list = [
        { id: "vortex", label: "FT Vortex" },
        { id: "metal-mania", label: "Metal Mania" },
        { id: "mono", label: "Bold monospace" },
      ];
      for (const f of userFonts) if (!f.vortex) list.push({ id: f.id, label: f.label });
      return list;
    },
    note: () => current.note,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    rescan,
    dir: () => dir,
    prettyDir: () => (dir && home && dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir || "~/.config/newb/fonts"),
  };

  prefs.subscribe((key) => {
    if (key === "logoText" || key === "logoFont") apply();
  });
  // Set what the logo shows before the first picture is drawn, then look for your fonts.
  setLogoSource(current.spec);
  (async () => {
    try { home = (await invoke("home_dir")) || ""; } catch (_) { /* paths just stay long */ }
    await rescan(true);
    window.addEventListener("focus", () => rescan());
  })();

  return api;
}
