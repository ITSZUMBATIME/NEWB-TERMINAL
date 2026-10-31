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

const SVG = "http://www.w3.org/2000/svg";

/** A small folder or file icon. */
export function icon(kind) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", `ico ico-${kind}`);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  if (kind === "folder") {
    path.setAttribute("d", "M1.5 3.5A1 1 0 0 1 2.5 2.5h3.6l1.4 1.6h6a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z");
  } else {
    path.setAttribute("d", "M3.5 1.5h5.6l3.4 3.4v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-11.4a1 1 0 0 1 1-1zM9 1.7v3.6h3.5");
  }
  svg.append(path);
  return svg;
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
