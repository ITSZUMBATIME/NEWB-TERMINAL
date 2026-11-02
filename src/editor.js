// The text editor (CodeMirror 6). Friendly by default: normal typing, Ctrl+S to save, Ctrl+F to
// search, Ctrl+Z to undo. Vim keys are optional (Display > Editor).
// Syntax colours load on demand, so the editor costs nothing until you open a file.

import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim, Vim } from "@replit/codemirror-vim";
import { THEME } from "./theme.js";

const legacy = (loader, name) => () => loader().then((m) => StreamLanguage.define(m[name]));

// File ending -> how to load its colours.
const LANGUAGES = {
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  mjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  cjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true, jsx: true })),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  htm: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  rs: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  sh: legacy(() => import("@codemirror/legacy-modes/mode/shell"), "shell"),
  bash: legacy(() => import("@codemirror/legacy-modes/mode/shell"), "shell"),
  zsh: legacy(() => import("@codemirror/legacy-modes/mode/shell"), "shell"),
  toml: legacy(() => import("@codemirror/legacy-modes/mode/toml"), "toml"),
  yaml: legacy(() => import("@codemirror/legacy-modes/mode/yaml"), "yaml"),
  yml: legacy(() => import("@codemirror/legacy-modes/mode/yaml"), "yaml"),
};
const BY_NAME = { ".bashrc": "sh", ".zshrc": "sh", ".profile": "sh", ".bash_profile": "sh" };

function languageFor(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const ext = BY_NAME[name] || (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");
  return LANGUAGES[ext] || null;
}

// Fit the editor in with the rest of NEWB.
const look = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: THEME.background, color: THEME.foreground, fontSize: "var(--term-font, 14px)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace', lineHeight: "1.55" },
    ".cm-content": { padding: "8px 0" },
    ".cm-gutters": { backgroundColor: THEME.background, color: "#5b616b", border: "none", borderRight: "1px solid #1d2128" },
    ".cm-activeLine": { backgroundColor: "#181b21" },
    ".cm-activeLineGutter": { backgroundColor: "#181b21", color: "#9aa1ad" },
    ".cm-cursor": { borderLeftColor: THEME.cursor },
    ".cm-panels": { backgroundColor: "#12151a", color: THEME.foreground },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #232830" },
  },
  { dark: true },
);

// Vim's :w and :q are shared across editors, so we look up which editor is asking.
const handlers = new WeakMap();
let exCommandsReady = false;
function setUpVimCommands() {
  if (exCommandsReady) return;
  exCommandsReady = true;
  const pick = (cm) => handlers.get(cm?.cm6 || cm?.view);
  Vim.defineEx("write", "w", (cm) => pick(cm)?.onSave());
  Vim.defineEx("quit", "q", (cm) => pick(cm)?.onClose());
  const both = async (cm) => {
    const h = pick(cm);
    if (h && (await h.onSave())) h.onClose();
  };
  Vim.defineEx("wq", "wq", both);
  Vim.defineEx("xit", "x", both);
}

/**
 * options: { host, path, text, vim, onDirty(bool), onSave(), onClose() }
 * returns { getText, markSaved, setVim, insertText, focus, destroy }
 */
export function createEditor({ host, path, text, vim: vimOn, onDirty, onSave, onClose }) {
  setUpVimCommands();
  const crlf = text.includes("\r\n"); // keep Windows line endings the way they were
  const doc = crlf ? text.replace(/\r\n/g, "\n") : text;
  const langBox = new Compartment();
  const vimBox = new Compartment();
  let saved = null; // the document as last saved, to tell if there is anything unsaved

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        vimBox.of(vimOn ? vim() : []),
        basicSetup,
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => (onSave(), true) },
          indentWithTab,
        ]),
        // The editor also uses some of NEWB's own Ctrl+Shift keys (Ctrl+Shift+K deletes a line).
        // Swallow them here so only NEWB's meaning happens.
        Prec.highest(keymap.of(["k", "l", "s", "d", "e", "t", "w"].map((k) => ({ key: `Mod-Shift-${k}`, run: () => true })))),
        langBox.of([]),
        oneDark,
        Prec.highest(look), // after oneDark, so NEWB's own colours win
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onDirty(!u.state.doc.eq(saved));
        }),
      ],
    }),
  });
  saved = view.state.doc;
  handlers.set(view, { onSave, onClose });

  const loadLanguage = languageFor(path);
  if (loadLanguage) {
    loadLanguage()
      .then((ext) => view.dispatch({ effects: langBox.reconfigure(ext) }))
      .catch(() => { /* plain text is fine */ });
  }

  return {
    getText: () => {
      const t = view.state.doc.toString();
      return crlf ? t.replace(/\n/g, "\r\n") : t;
    },
    markSaved() {
      saved = view.state.doc;
      onDirty(false);
    },
    setVim(on) {
      view.dispatch({ effects: vimBox.reconfigure(on ? vim() : []) });
    },
    insertText(t) {
      view.dispatch(view.state.replaceSelection(t));
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
