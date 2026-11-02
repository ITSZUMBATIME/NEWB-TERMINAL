// Reading colour themes from files. NEWB's own format is a small colors.toml (the same one
// Omarchy uses), but a theme folder that only has an Alacritty, kitty or Ghostty colour file works too,
// because that is what many shared themes ship with.
//
//   colors.toml        background, foreground, accent, cursor, selection_background, color0 ... color15
//   alacritty.toml     [colors.primary], [colors.normal], [colors.bright] ...
//   kitty.conf         foreground #rrggbb / background #rrggbb / color0 #rrggbb ...
//   ghostty.conf       background = rrggbb / palette = 0=#rrggbb ...
//
// Anything missing is filled in from NEWB Dark or NEWB Light, so even three colours make a theme.
// Nothing here runs anything. It only reads text and works out colours.

import { THEMES, hexToRgb, toHex, mix } from "./themes.js";

/* ---------- Small readers ---------- */

/** "#1a1b26", "1a1b26", "0x1a1b26" or "#abc" all become "#1a1b26". Anything else is null. */
export function parseColour(value) {
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/^0x/i, "#");
  if (/^[0-9a-f]{3,8}$/i.test(s)) s = `#${s}`;
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.slice(0, 6)}`;
}

/** The small part of TOML these files use: [tables] and key = "value" lines. */
export function parseToml(text) {
  const out = {};
  let table = "";
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const head = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (head) {
      table = head[1].trim();
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.\-"']+)\s*=\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].replace(/["']/g, "");
    const rest = kv[2].trim();
    const quoted = rest.match(/^"((?:[^"\\]|\\.)*)"/) || rest.match(/^'([^']*)'/);
    const value = quoted ? quoted[1] : rest.split("#")[0].trim();
    out[table ? `${table}.${key}` : key] = value;
  }
  return out;
}

const NORMAL = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

// Every reader gives back the same shape:
//   { name?, mode?, background?, foreground?, accent?, cursor?, selection?, orange?, ansi: [16 x colour or undefined] }

function fromColorsToml(text) {
  const t = parseToml(text);
  const ansi = Array.from({ length: 16 }, (_, i) => parseColour(t[`color${i}`]));
  // also understand the plain names (red = "#...") if the numbered ones are missing
  NORMAL.forEach((n, i) => {
    ansi[i] = ansi[i] || parseColour(t[n]);
    ansi[i + 8] = ansi[i + 8] || parseColour(t[`bright_${n}`]);
  });
  const mode = String(t.mode || "").toLowerCase();
  return {
    name: typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 40) : undefined,
    mode: mode === "light" || mode === "dark" ? mode : undefined,
    background: parseColour(t.background),
    foreground: parseColour(t.foreground),
    accent: parseColour(t.accent),
    cursor: parseColour(t.cursor),
    selection: parseColour(t.selection_background) || parseColour(t.selection),
    orange: parseColour(t.orange),
    ansi,
  };
}

function fromAlacritty(text) {
  const t = parseToml(text);
  const ansi = Array.from({ length: 16 }, () => undefined);
  NORMAL.forEach((n, i) => {
    ansi[i] = parseColour(t[`colors.normal.${n}`]);
    ansi[i + 8] = parseColour(t[`colors.bright.${n}`]);
  });
  return {
    background: parseColour(t["colors.primary.background"]),
    foreground: parseColour(t["colors.primary.foreground"]),
    cursor: parseColour(t["colors.cursor.cursor"]),
    selection: parseColour(t["colors.selection.background"]),
    ansi,
  };
}

function fromKitty(text) {
  const t = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^([a-z_0-9]+)\s+(\S+)/);
    if (m && !line.trim().startsWith("#")) t[m[1]] = m[2];
  }
  return {
    background: parseColour(t.background),
    foreground: parseColour(t.foreground),
    cursor: parseColour(t.cursor),
    selection: parseColour(t.selection_background),
    ansi: Array.from({ length: 16 }, (_, i) => parseColour(t[`color${i}`])),
  };
}

function fromGhostty(text) {
  const ansi = Array.from({ length: 16 }, () => undefined);
  const t = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^([a-z\-]+)\s*=\s*(.+)$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (m[1] === "palette") {
      const p = m[2].trim().match(/^(\d+)\s*=\s*(\S+)/);
      if (p && Number(p[1]) < 16) ansi[Number(p[1])] = parseColour(p[2]);
    } else {
      t[m[1]] = m[2].trim();
    }
  }
  return {
    background: parseColour(t.background),
    foreground: parseColour(t.foreground),
    cursor: parseColour(t["cursor-color"]),
    selection: parseColour(t["selection-background"]),
    ansi,
  };
}

/* ---------- From a folder to a theme ---------- */

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** "tokyo-night" becomes "Tokyo Night". */
export function prettyName(folder) {
  return folder
    .replace(/[-_.]+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase()) || folder;
}

/**
 * Turn what the folder scan found into a theme the engine understands, or null if there are no
 * usable colours in it. `folder` is { name, path, files }.
 */
export function themeFromFolder(folder) {
  const f = folder.files || {};
  let raw = null;
  let from = "";
  if (f["colors.toml"] !== undefined) [raw, from] = [fromColorsToml(f["colors.toml"]), "colors.toml"];
  else if (f["alacritty.toml"] !== undefined) [raw, from] = [fromAlacritty(f["alacritty.toml"]), "alacritty.toml"];
  else if (f["kitty.conf"] !== undefined) [raw, from] = [fromKitty(f["kitty.conf"]), "kitty.conf"];
  else if (f["ghostty.conf"] !== undefined) [raw, from] = [fromGhostty(f["ghostty.conf"]), "ghostty.conf"];
  if (!raw) return null;
  const hasAnything = raw.background || raw.foreground || raw.accent || raw.ansi.some(Boolean);
  if (!hasAnything) return null;

  const mode = raw.mode || (f["light.mode"] !== undefined ? "light" : null) ||
    (raw.background ? (luminance(raw.background) > 0.5 ? "light" : "dark") : "dark");
  const dark = mode !== "light";
  const base = THEMES.find((x) => x.id === (dark ? "newb-dark" : "newb-light"));

  const ansi = base.ansi.map((fallback, i) => raw.ansi[i] || (i >= 8 ? raw.ansi[i - 8] : null) || fallback);
  const bg = raw.background || base.bg;
  const ink = raw.foreground || base.ink;
  const red = ansi[1];
  const amber = ansi[3];
  return {
    id: `custom:${folder.name}`,
    name: raw.name || prettyName(folder.name),
    dark,
    bg,
    ink,
    accent: raw.accent || ansi[4],
    red,
    green: ansi[2],
    amber,
    orange: raw.orange || toHex(mix(hexToRgb(red), hexToRgb(amber), 0.5)),
    purple: ansi[5],
    cyan: ansi[6],
    ansi,
    cursor: raw.cursor,
    selection: raw.selection,
    custom: true,
    folder: folder.name,
    path: folder.path,
    from,
  };
}

/* ---------- From a theme to a file ---------- */

/** The text of a colors.toml for this theme, with a few comments to help someone editing it. */
export function colorsTomlFor(theme, name = theme.name) {
  const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  const lines = [
    "# A NEWB theme. Change a colour, press Ctrl+S, and NEWB recolours itself straight away.",
    "# Colours look like #rrggbb. You can delete any line you don't want to change:",
    "# anything missing is filled in for you. (Omarchy themes use this same format.)",
    "",
    `name = "${name.replace(/"/g, "'")}"`,
    `mode = "${theme.dark ? "dark" : "light"}"   # dark or light`,
    "",
    "# The basics",
    `background = "${theme.bg}"   # behind everything`,
    `foreground = "${theme.ink}"   # the text`,
    `accent = "${theme.accent}"   # highlights, the selected tab, buttons`,
    `cursor = "${theme.cursor || theme.ink}"`,
    "",
    "# The 16 terminal colours. 0 to 7 are the normal ones, 8 to 15 the bright versions.",
  ];
  theme.ansi.forEach((c, i) => {
    const label = i < 8 ? names[i] : `bright ${names[i - 8]}`;
    lines.push(`color${i} = "${c}"   # ${label}`);
  });
  lines.push("");
  return lines.join("\n");
}
