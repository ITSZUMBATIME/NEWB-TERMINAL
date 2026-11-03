// The first-run tour: a few short steps that point at the real buttons.
//
// It starts by itself only on a brand new install (never for someone who already uses NEWB), and can
// be started again any time from "Take the tour" at the top of the Commands panel.
// Keys: Right arrow or Enter = next, Left arrow = back, Esc = skip.

import { el } from "./ui.js";

const SEEN_KEY = "newb.tour.v1";

// Each step points at something on the screen (a CSS selector) or, with no target, sits in the middle.
const STEPS = [
  {
    title: "Welcome to NEWB",
    text: "A terminal made for people who are new to the terminal. This takes under a minute, and you can skip it any time with Esc.",
  },
  {
    target: "#open-files",
    title: "Your files",
    text: "Open the Files panel to look around. Drag a file or folder into the terminal and NEWB types its name for you. The little cd button jumps into a folder.",
  },
  {
    target: "#open-cheats",
    title: "The cheat sheet",
    text: "Plain-English commands. Search for what you want to do, like “delete a file” or “wifi”, then drag a command into the terminal. NEWB types it and waits: you press Enter when you're happy with it.",
  },
  {
    target: "#panes",
    spot: false,
    title: "Blue blanks",
    text: "Some commands have blue blanks for you to fill in. Just type to replace one, and press Tab to jump to the next. Enter won't run it until every blank is filled.",
  },
  {
    target: "#panes",
    spot: false,
    title: "Copy and paste",
    text: "Ctrl+C copies when text is selected, and stops a running command when nothing is. Ctrl+V pastes. Right-click for a menu with both.",
  },
  {
    target: "#open-settings",
    title: "Make it yours",
    text: "Themes, your own logo, sizes and more are in Settings (Ctrl+,). Ctrl+Shift+P switches theme in a flash.",
  },
  {
    title: "That's it",
    text: "Take the tour again any time from the top of the Commands panel (the Cheat sheet button). Have fun.",
  },
];

/**
 * options: { prepare() }   called before a tour starts (to close panels that would be in the way)
 * returns { start(), maybeStart() }
 */
export function initTour({ prepare } = {}) {
  let overlay = null;
  let index = 0;
  let onKey = null;
  let onResize = null;

  const seen = () => {
    try { return Boolean(localStorage.getItem(SEEN_KEY)); } catch (_) { return true; }
  };
  const markSeen = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (_) { /* fine */ }
  };

  function end() {
    if (!overlay) return;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    overlay.remove();
    overlay = null;
    markSeen();
  }

  function place(card, spot, target, withSpot) {
    const pad = 6;
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (!target) {
      spot.style.display = "none";
      card.style.left = `${Math.round((vw - cw) / 2)}px`;
      card.style.top = `${Math.round((vh - ch) / 2 - 20)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    if (withSpot) {
      spot.style.display = "block";
      spot.style.left = `${r.left - pad}px`;
      spot.style.top = `${r.top - pad}px`;
      spot.style.width = `${r.width + pad * 2}px`;
      spot.style.height = `${r.height + pad * 2}px`;
    } else {
      spot.style.display = "none";
    }
    let left = withSpot ? r.left + r.width / 2 - cw / 2 : r.left + r.width / 2 - cw / 2;
    let top = withSpot ? r.bottom + pad + margin : r.top + r.height * 0.55;
    if (withSpot && top + ch > vh - margin) top = r.top - pad - margin - ch; // no room below: go above
    left = Math.min(vw - cw - margin, Math.max(margin, left));
    top = Math.min(vh - ch - margin, Math.max(margin, top));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function show() {
    const step = STEPS[index];
    overlay.replaceChildren();
    const spot = el("div", "tour-spot");
    const card = el("div", "tour-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", step.title);
    const head = el("div", "tour-head");
    head.append(el("div", "tour-title", step.title), el("div", "tour-count", `${index + 1} of ${STEPS.length}`));
    const body = el("div", "tour-text", step.text);
    const dots = el("div", "tour-dots");
    STEPS.forEach((_, i) => dots.append(el("span", i === index ? "on" : "")));

    const buttons = el("div", "tour-buttons");
    const skip = el("button", "link-btn", index === STEPS.length - 1 ? "" : "Skip tour");
    skip.type = "button";
    skip.addEventListener("click", end);
    const back = el("button", "modal-btn", "Back");
    back.type = "button";
    back.disabled = index === 0;
    back.addEventListener("click", () => go(-1));
    const next = el("button", "modal-btn primary", index === STEPS.length - 1 ? "Done" : "Next");
    next.type = "button";
    next.addEventListener("click", () => go(1));
    buttons.append(skip, el("div", "tour-gap"), back, next);

    card.append(head, body, dots, buttons);
    overlay.append(spot, card);
    const target = step.target ? document.querySelector(step.target) : null;
    place(card, spot, target, step.spot !== false);
    overlay.classList.toggle("dim", !target || step.spot === false);
    next.focus();
  }

  function go(dir) {
    const n = index + dir;
    if (n < 0) return;
    if (n >= STEPS.length) return end();
    index = n;
    show();
  }

  function start() {
    if (overlay) return;
    prepare?.();
    index = 0;
    overlay = el("div", "tour");
    document.body.append(overlay);
    onKey = (e) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (e.target?.tagName === "BUTTON" && e.key === "Enter") return; // a focused button handles itself
        go(1);
      } else if (e.key === "ArrowLeft") go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    onResize = () => show();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    show();
  }

  /** Start by itself, but only for someone who has never used NEWB on this computer. */
  function maybeStart() {
    if (seen()) return;
    let returning = false;
    try {
      returning = ["newb.display.v1", "newb.theme.v1", "newb.prefs.v1", "newb.custom.v1", "newb.layout.v4"].some((k) => localStorage.getItem(k));
    } catch (_) { /* treat as new */ }
    if (returning) {
      markSeen(); // an existing user is not interrupted; the tour is one click away
      return;
    }
    setTimeout(start, 1200);
  }

  return { start, maybeStart };
}
