// The text editor (CodeMirror 6). Friendly by default: normal typing, Ctrl+S to save, Ctrl+F to
// search, Ctrl+Z to undo. Vim keys are optional (Display > Editor).
// Syntax colours load on demand, so the editor costs nothing until you open a file.

import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { StreamLanguage, HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { vim, Vim } from "@replit/codemirror-vim";
import { currentTheme, hexToRgb, toHex, mix } from "./themes.js";

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

// The editor's colours come from the chosen theme (see themes.js), so it matches everything else.
function themeExtension(theme) {
  const blend = (p) => toHex(mix(hexToRgb(theme.bg), hexToRgb(theme.ink), p));
  const muted = blend(0.5);
  const look = EditorView.theme(
    {
      "&": { height: "100%", backgroundColor: theme.bg, color: theme.ink, fontSize: "var(--term-font, 14px)" },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", "DejaVu Sans Mono", monospace', lineHeight: "1.55" },
      ".cm-content": { padding: "8px 0", caretColor: theme.ink },
      ".cm-gutters": { backgroundColor: theme.bg, color: blend(0.32), border: "none", borderRight: `1px solid ${blend(0.07)}` },
      ".cm-activeLine": { backgroundColor: blend(0.05) },
      ".cm-activeLineGutter": { backgroundColor: blend(0.05), color: blend(0.6) },
      ".cm-cursor": { borderLeftColor: theme.ink },
      ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { backgroundColor: blend(0.2) },
      ".cm-selectionMatch": { backgroundColor: blend(0.12) },
      ".cm-panels": { backgroundColor: blend(0.04), color: theme.ink },
      ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${blend(0.1)}` },
      ".cm-searchMatch": { backgroundColor: blend(0.15), outline: `1px solid ${blend(0.3)}` },
      ".cm-tooltip": { backgroundColor: blend(0.06), border: `1px solid ${blend(0.12)}`, color: theme.ink },
    },
    { dark: theme.dark },
  );
  const colours = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier, t.moduleKeyword], color: theme.purple },
    { tag: [t.string, t.special(t.string), t.regexp, t.character], color: theme.green },
    { tag: [t.number, t.bool, t.null, t.atom, t.self], color: theme.orange },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: muted, fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: theme.accent },
    { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: theme.amber },
    { tag: [t.propertyName, t.variableName, t.name], color: theme.ink },
    { tag: [t.attributeName, t.labelName], color: theme.amber },
    { tag: [t.operator, t.url, t.escape], color: theme.cyan },
    { tag: [t.punctuation, t.separator, t.bracket, t.meta], color: muted },
    { tag: [t.tagName, t.heading, t.deleted], color: theme.red },
    { tag: t.heading, fontWeight: "bold" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: [t.link, t.inserted], color: theme.accent },
    { tag: t.link, textDecoration: "underline" },
    { tag: t.invalid, color: theme.red },
  ]);
  return Prec.highest([look, syntaxHighlighting(colours)]);
}

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
 * options: { host, path, text, vim, tabSize, wordWrap, onDirty(bool), onSave(), onClose() }
 * returns { getText, markSaved, setVim, setTheme, insertText, goTo, focus, destroy }
 */
export function createEditor({ host, path, text, vim: vimOn, tabSize = 2, wordWrap = false, onDirty, onSave, onClose }) {
  setUpVimCommands();
  const crlf = text.includes("\r\n"); // keep Windows line endings the way they were
  const doc = crlf ? text.replace(/\r\n/g, "\n") : text;
  const langBox = new Compartment();
  const vimBox = new Compartment();
  const themeBox = new Compartment();
  const layoutBox = new Compartment();
  const layoutOptions = (size, wrap) => [EditorState.tabSize.of(size), indentUnit.of(" ".repeat(size)), wrap ? EditorView.lineWrapping : []];
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
        Prec.highest(keymap.of(["k", "l", "s", "d", "e", "t", "w", "f", "b"].map((k) => ({ key: `Mod-Shift-${k}`, run: () => true })))),
        langBox.of([]),
        themeBox.of(themeExtension(currentTheme())),
        layoutBox.of(layoutOptions(tabSize, wordWrap)),
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
    setLayout(size, wrap) {
      view.dispatch({ effects: layoutBox.reconfigure(layoutOptions(size, wrap)) });
    },
    setTheme(theme) {
      view.dispatch({ effects: themeBox.reconfigure(themeExtension(theme)) });
    },
    setVim(on) {
      view.dispatch({ effects: vimBox.reconfigure(on ? vim() : []) });
    },
    insertText(t) {
      view.dispatch(view.state.replaceSelection(t));
      view.focus();
    },
    /** Jump to a line (1 is the first) and select `len` letters from column `col`. */
    goTo(line, col = 0, len = 0) {
      const doc = view.state.doc;
      const ln = doc.line(Math.min(Math.max(line, 1), doc.lines));
      const from = Math.min(ln.from + col, ln.to);
      const to = Math.min(from + len, ln.to);
      view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
