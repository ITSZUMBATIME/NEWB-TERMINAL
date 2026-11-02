// Drag and drop for commands and file paths.
//
// This uses plain mouse/pointer events instead of the browser's built-in drag and drop,
// so it behaves the same everywhere and we control how smooth it is:
//   - the floating chip is moved once per screen refresh (not on every tiny mouse move)
//   - where you are is worked out from a few saved rectangles, not by asking the page
//   - the terminal and header ignore the mouse during a drag, so they don't do needless work
//   - the logo animation is paused (see onStart / onEnd), and a drawer you drag out of closes instantly

import { cmdElement, el } from "./ui.js";
import { fileIcon } from "./icons.js";

const START_DISTANCE = 4; // pixels you must move before a press counts as a drag

/**
 * options:
 *   panesEl                      the terminal area (a valid drop target)
 *   onDrop(payload, target)      target is { kind: "terminal" | "fav" | "cat", el }
 *   onStart(payload), onEnd()    hooks, e.g. to pause animations
 *   onLeaveSource(drawerEl)      the pointer moved out of the drawer the drag began in
 *
 * payload is { kind: "cmd", cmd, risky } or { kind: "path", path, name, isDir }
 */
export function createDragger({ panesEl, onDrop, onStart, onEnd, onLeaveSource }) {
  let drag = null;
  let justDragged = false;
  let frame = 0;
  let lastEl = null;
  let rects = null;

  const SOURCE = "[data-cmd], [data-path]";

  function payloadOf(src) {
    if (src.dataset.cmd !== undefined) {
      return { kind: "cmd", cmd: src.dataset.cmd, risky: src.dataset.risky === "1" };
    }
    return {
      kind: "path",
      path: src.dataset.path,
      name: src.dataset.name || src.dataset.path,
      isDir: src.dataset.dir === "1",
    };
  }

  // Remember where things are once, at the start of the drag.
  function measure() {
    const visible = (node) => (node && node.offsetParent !== null ? node.getBoundingClientRect() : null);
    rects = {
      bar: document.getElementById("tabbar").getBoundingClientRect(),
      panes: panesEl.getBoundingClientRect(),
      explorer: visible(document.getElementById("explorer")),
      drawer: document.querySelector(".drawer.open")?.getBoundingClientRect() ?? null,
    };
  }

  const inside = (r, x, y) => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  function targetAt(x, y, payload) {
    if (inside(rects.bar, x, y)) return null;
    if (inside(rects.drawer, x, y)) {
      // Only here do we ask the page what is under the pointer: the drawer is small.
      if (payload.kind !== "cmd") return null;
      const hit = document.elementFromPoint(x, y);
      const fav = hit?.closest(".fav-drop");
      if (fav) return { kind: "fav", el: fav };
      const cat = hit?.closest(".cat-drop");
      if (cat) return { kind: "cat", el: cat };
      return null;
    }
    if (inside(rects.explorer, x, y)) return null;
    if (inside(rects.panes, x, y)) return { kind: "terminal", el: panesEl };
    return null;
  }

  function setHighlight(target) {
    const next = target?.el ?? null;
    if (next === lastEl) return;
    lastEl?.classList.remove("drop-ready");
    next?.classList.add("drop-ready");
    lastEl = next;
  }

  function cleanup() {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey, true);
    if (drag?.ghost) drag.ghost.remove();
    const wasActive = drag?.active;
    document.body.classList.remove("dragging");
    setHighlight(null);
    drag = null;
    rects = null;
    if (wasActive) onEnd?.();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  }

  function makeGhost(payload) {
    const ghost = el("div", "drag-ghost");
    if (payload.kind === "cmd") {
      ghost.append(cmdElement(payload.cmd));
    } else {
      ghost.classList.add("path");
      ghost.append(fileIcon(payload.name, payload.isDir), el("span", "ghost-name", payload.name));
    }
    document.body.append(ghost);
    return ghost;
  }

  // Runs once per screen refresh while dragging.
  function tick() {
    frame = 0;
    if (!drag?.active) return;
    drag.ghost.style.transform = `translate3d(${drag.x + 14}px, ${drag.y + 10}px, 0)`;
    setHighlight(targetAt(drag.x, drag.y, drag.payload));
  }

  function onMove(e) {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;

    if (!drag.active) {
      if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < START_DISTANCE) return;
      drag.active = true;
      measure();
      drag.ghost = makeGhost(drag.payload);
      document.body.classList.add("dragging");
      onStart?.(drag.payload);
    }

    // Left the drawer you picked this up from: tuck it away straight away.
    if (drag.from && !drag.left && rects.drawer && !inside(rects.drawer, drag.x, drag.y)) {
      drag.left = true;
      rects.drawer = null; // it is closing, so it no longer counts as a place to drop
      onLeaveSource?.(drag.from);
    }

    if (!frame) frame = requestAnimationFrame(tick);
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag;
    if (d.active) {
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      const target = targetAt(e.clientX, e.clientY, d.payload);
      cleanup();
      if (target) onDrop(d.payload, target);
    } else {
      cleanup();
    }
  }

  function onDown(e) {
    if (e.button !== 0 || e.target.closest("button, input, textarea")) return;
    const src = e.target.closest(SOURCE);
    if (!src) return;
    drag = {
      payload: payloadOf(src),
      from: src.closest(".drawer"),
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      left: false,
      ghost: null,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
  }

  return {
    /** Make everything inside `root` that has data-cmd or data-path draggable. */
    attach(root) {
      root.addEventListener("pointerdown", onDown);
    },
    /** True for a moment after a drop, so the click that follows a drag can be ignored. */
    get justDragged() {
      return justDragged;
    },
  };
}
