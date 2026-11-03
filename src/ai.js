// The AI helpers. Everything here is opt-in: with "AI helpers" off (the default) none of it shows.
//
// NEWB has no AI of its own and keeps no keys. It starts the tools you already have installed
// (Claude Code's `claude`, OpenAI's `codex`), and each one signs in by itself.
//
//   Ask bar        Ctrl+Space. One question, one short answer. Read-only. Commands in the answer
//                  have a "Type it" button: it types the command at the prompt and never presses Enter.
//   Explain        a button on every cheat-sheet command: what each part does, in plain English.
//   AI chat        Ctrl+Shift+A. The tool itself in a tab beside your terminal, started in your
//                  folder with the permission level you chose in Settings.

import { invoke } from "@tauri-apps/api/core";
import { prefs } from "./prefs.js";
import { el } from "./ui.js";
import { TOOL_NAMES, LEVELS, DEFAULT_LEVEL, usableLevel, launchArgs, questionPrompt, explainPrompt, splitAnswer } from "./ailevels.js";

/**
 * options: {
 *   toast(message, ms),
 *   openChat({ tool, name, args, cwd, label }),   start the chat tab
 *   typeText(text),                               type at the prompt (never Enter)
 *   getFolder(),                                  the folder the terminal is in (a promise), or null
 * }
 */
export function initAi({ toast, openChat, typeText, getFolder }) {
  let tools = []; // the installed ones: { id, name, path, version }
  let loaded = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  /* ---------- What is installed, and what is chosen ---------- */

  async function detect() {
    try {
      tools = (await invoke("ai_detect")) || [];
    } catch (_) {
      tools = [];
    }
    loaded = true;
    notify();
    return tools;
  }

  const enabled = () => Boolean(prefs.get("aiOn"));
  const tool = () => tools.find((t) => t.id === prefs.get("aiTool")) || tools[0] || null;
  const level = () => {
    const t = tool();
    return t ? usableLevel(t.id, prefs.get("aiLevel")) : DEFAULT_LEVEL;
  };
  const levelInfo = () => LEVELS.find((l) => l.id === level()) || LEVELS[1];

  /* ---------- The AI chat tab ---------- */

  async function startChat() {
    if (!enabled()) return;
    if (!loaded) await detect();
    const t = tool();
    if (!t) {
      toast("NEWB couldn't find Claude Code or Codex. Install one, then press Look again in Settings > AI.", 5000);
      return;
    }
    const name = TOOL_NAMES[t.id] || t.name;
    openChat({
      tool: t.id,
      name,
      args: launchArgs(t.id, level(), Boolean(prefs.get("aiSudo"))),
      cwd: await getFolder(),
      label: `${name} · ${levelInfo().label}`,
    });
  }

  /* ---------- The Ask bar ---------- */

  let overlay = null;
  let requestId = 0;
  let running = 0; // the request number being waited for (0 = nothing)

  function close() {
    if (!overlay) return;
    if (running) invoke("ai_cancel", { request: running }).catch(() => {});
    running = 0;
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
    overlay = null;
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // A line of a command can be typed at the prompt. One line only, so Enter is never pressed for you.
  function commandRows(code) {
    const box = el("div", "ai-cmds");
    const lines = code
      .split("\n")
      .map((l) => l.replace(/^\s*\$\s+/, "").trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const line of lines) {
      const row = el("div", "ai-cmd");
      row.append(el("code", "", line));
      const type = el("button", "modal-btn primary", "Type it");
      type.type = "button";
      type.title = "Type this at the prompt. You press Enter yourself.";
      type.addEventListener("click", () => {
        close();
        typeText(line);
        toast("Typed. Read it through, then press Enter if you're happy.", 4000);
      });
      const copy = el("button", "modal-btn", "Copy");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(line);
          toast("Copied.", 1200);
        } catch (_) {
          toast("Couldn't copy. Select the text and press Ctrl+C.", 2500);
        }
      });
      row.append(type, copy);
      box.append(row);
    }
    return box;
  }

  // Plain text, with `things in backticks` shown as code. (Never HTML: the text is added as text.)
  function richText(text) {
    const p = el("p", "ai-text");
    text.split(/(`[^`\n]+`)/).forEach((piece) => {
      if (/^`[^`\n]+`$/.test(piece)) p.append(el("code", "ai-inline", piece.slice(1, -1)));
      else if (piece) p.append(document.createTextNode(piece));
    });
    return p;
  }

  function showAnswer(body, answer) {
    body.replaceChildren();
    for (const part of splitAnswer(answer)) {
      if (part.type === "text") body.append(richText(part.text));
      else body.append(commandRows(part.text));
    }
    body.append(el("p", "ai-note", "AI can be wrong. Read a command before you press Enter."));
  }

  /** Open the Ask bar. `prompt`/`title` start a question straight away (used by Explain). */
  async function openAsk({ question = "", prompt = null, title = "" } = {}) {
    if (!enabled()) return;
    if (!loaded) await detect();
    const t = tool();
    if (overlay) close();
    overlay = el("div", "ai-ask");
    const box = el("div", "ai-box");
    const head = el("div", "ai-head");
    const name = t ? TOOL_NAMES[t.id] || t.name : "AI";
    head.append(el("span", "ai-title", title || `Ask ${name}`), el("span", "ai-level", t ? `${levelInfo().label} · read-only here` : ""));
    const form = el("form", "ai-form");
    const input = el("input", "ai-input");
    input.type = "text";
    input.placeholder = "Ask anything about the terminal, e.g. how do I see what's using my disk?";
    input.value = question;
    input.spellcheck = false;
    input.autocomplete = "off";
    const go = el("button", "modal-btn primary", "Ask");
    go.type = "submit";
    form.append(input, go);
    const body = el("div", "ai-body");
    body.hidden = true;
    const foot = el("div", "ai-foot", "Enter asks · Esc closes");
    box.append(head, form, body, foot);
    overlay.append(box);
    document.body.append(overlay);
    window.addEventListener("keydown", onKey, true);
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close();
    });

    async function ask(text, asPrompt) {
      if (running) return;
      if (!t) {
        body.hidden = false;
        body.replaceChildren(el("p", "ai-text warn", "NEWB couldn't find Claude Code or Codex. Install one, then press Look again in Settings > AI."));
        return;
      }
      const request = ++requestId;
      running = request;
      body.hidden = false;
      body.replaceChildren();
      const waiting = el("div", "ai-wait");
      waiting.append(el("span", "ai-spin"), el("span", "", `Asking ${name}…`));
      const stop = el("button", "modal-btn", "Stop");
      stop.type = "button";
      stop.addEventListener("click", () => close());
      waiting.append(stop);
      body.append(waiting);
      go.disabled = true;
      const folder = await getFolder();
      try {
        const answer = await invoke("ai_ask", {
          request,
          tool: t.id,
          prompt: asPrompt || questionPrompt(text, folder),
          cwd: folder,
        });
        if (!overlay || running !== request) return;
        showAnswer(body, answer);
      } catch (err) {
        if (!overlay || running !== request) return;
        body.replaceChildren(el("p", "ai-text warn", String(err)));
      } finally {
        if (running === request) running = 0;
        go.disabled = false;
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) ask(text, null);
    });
    if (prompt) {
      input.value = question;
      ask(question, prompt);
    }
    input.focus();
    setTimeout(() => input.focus(), 0); // the terminal may try to take the keyboard back a moment later
  }

  return {
    enabled,
    tool,
    tools: () => tools,
    loaded: () => loaded,
    level,
    levelInfo,
    detect,
    startChat,
    openAsk: () => openAsk({}),
    /** Explain one cheat-sheet command (a {{blank}} shows as its NAME). */
    explain: async (command) => {
      const plain = command.replace(/\{\{([^}]+)\}\}/g, (_, n) => n.trim().toUpperCase());
      const folder = await getFolder();
      await openAsk({ question: plain, title: "Explain this command", prompt: explainPrompt(plain, folder) });
    },
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
}
