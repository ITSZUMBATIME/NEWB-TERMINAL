// Copy and paste, the way Claude Code does it:
//   Ctrl+C  copies when text is selected; with nothing selected it stops the running command.
//   Ctrl+V  pastes.
// Plus a right-click menu with Copy, Paste, Select all and Clear screen.

import { el } from "./ui.js";
import { icon } from "./icons.js";

/** Put text on the clipboard. Returns true if it worked. */
export async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // Some systems refuse the modern way. The old way: select text in a hidden box and copy.
    const box = document.createElement("textarea");
    box.value = text;
    box.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.append(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_e) { /* fine */ }
    box.remove();
    return ok;
  }
}

/** Read the clipboard, or null if the system won't let us. */
export async function readText() {
  try {
    return await navigator.clipboard.readText();
  } catch (_) {
    return null;
  }
}

export async function copySelection(term, toast) {
  const text = term.getSelection();
  if (!text) return;
  const ok = await copyText(text);
  term.clearSelection();
  term.focus();
  toast(ok ? "Copied." : "Couldn't copy. Try Ctrl+Shift+C.", 1800);
}

/**
 * Handle Ctrl+C / Ctrl+V (and the Shift versions) for the terminal.
 * Returns false when we dealt with the key (so the terminal must not also use it),
 * or null when it should carry on as normal (for example Ctrl+C with nothing selected
 * must still reach the shell as "stop").
 */
export function handleClipboardKey(e, term, toast) {
  if (e.type !== "keydown" || !e.ctrlKey || e.altKey || e.metaKey) return null;
  const key = e.key.toLowerCase();
  if (key === "c") {
    if (term.hasSelection()) {
      e.preventDefault();
      copySelection(term, toast);
      return false;
    }
    return e.shiftKey ? false : null;
  }
  if (key === "v") {
    // Don't cancel the key: the browser's own paste then gives the terminal the text.
    return false;
  }
  return null;
}

/** Right-click menu on the terminal. */
export function initContextMenu({ panesEl, getTerm, send, toast }) {
  const menu = document.getElementById("ctx-menu");

  function hide() {
    menu.hidden = true;
  }

  function item(iconName, label, keys, onClick, disabled = false) {
    const b = el("button");
    b.type = "button";
    b.disabled = disabled;
    b.append(icon(iconName), el("span", "", label));
    if (keys) b.append(el("span", "keys", keys));
    b.addEventListener("click", () => {
      hide();
      onClick();
    });
    return b;
  }

  // Our menu replaces the browser's (Back, Reload, Inspect...), which means nothing here.
  // Text boxes keep their normal menu so you can paste into them.
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("input, textarea:not(.xterm-helper-textarea)")) return;
    e.preventDefault();
    if (!panesEl.contains(e.target)) {
      hide();
      return;
    }
    const term = getTerm();
    if (!term) return;
    const pageText = window.getSelection()?.toString() || ""; // text picked in the welcome header

    menu.replaceChildren(
      item("copy", "Copy", "Ctrl+C", async () => {
        if (term.hasSelection()) return copySelection(term, toast);
        toast((await copyText(pageText)) ? "Copied." : "Couldn't copy.", 1800);
      }, !term.hasSelection() && !pageText),
      item("paste", "Paste", "Ctrl+V", async () => {
        const text = await readText();
        if (text) term.paste(text);
        else toast("Press Ctrl+V to paste.", 2500);
        term.focus();
      }),
      el("hr"),
      item("selectall", "Select all", "", () => term.selectAll()),
      item("clear", "Clear screen", "Ctrl+L", () => send("\x0c")),
    );
    menu.hidden = false;
    // keep it on screen
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(4, Math.min(e.clientX, window.innerWidth - w - 6))}px`;
    menu.style.top = `${Math.max(4, Math.min(e.clientY, window.innerHeight - h - 6))}px`;
  });

  window.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) hide();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  window.addEventListener("blur", hide);
  window.addEventListener("wheel", hide, { passive: true });
}
