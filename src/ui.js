// Small building blocks shared by the panels.

const BLANK_SPLIT = /(\{\{[^}]+\}\})/;

/** Make an element: el("div", "class names", "text"). */
export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A command as web text, with its blanks drawn as little pills. */
export function cmdElement(cmd) {
  const code = document.createElement("code");
  code.className = "cmd";
  for (const part of cmd.split(BLANK_SPLIT)) {
    if (!part) continue;
    const m = /^\{\{([^}]+)\}\}$/.exec(part);
    if (m) {
      const pill = document.createElement("span");
      pill.className = "blank";
      pill.textContent = m[1].trim();
      code.append(pill);
    } else {
      code.append(document.createTextNode(part));
    }
  }
  return code;
}

/** Quote text so the shell reads it as one word (only when it needs quoting). */
export function shellQuote(s) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * The friendliest way to write a path in a command:
 *   inside the folder you're in  -> the short name, like  main.py  or  assets/logo.png
 *   elsewhere in your home folder -> ~/Documents/report.docx
 *   anywhere else                 -> the full path
 */
export function shellPath(path, home, cwd) {
  if (cwd && path === cwd) return ".";
  if (cwd && cwd !== "/" && path.startsWith(cwd + "/")) {
    const rel = path.slice(cwd.length + 1);
    return shellQuote(rel.startsWith("-") ? `./${rel}` : rel); // a name starting with - would look like an option
  }
  if (home && path === home) return "~";
  if (home && path.startsWith(home + "/")) return "~/" + shellQuote(path.slice(home.length + 1));
  return shellQuote(path);
}

/**
 * A row of buttons where one is chosen (like Classic / Flat / Terminal).
 * `items` is [{ id, label }]. Returns { set(id) } to change which is highlighted.
 */
export function segmented(container, items, onPick) {
  container.replaceChildren();
  const buttons = new Map();
  for (const item of items) {
    const b = el("button", "", item.label);
    b.type = "button";
    b.dataset.id = item.id;
    b.addEventListener("click", () => onPick(item.id));
    container.append(b);
    buttons.set(item.id, b);
  }
  return {
    set(id) {
      for (const [k, b] of buttons) b.classList.toggle("on", k === id);
    },
  };
}

// Only one popover is open at a time.
const popovers = [];

/** Open and close a popover from its button; clicking elsewhere or pressing Esc closes it. */
export function makePopover(pop, button, { onOpen } = {}) {
  const api = {
    isOpen: () => !pop.hidden,
    open() {
      for (const p of popovers) if (p !== api) p.close();
      pop.hidden = false;
      button.classList.add("active");
      onOpen?.();
    },
    close() {
      pop.hidden = true;
      button.classList.remove("active");
    },
    toggle() {
      if (api.isOpen()) api.close();
      else api.open();
    },
  };
  button.addEventListener("click", () => api.toggle());
  window.addEventListener("pointerdown", (e) => {
    if (api.isOpen() && !pop.contains(e.target) && !button.contains(e.target)) api.close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && api.isOpen()) api.close();
  });
  popovers.push(api);
  return api;
}
