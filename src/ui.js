// Small building blocks shared by the panels.
import { icon } from "./icons.js";

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
 * A small question box that sits on top of the window (the browser's own confirm() is not
 * reliable inside the app). `choices` is [{ id, label, primary?, danger?, cancel? }].
 * Resolves with the id of the button pressed. Esc or clicking outside picks the `cancel` one.
 */
export function askChoice({ title, message, choices }) {
  return new Promise((resolve) => {
    const back = el("div", "modal-back");
    const box = el("div", "modal");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", title);
    const row = el("div", "modal-buttons");
    const cancelId = choices.find((c) => c.cancel)?.id ?? null;

    const done = (id) => {
      window.removeEventListener("keydown", onKey, true);
      back.remove();
      resolve(id);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done(cancelId);
      }
    };
    window.addEventListener("keydown", onKey, true);
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) done(cancelId);
    });

    for (const c of choices) {
      const b = el("button", `modal-btn${c.primary ? " primary" : ""}${c.danger ? " danger" : ""}`, c.label);
      b.type = "button";
      b.addEventListener("click", () => done(c.id));
      row.append(b);
    }
    box.append(el("h3", "", title), el("p", "", message), row);
    back.append(box);
    document.body.append(back);
    (row.querySelector(".primary") || row.firstChild)?.focus();
  });
}

/** A small form for a name or a command. Returns the form element. */
export function miniForm({ fields, submitLabel, onSave, onCancel, hint }) {
  const form = el("form", "mini-form");
  const inputs = fields.map((f) => {
    const label = el("label", "mini-field");
    label.append(el("span", "", f.label));
    const input = el("input");
    input.type = "text";
    input.placeholder = f.placeholder || "";
    input.value = f.value || "";
    input.spellcheck = false;
    input.autocomplete = "off";
    label.append(input);
    form.append(label);
    return { f, input };
  });
  if (hint) form.append(el("div", "mini-hint", hint));
  const error = el("div", "mini-error");
  error.hidden = true;
  const row = el("div", "mini-buttons");
  const ok = el("button", "mini-save", submitLabel);
  ok.type = "submit";
  const cancel = el("button", "mini-cancel", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  row.append(ok, cancel);
  form.append(error, row);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = {};
    for (const { f, input } of inputs) values[f.key] = input.value.trim();
    const missing = inputs.find(({ f, input }) => f.required && !input.value.trim());
    if (missing) {
      error.textContent = `Please fill in: ${missing.f.label}`;
      error.hidden = false;
      missing.input.focus();
      return;
    }
    onSave(values);
  });
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  });
  // the drag engine and panel shortcuts shouldn't hijack typing in here
  form.addEventListener("pointerdown", (e) => e.stopPropagation());
  form.focusFirst = () => inputs[0].input.focus();
  return form;
}


/**
 * Ask for a line of text in the same kind of box. Resolves with the text, or null if cancelled.
 * options: { title, message, value, okLabel }
 */
export function askText({ title, message, value = "", okLabel = "OK" }) {
  return new Promise((resolve) => {
    const back = el("div", "modal-back");
    const box = el("form", "modal");
    box.setAttribute("aria-label", title);
    const input = el("input", "modal-input");
    input.type = "text";
    input.value = value;
    input.spellcheck = false;
    input.autocomplete = "off";
    const row = el("div", "modal-buttons");
    const ok = el("button", "modal-btn primary", okLabel);
    ok.type = "submit";
    const cancel = el("button", "modal-btn", "Cancel");
    cancel.type = "button";
    row.append(ok, cancel);

    const done = (result) => {
      window.removeEventListener("keydown", onKey, true);
      back.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) done(null);
    });
    cancel.addEventListener("click", () => done(null));
    box.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) done(text);
    });

    box.append(el("h3", "", title), el("p", "", message || ""), input, row);
    back.append(box);
    document.body.append(back);
    input.focus();
    // select the name but not the ending, so renaming "notes.txt" starts on "notes"
    const dot = value.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : value.length);
  });
}

/**
 * Show the little right-click menu at x, y. `items` is a list of
 * { icon, label, onClick, danger?, disabled? } and "-" for a dividing line.
 */
export function showMenu(x, y, items) {
  const menu = document.getElementById("ctx-menu");
  menu.replaceChildren(
    ...items.map((it) => {
      if (it === "-") return el("hr");
      const b = el("button", it.danger ? "danger" : "");
      b.type = "button";
      b.disabled = Boolean(it.disabled);
      if (it.icon) b.append(icon(it.icon));
      b.append(el("span", "", it.label));
      b.addEventListener("click", () => {
        menu.hidden = true;
        it.onClick();
      });
      return b;
    }),
  );
  menu.hidden = false;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 6))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 6))}px`;
}
