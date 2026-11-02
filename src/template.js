// Commands with blanks.
//
// When you drop "cp {{file}} {{to}}", NEWB types "cp FILE TO" and highlights FILE and TO.
// You just start typing: your words replace the highlighted blank. Tab jumps to the next
// blank, Shift+Tab goes back. Enter won't run the command until every blank is filled.
// Pressing arrows, Ctrl+C or Esc simply ends this and leaves you with a normal command line.
//
// The shell (bash, zsh...) only ever sees ordinary typing: we move its cursor with arrow
// keys and delete the placeholder word with the Delete key. Nothing special is installed.
import { UI } from "./theme.js";
import { prefs } from "./prefs.js";

const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";
const DELETE = "\x1b[3~";
const BACKSPACE = "\x7f";
const BLANK_RE = /\{\{([^}]+)\}\}/g;


/** "cp {{file}} {{to}}" -> { text: "cp FILE TO", blanks: [{ off, len, name }, ...] } */
export function parseSpec(cmd) {
  let text = "";
  let last = 0;
  const blanks = [];
  for (const m of cmd.matchAll(BLANK_RE)) {
    text += cmd.slice(last, m.index);
    const name = m[1].trim().toUpperCase();
    blanks.push({ off: text.length, len: name.length, name, touched: false });
    text += name;
    last = m.index + m[0].length;
  }
  text += cmd.slice(last);
  return { text, blanks };
}

const isPrintable = (data) => data.length > 0 && !/[\x00-\x1f\x7f]/.test(data);

/** Ends the fill-in session (and removes the highlights). */
export function cancelTemplate(tab) {
  const t = tab.template;
  if (!t) return;
  clearTimeout(t.timer);
  for (const d of t.decos) {
    d.deco.dispose();
    d.marker.dispose();
  }
  t.decos = [];
  tab.template = null;
  tab.term.options.cursorStyle = prefs.get("cursorStyle"); // back to the cursor you chose
}

/**
 * Type a command into the tab. If it has blanks, start the fill-in session
 * with the first blank ready to be typed over.
 * io = { send(text), toast(message) }
 */
export function startTemplate(tab, spec, io) {
  cancelTemplate(tab);
  if (!spec.blanks.length) {
    io.send(spec.text);
    return;
  }
  const t = { blanks: spec.blanks, len: spec.text.length, cursor: spec.text.length, armed: -1, decos: [], timer: 0 };
  tab.template = t;
  // A thin bar cursor, so the block cursor doesn't hide the first letter of the highlighted blank.
  tab.term.options.cursorStyle = "bar";
  io.send(spec.text);
  moveTo(tab, t, 0, io);
}

// Put the cursor on blank j and get ready to type over it.
function moveTo(tab, t, j, io) {
  const b = t.blanks[j];
  const target = b.touched ? b.off + b.len : b.off; // an untouched blank is replaced; a typed one is edited
  const delta = target - t.cursor;
  if (delta) io.send(delta < 0 ? LEFT.repeat(-delta) : RIGHT.repeat(delta));
  t.cursor = target;
  t.armed = j;
  scheduleRefresh(tab, t);
}

// A blank grew or shrank by `delta` characters: everything after it moves along.
function resize(t, j, delta) {
  t.blanks[j].len += delta;
  t.len += delta;
  for (let k = j + 1; k < t.blanks.length; k++) t.blanks[k].off += delta;
}

const unfilled = (t) => t.blanks.some((b) => !b.touched || b.len === 0);

function finish(tab, t, io) {
  const delta = t.len - t.cursor;
  if (delta > 0) io.send(RIGHT.repeat(delta));
  cancelTemplate(tab);
}

/**
 * Called for every key press in the tab. Returns true if NEWB handled it
 * (so it must not also be sent to the shell).
 */
export function handleTemplateKey(tab, data, io) {
  const t = tab.template;
  if (!t) return false;
  const b = t.blanks[t.armed];

  if (data === "\t" || data === "\x1b[Z") {
    const dir = data === "\t" ? 1 : -1;
    const n = t.blanks.length;
    if (dir > 0 && t.armed === n - 1 && !unfilled(t)) finish(tab, t, io);
    else moveTo(tab, t, (t.armed + dir + n) % n, io);
    return true;
  }

  if (data === "\r") {
    if (unfilled(t)) {
      const first = t.blanks.findIndex((x) => !x.touched || x.len === 0);
      moveTo(tab, t, first, io);
      io.toast("Fill in the highlighted blanks first. Tab jumps to the next one.");
      return true;
    }
    cancelTemplate(tab);
    return false; // let Enter through to run the command
  }

  if (isPrintable(data)) {
    if (!b.touched) {
      // First typing replaces the whole placeholder word.
      const old = b.len;
      io.send(DELETE.repeat(old) + data);
      b.touched = true;
      resize(t, t.armed, data.length - old);
      t.cursor = b.off + b.len;
    } else {
      io.send(data);
      resize(t, t.armed, data.length);
      t.cursor += data.length;
    }
    scheduleRefresh(tab, t);
    return true;
  }

  if (data === BACKSPACE) {
    if (!b.touched) {
      io.send(DELETE.repeat(b.len));
      const old = b.len;
      b.touched = true;
      resize(t, t.armed, -old);
    } else if (b.len > 0) {
      io.send(BACKSPACE);
      resize(t, t.armed, -1);
      t.cursor -= 1;
    }
    scheduleRefresh(tab, t);
    return true;
  }

  // Anything else (arrows, Ctrl+C, Esc, ...): stop helping and let it through.
  cancelTemplate(tab);
  return false;
}

/* ---------- Highlights ---------- */

function scheduleRefresh(tab, t) {
  clearTimeout(t.timer);
  // Wait a moment so the shell has echoed what we sent before we look at the cursor.
  t.timer = setTimeout(() => refresh(tab), 40);
}

/** Redraw the highlights from where the terminal's cursor actually is. */
export function refresh(tab) {
  const t = tab.template;
  if (!t) return;
  for (const d of t.decos) {
    d.deco.dispose();
    d.marker.dispose();
  }
  t.decos = [];

  const term = tab.term;
  const buf = term.buffer.active;
  const cols = term.cols;
  const cursorLine = buf.baseY + buf.cursorY;
  const cursorIdx = cursorLine * cols + buf.cursorX;
  const startIdx = cursorIdx - t.cursor; // where the command begins, counting along wrapped lines

  t.blanks.forEach((b, j) => {
    const armed = j === t.armed;
    if (b.len <= 0 || (b.touched && !armed)) return; // filled blanks need no highlight
    const idx = startIdx + b.off;
    if (idx < 0) return;
    const line = Math.floor(idx / cols);
    const x = idx % cols;
    const marker = term.registerMarker(line - cursorLine);
    if (!marker) return;
    const c = armed ? UI.armed : UI.pending;
    const deco = term.registerDecoration({
      marker,
      x,
      width: Math.min(b.len, cols - x),
      height: 1,
      backgroundColor: c.bg,
      foregroundColor: c.fg,
    });
    if (!deco) {
      marker.dispose();
      return;
    }
    t.decos.push({ deco, marker });
  });
}

/**
 * Put text (like a file path) into the blank you're on, then move to the next blank.
 * Returns false if there is no fill-in session, so the caller can just type the text instead.
 */
export function fillBlank(tab, text, io) {
  if (!tab.template) return false;
  handleTemplateKey(tab, text, io); // same as typing it
  handleTemplateKey(tab, "\t", io); // then on to the next blank (or finish after the last one)
  return true;
}
