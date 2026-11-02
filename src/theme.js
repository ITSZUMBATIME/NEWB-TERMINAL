// NEWB colours. Used by the terminal itself and by the system info display.

export const THEME = {
  background: "#14161a",
  foreground: "#c8ccd4",
  cursor: "#c8ccd4",
  selectionBackground: "#3a4150",
  black: "#1b1e24",
  red: "#e5484d",
  green: "#3fb950",
  yellow: "#e0a63a",
  blue: "#4ea1ff",
  magenta: "#b57bee",
  cyan: "#39c5cf",
  white: "#c8ccd4",
  brightBlack: "#5b616b",
  brightRed: "#ff6369",
  brightGreen: "#56d364",
  brightYellow: "#f2c14e",
  brightBlue: "#79b8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#ffffff",
};

export const COLOR_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

// Colours the interface itself needs in JavaScript (kept up to date by themes.js).
export const UI = {
  accent: "#4ea1ff",
  onAccent: "#14161a",
  armed: { bg: "#4ea1ff", fg: "#0b0d10" },
  pending: { bg: "#2a4a78", fg: "#ffffff" },
};
