// Drag and drop for commands and file paths.
//
// This uses plain mouse/pointer events instead of the browser's built-in drag and drop,
// so it behaves the same everywhere and we control how smooth it is:
//   - the floating "ghost" is moved once per screen refresh (not on every tiny mouse move)
//   - heavy animations are paused while you drag (see onStart / onEnd)
//   - a drawer you drag out of closes instantly, with no slide animation

import { cmdElement, icon, el } from "./ui.js";

const START_DISTANCE = 4; // pixels you must move before a press counts as a drag

/**
 * options:
 *   panesEl                      the terminal area (a valid drop target)
 *   onDrop(payload, target)      target is "terminal" or "fav"
 *   onStart(payload), onEnd()    hooks, e.g. to pause animations
 *   onLeaveSource(drawerEl)      the pointer moved out of the drawer the drag began in
 *
 * payload is { kind: "cmd", cmd, risky } or { kind: "path", path, name, isDir }
 */
export function createDragger({ panesEl, onDrop, onStart, onEnd, onLeaveSource }) {
  let drag = null;
  let justDragged = false;
  let frame = 0;
  let lastTarget = null;

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

  function targetAt(x, y, payload) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    if (payload.kind === "cmd" && hit.closest(".fav-drop")) return "fav";
    if (hit.closest(".drawer") || hit.closest("#tabbar") || hit.closest("#explorer")) return null;
    if (hit.closest("#panes")) return "terminal";
    return null;
  }

  function setHighlight(target) {
    if (target === lastTarget) return;
    lastTarget = target;
    panesEl.classList.toggle("drop-ready", target === "terminal");
    for (const f of document.querySelectorAll(".fav-drop")) f.classList.toggle("drop-ready", target === "fav");
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
    lastTarget = null;
    drag = null;
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
      ghost.append(icon(payload.isDir ? "folder" : "file"), el("span", "ghost-name", payload.name));
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
      drag.ghost = makeGhost(drag.payload);
      document.body.classList.add("dragging");
      onStart?.(drag.payload);
    }

    // Left the drawer you picked this up from: tuck it away straight away.
    if (drag.from && !drag.left) {
      const r = drag.from.getBoundingClientRect();
      if (drag.x < r.left || drag.x > r.right || drag.y < r.top || drag.y > r.bottom) {
        drag.left = true;
        onLeaveSource?.(drag.from);
      }
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
    if (e.button !== 0 || e.target.closest("button, input")) return;
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
