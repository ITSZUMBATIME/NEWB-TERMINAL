// NEWB's icons. All drawn as simple outlines on a 24 x 24 grid, so they scale cleanly at any
// interface size and can change look with the theme (colour, line thickness, corners).
//
//   icon("folder")            an icon by name
//   fileIcon(name, isDir)     the right icon for a file or folder in the explorer
//   mountIcons()              fills every <... data-icon="name"> in the page
//
// The look comes from the stylesheet: Classic = coloured, Flat = quiet grey,
// Terminal = green with sharp corners. Adding a new theme later is just more CSS.

const NS = "http://www.w3.org/2000/svg";

// A folder outline. Special folders put a small picture inside it.
const FOLDER = '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.5h8.8A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>';
// A page with a folded corner.
const PAGE = '<path d="M6.5 3h7l5 5v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M13.5 3v5h5"/>';

const ICONS = {
  /* ---- Buttons and controls ---- */
  split: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 4.5v15"/><path d="M15 9.5h3M15 12.5h3" opacity=".6"/>',
  files: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  commands: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 9.5l3 2.5-3 2.5M13 15h4"/>',
  keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6.5 10.5h.01M10 10.5h.01M13.5 10.5h.01M17 10.5h.01M7.5 14h9"/>',
  settings: '<path d="M10.3 4.9 L10.7 2.5 L13.3 2.5 L13.7 4.9 L15.8 5.8 L17.8 4.4 L19.6 6.2 L18.2 8.2 L19.1 10.3 L21.5 10.7 L21.5 13.3 L19.1 13.7 L18.2 15.8 L19.6 17.8 L17.8 19.6 L15.8 18.2 L13.7 19.1 L13.3 21.5 L10.7 21.5 L10.3 19.1 L8.2 18.2 L6.2 19.6 L4.4 17.8 L5.8 15.8 L4.9 13.7 L2.5 13.3 L2.5 10.7 L4.9 10.3 L5.8 8.2 L4.4 6.2 L6.2 4.4 L8.2 5.8z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 10v9.5h11V10"/><path d="M10.5 19.5v-5h3v5"/>',
  up: '<path d="M12 19V6.5M6.5 11.5L12 6l5.5 5.5"/>',
  follow: '<circle cx="12" cy="12" r="6"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/><path d="M12 12h.01"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4"/><path d="M19.5 4.5V9H15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.8"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  paste: '<rect x="5" y="5.5" width="14" height="15" rx="1.8"/><path d="M9 5.5V4h6v1.5M9 11h6M9 15h4"/>',
  selectall: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8.5 12h7"/>',
  clear: '<path d="M5 6.5h14M10 6.5V4.5h4v2M7 6.5l.8 13h8.4l.8-13"/>',
  edit: '<path d="M4.5 19.5l1-4.5L16 4.5 19.5 8 9 18.5z"/><path d="M13.5 7l3.5 3.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bolt: '<path d="M13 3L5.5 13.5h5.8L10.5 21l8-10.5h-5.8z"/>',

  /* ---- Command categories ---- */
  update: '<path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12a7.5 7.5 0 0 1 13.2-4.9"/><path d="M18.5 3.5v4h-4M5.5 20.5v-4h4"/>',
  package: '<path d="M12 3.2l8 4v9.6l-8 4-8-4V7.2z"/><path d="M4 7.2l8 4 8-4M12 11.2v9.6"/>',
  magnifier: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 10.5h5"/>',
  computer: '<rect x="3" y="4.5" width="18" height="12" rx="1.8"/><path d="M8.5 20h7M12 16.5V20"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17"/>',
  git: '<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="9" r="2"/><path d="M7 8v8M17 11c0 3.5-3.5 4.5-8 5.5"/>',
  drive: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M3 13h18M15.5 15.2h.01M18 15.2h.01"/>',
  wand: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M6.2 6.2l2.3 2.3M15.5 15.5l2.3 2.3M17.8 6.2l-2.3 2.3M8.5 15.5l-2.3 2.3"/>',
  mine: FOLDER + '<path d="M12 10.5v5M9.5 13h5"/>',

  /* ---- Files and folders in the explorer ---- */
  folder: FOLDER,
  "folder-documents": FOLDER + '<path d="M9 12.5h6M9 15.5h4"/>',
  "folder-downloads": FOLDER + '<path d="M12 10.5v5M9.8 13.5l2.2 2.2 2.2-2.2"/>',
  "folder-music": FOLDER + '<path d="M10.5 16V11l4-1v5"/><path d="M10.5 16h.01M14.5 15h.01"/>',
  "folder-pictures": FOLDER + '<path d="M8.5 16l2.5-2.8 2 2 1.5-1.5 2 2.3"/><path d="M9.5 11.5h.01"/>',
  "folder-videos": FOLDER + '<path d="M10.5 10.8v4.6l4-2.3z"/>',
  "folder-desktop": FOLDER + '<rect x="8.5" y="10.5" width="7" height="4.5" rx="0.8"/>',
  "folder-code": FOLDER + '<path d="M10.5 11l-2 2.2 2 2.2M13.5 11l2 2.2-2 2.2"/>',
  "folder-home": FOLDER + '<path d="M8.8 13.2L12 10.5l3.2 2.7M9.8 12.6v3h4.4v-3"/>',
  "folder-config": FOLDER + '<circle cx="12" cy="13.3" r="1.7"/><path d="M12 10.2v1.4M12 15v1.4M9 13.3h1.3M13.7 13.3H15"/>',
  file: PAGE,
  "file-text": PAGE + '<path d="M8.5 13h7M8.5 16h7M8.5 19h4"/>',
  "file-code": PAGE + '<path d="M10.5 12.5l-2 2 2 2M13.5 12.5l2 2-2 2"/>',
  "file-image": PAGE + '<path d="M8 19l3-3.2 2 2 2-2 2 2"/><path d="M9.5 12.5h.01"/>',
  "file-audio": PAGE + '<path d="M10.5 18V13l4-1v5"/><path d="M10.5 18h.01M14.5 17h.01"/>',
  "file-video": PAGE + '<path d="M10.5 12.5v5l4.2-2.5z"/>',
  "file-archive": PAGE + '<path d="M11 8.5h2M11 10.5h2M11 12.5h2"/><rect x="10" y="14.5" width="4" height="4" rx="0.8"/>',
  "file-exec": PAGE + '<path d="M9 13l2.2 2L9 17M13 17.5h3"/>',
  "file-pdf": PAGE + '<path d="M8.5 17.5v-4h1.6a1.2 1.2 0 0 1 0 2.4H8.5M13 17.5v-4M13 13.5h2.5M13 15.6h2"/>',
  "file-data": PAGE + '<path d="M8.5 13h7M8.5 16h7M12 12v6.5"/>',
  link: '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
};

const FOLDER_BY_NAME = {
  documents: "folder-documents", docs: "folder-documents", downloads: "folder-downloads", music: "folder-music",
  pictures: "folder-pictures", photos: "folder-pictures", videos: "folder-videos", movies: "folder-videos",
  desktop: "folder-desktop", projects: "folder-code", code: "folder-code", src: "folder-code", repos: "folder-code",
  ".config": "folder-config", config: "folder-config", ".local": "folder-config", ".cache": "folder-config",
};

const FILE_BY_EXT = {
  "file-code": "js mjs ts tsx jsx py rs go c h cpp hpp java kt rb php sh bash zsh fish lua cs swift sql html htm css scss vue svelte",
  "file-text": "txt md markdown rst log nfo rtf doc docx odt",
  "file-data": "json yaml yml toml xml csv tsv ini conf cfg env lock",
  "file-image": "png jpg jpeg gif webp svg bmp ico tiff avif heic",
  "file-audio": "mp3 flac wav ogg opus m4a aac mid midi",
  "file-video": "mp4 mkv webm mov avi wmv m4v",
  "file-archive": "zip tar gz tgz bz2 xz 7z rar zst iso rpm deb",
  "file-exec": "appimage run exe bin out",
  "file-pdf": "pdf epub",
};
const EXT_LOOKUP = new Map();
for (const [key, list] of Object.entries(FILE_BY_EXT)) for (const e of list.split(" ")) EXT_LOOKUP.set(e, key);

/** Which icon fits this file or folder name. */
export function iconNameFor(name, isDir) {
  const lower = name.toLowerCase();
  if (isDir) return FOLDER_BY_NAME[lower] || "folder";
  if (lower === "makefile" || lower === "dockerfile" || lower === "readme") return lower === "readme" ? "file-text" : "file-code";
  const dot = lower.lastIndexOf(".");
  return (dot > 0 && EXT_LOOKUP.get(lower.slice(dot + 1))) || "file";
}

/** The icon for a command group, by its name. */
const GROUP_ICONS = {
  favourites: "star", "★ favourites": "star", essentials: "bolt", update: "update", "install and remove": "package",
  "files and folders": "folder", "read and search": "magnifier", "your computer": "computer", network: "globe",
  git: "git", "disks and usb": "drive", "text and editing": "edit", "terminal tricks": "wand", "my categories": "mine",
};
export const groupIconName = (name) => GROUP_ICONS[name.toLowerCase()] || "folder";

/** Make an <svg> icon. `name` is a key above. */
export function icon(name, extraClass = "") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `ico ico-${name.split("-")[0]} ico-${name}${extraClass ? " " + extraClass : ""}`);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] || ICONS.file;
  return svg;
}

/** The icon for a file or folder in the explorer. */
export function fileIcon(name, isDir, isLink) {
  return icon(isLink && !isDir ? "link" : iconNameFor(name, isDir));
}

/** Fill in every element marked data-icon="name" (buttons in the page's HTML). */
export function mountIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (el.querySelector(":scope > .ico")) continue;
    el.prepend(icon(el.dataset.icon));
  }
}
