// The quick theme picker (Ctrl+Shift+P): a short list of every theme. Move through it with the
// arrow keys and the whole window recolours as you go. Enter keeps the one you are on, Esc puts
// everything back. Typing narrows the list.

import { el } from "./ui.js";
import { allThemes, currentTheme, endPreview, previewTheme, setTheme, themeState } from "./themes.js";

/**
 * options: { toast(message), focusBack() }  focusBack hands the keyboard back to the terminal
 * returns { open(), isOpen() }
 */
export function initThemePicker({ toast, focusBack }) {
  let overlay = null;

  function open() {
    if (overlay) return;
    const original = currentTheme().id;
    let shown = allThemes();
    let sel = Math.max(0, shown.findIndex((t) => t.id === original));
    let kept = false;
    let lastX = -1;
    let lastY = -1;

    overlay = el("div", "tp");
    const box = el("div", "tp-box");
    const input = el("input", "tp-input");
    input.type = "text";
    input.placeholder = "Pick a theme. Arrow keys try them out";
    input.spellcheck = false;
    input.autocomplete = "off";
    const list = el("div", "tp-list");
    const foot = el("div", "tp-foot", "Enter keeps it · Esc puts things back");
    box.append(input, list, foot);
    overlay.append(box);
    document.body.append(overlay);

    function swatches(t) {
      const row = el("span", "tp-sw");
      for (const c of [t.bg, t.ink, t.accent, t.red, t.green, t.amber, t.purple, t.cyan]) {
        const dot = el("i");
        dot.style.background = c;
        row.append(dot);
      }
      return row;
    }

    function draw() {
      list.replaceChildren();
      shown.forEach((t, i) => {
        const row = el("div", `tp-item${i === sel ? " on" : ""}`);
        row.dataset.id = t.id;
        const tag = el("span", "tp-tag", t.custom ? "yours" : t.dark ? "dark" : "light");
        row.append(swatches(t), el("span", "tp-name", t.name), tag);
        if (t.id === original) row.append(el("span", "tp-now", "current"));
        // Only a real mouse movement picks a row (a pointer resting where the list appears must not).
        row.addEventListener("mousemove", (e) => {
          if (e.clientX === lastX && e.clientY === lastY) return;
          lastX = e.clientX;
          lastY = e.clientY;
          if (i !== sel) move(i, false);
        });
        row.addEventListener("click", () => close(true));
        list.append(row);
      });
      if (!shown.length) list.append(el("div", "tp-empty", "No theme matches that."));
      list.querySelector(".tp-item.on")?.scrollIntoView({ block: "nearest" });
    }

    function move(i, scroll = true) {
      if (!shown.length) return;
      sel = (i + shown.length) % shown.length;
      for (const [k, row] of [...list.querySelectorAll(".tp-item")].entries()) row.classList.toggle("on", k === sel);
      if (scroll) list.querySelector(".tp-item.on")?.scrollIntoView({ block: "nearest" });
      previewTheme(shown[sel].id);
    }

    function close(keep) {
      if (!overlay) return;
      window.removeEventListener("keydown", onKey, true);
      const pick = shown[sel];
      overlay.remove();
      overlay = null;
      if (keep && pick) {
        kept = true;
        const st = themeState();
        const chosen = setTheme(pick.id);
        if (st.sync && chosen.dark !== currentTheme().dark) {
          toast(`Saved for when your system is in ${chosen.dark ? "dark" : "light"} mode.`, 3500);
        } else {
          toast(`Theme: ${pick.name}`, 1800);
        }
      }
      if (!kept) endPreview();
      focusBack?.();
    }

    function onKey(e) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
      else if (e.key === "ArrowDown") move(sel + 1);
      else if (e.key === "ArrowUp") move(sel - 1);
      else if (e.key === "PageDown") move(Math.min(shown.length - 1, sel + 6));
      else if (e.key === "PageUp") move(Math.max(0, sel - 6));
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);

    input.addEventListener("input", () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      shown = allThemes().filter((t) => words.every((w) => `${t.name} ${t.dark ? "dark" : "light"} ${t.custom ? "yours custom" : ""}`.toLowerCase().includes(w)));
      sel = 0;
      draw();
      if (shown.length) previewTheme(shown[0].id);
    });
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close(false);
    });

    draw();
    input.focus();
    setTimeout(() => input.focus(), 0); // the terminal may try to take the keyboard back a moment later
  }

  return { open, isOpen: () => Boolean(overlay) };
}
