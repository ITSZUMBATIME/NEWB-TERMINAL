// Your own themes, kept as folders in ~/.config/newb/themes (the same idea as Omarchy).
//
//   * The folder is watched: add, edit or delete a theme and NEWB follows within a moment.
//     Editing the theme you are using recolours the whole window as you save.
//   * "New theme from this one" copies the current colours into a new folder and opens the file.
//   * "Add from Git" downloads a theme (an Omarchy theme repository works as it is).
//
// Rust (themes.rs) lists the folders and does the download. The colours are read in themefiles.js,
// and themes.js does the recolouring.

import { invoke } from "@tauri-apps/api/core";
import { setCustomThemes, setTheme, currentTheme } from "./themes.js";
import { themeFromFolder, colorsTomlFor } from "./themefiles.js";
import { askChoice, askText } from "./ui.js";

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "my-theme";

/**
 * options: { toast, openForEdit(path) }
 * returns { start, rescan, createFromCurrent, install, remove, edit, dir, prettyDir }
 */
export function initCustomThemes({ toast, openForEdit }) {
  let dir = null;
  let home = "";
  let stamp = null;
  let busy = false;

  /** Look in the folder. `force` reads everything even if nothing seems to have changed. */
  async function rescan(force = false) {
    if (busy) return;
    busy = true;
    try {
      const res = await invoke("scan_themes", { since: force ? null : stamp });
      if (!res) return; // not running inside the app
      dir = res.dir;
      if (res.themes) {
        stamp = res.stamp;
        const list = [];
        for (const folder of res.themes) {
          const theme = themeFromFolder(folder);
          if (theme) list.push(theme);
        }
        const removed = setCustomThemes(list);
        if (removed) toast(`The theme "${removed}" was removed, so NEWB went back to NEWB Dark.`, 4500);
      }
    } catch (_) {
      /* can't read the folder right now: keep what we have */
    } finally {
      busy = false;
    }
  }

  async function start() {
    try { home = (await invoke("home_dir")) || ""; } catch (_) { /* paths just stay long */ }
    await rescan(true);
    setInterval(() => {
      if (!document.hidden) rescan();
    }, 1500);
    window.addEventListener("focus", () => rescan());
  }

  const prettyDir = () => (dir && home && dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir || "~/.config/newb/themes");

  /** Copy the colours you are using into a new theme folder, switch to it and open its file. */
  async function createFromCurrent() {
    const base = currentTheme();
    const name = await askText({
      title: "Name your new theme",
      message: `It starts as a copy of ${base.name}. You can change any colour in the file that opens.`,
      value: `My ${base.name}`.replace(/^My My /, "My "),
      okLabel: "Make it",
    });
    if (name === null || !name.trim()) return;
    try {
      if (!dir) await rescan(true);
      if (!dir) throw new Error("Can't find the themes folder.");
      const slug = slugify(name);
      let folder = slug;
      let path = null;
      for (let n = 2; n < 100 && !path; n++) {
        try {
          path = await invoke("create_folder", { dir, name: folder });
        } catch (e) {
          if (!String(e).includes("already exists")) throw e;
          folder = `${slug}-${n}`;
        }
      }
      if (!path) throw new Error("Couldn't make a folder for it.");
      const file = await invoke("create_file", { dir: path, name: "colors.toml" });
      await invoke("write_text_file", { path: file, text: colorsTomlFor(base, name.trim()) });
      await rescan(true);
      setTheme(`custom:${folder}`);
      await openForEdit(file);
      toast("Change a colour and press Ctrl+S. NEWB recolours straight away.", 5000);
    } catch (e) {
      toast(`Couldn't make the theme: ${e}`, 5000);
    }
  }

  /** Download a theme from a Git address. Returns an error message, or null if it worked. */
  async function install(url) {
    toast("Downloading the theme…", 2500);
    try {
      const folder = await invoke("install_theme", { url });
      await rescan(true);
      setTheme(`custom:${folder}`);
      toast(`Added "${currentTheme().name}" and switched to it.`, 3500);
      return null;
    } catch (e) {
      return String(e);
    }
  }

  /** Move one of your themes to the trash (after asking). */
  async function remove(theme) {
    const pick = await askChoice({
      title: `Remove "${theme.name}"?`,
      message: "Its folder goes to the trash, so you can get it back from there.",
      choices: [
        { id: "remove", label: "Move to trash", danger: true },
        { id: "keep", label: "Keep it", primary: true, cancel: true },
      ],
    });
    if (pick !== "remove") return;
    try {
      await invoke("trash_path", { path: theme.path });
      await rescan(true);
    } catch (e) {
      toast(`Couldn't remove it: ${e}`, 4000);
    }
  }

  /** Open the theme's colour file in the editor. */
  const edit = (theme) => openForEdit(`${theme.path}/${theme.from || "colors.toml"}`);

  return { start, rescan, createFromCurrent, install, remove, edit, dir: () => dir, prettyDir };
}
