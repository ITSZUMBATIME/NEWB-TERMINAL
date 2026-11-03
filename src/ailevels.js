// How much the AI is allowed to do. Each level here maps onto the tool's own permission setting,
// and NEWB passes it explicitly every time it starts the AI (it never relies on the tool's own default).
//
// Claude Code:  --permission-mode <mode>        (plan, default, acceptEdits, auto, dontAsk)
//               --dangerously-skip-permissions   (Sudoless)
//               --disallowedTools "Bash(sudo:*)" (keeps sudo out unless you allow it)
// Codex:        --sandbox <read-only | workspace-write | danger-full-access>
//               --ask-for-approval <untrusted | on-request | never>

export const TOOL_NAMES = { claude: "Claude Code", codex: "Codex" };

// advanced: shown under "Advanced" in the menu. tools: which tools have an equivalent.
export const LEVELS = [
  {
    id: "plan",
    label: "Plan",
    tools: ["claude", "codex"],
    hint: "It can look around and make a plan, but it can't change anything until you approve the plan.",
  },
  {
    id: "ask",
    label: "Ask first",
    tools: ["claude", "codex"],
    hint: "It asks before it edits a file, runs a command or uses the internet. Looking around is fine.",
  },
  {
    id: "edit",
    label: "Edit automatically",
    tools: ["claude", "codex"],
    hint: "It edits files in your folder without asking, and asks before running other commands.",
  },
  {
    id: "auto",
    label: "Auto",
    tools: ["claude"],
    hint: "It does what it needs, with a safety check in the background that blocks risky things. Needs a supported model and plan.",
  },
  {
    id: "dontask",
    label: "Don't ask",
    advanced: true,
    tools: ["claude"],
    hint: "Only runs what you have pre-approved. Anything else is refused quietly, with no questions. Meant for scripts.",
  },
  {
    id: "sudoless",
    label: "Sudoless",
    advanced: true,
    tools: ["claude", "codex"],
    danger: true,
    hint: "No questions and no safety checks: it can change or delete anything your user can. Best in a spare folder or a virtual machine. It never runs as root.",
  },
];

export const DEFAULT_LEVEL = "ask";

/** The levels this tool has an equivalent for. */
export const levelsFor = (tool) => LEVELS.filter((l) => l.tools.includes(tool));

/** The level to really use: the one asked for if this tool has it, otherwise Ask first. */
export function usableLevel(tool, level) {
  return levelsFor(tool).some((l) => l.id === level) ? level : DEFAULT_LEVEL;
}

/** The flags to start the tool with. `sudo` is true only if you turned on "Allow the AI to use sudo". */
export function launchArgs(tool, level, sudo = false) {
  const lvl = usableLevel(tool, level);
  if (tool === "codex") {
    const table = {
      plan: ["--sandbox", "read-only", "--ask-for-approval", "never"],
      ask: ["--sandbox", "workspace-write", "--ask-for-approval", "untrusted"],
      edit: ["--sandbox", "workspace-write", "--ask-for-approval", "on-request"],
      sudoless: ["--ask-for-approval", "never", "--sandbox", "danger-full-access"],
    };
    return table[lvl];
  }
  const args = [];
  switch (lvl) {
    case "plan": args.push("--permission-mode", "plan"); break;
    case "edit": args.push("--permission-mode", "acceptEdits"); break;
    case "auto": args.push("--permission-mode", "auto"); break;
    case "dontask": args.push("--permission-mode", "dontAsk"); break;
    case "sudoless": args.push("--dangerously-skip-permissions"); break;
    default: args.push("--permission-mode", "default");
  }
  if (!sudo) args.push("--disallowedTools", "Bash(sudo:*)");
  return args;
}

/** What you would type to start it the same way (shown in Settings so nothing is hidden). */
export function commandPreview(tool, level, sudo = false) {
  const quote = (a) => (/[^A-Za-z0-9_\-./=]/.test(a) ? `"${a}"` : a);
  return [tool, ...launchArgs(tool, level, sudo).map(quote)].join(" ");
}

/** Wrap what you typed so the answer comes back short, plain and safe to act on. */
export function questionPrompt(question, folder) {
  return [
    "You are helping someone who is new to the Linux terminal (Fedora).",
    "Answer in plain English, briefly (under 150 words). Don't assume they know jargon.",
    "If a command would help, give exactly one, in a fenced code block, and say in a sentence what it does.",
    "Say clearly if a command could delete or change things. Don't suggest sudo unless it is really needed, and say so if you do.",
    folder ? `Their terminal is currently in the folder: ${folder}` : null,
    "",
    `Their question: ${question}`,
  ].filter((l) => l !== null).join("\n");
}

export function explainPrompt(command, folder) {
  return [
    "You are helping someone who is new to the Linux terminal (Fedora).",
    "Explain this command part by part, in plain English, briefly. Then say whether it can delete or change anything.",
    "Do not run it. Do not suggest a different command unless this one is dangerous.",
    folder ? `Their terminal is currently in the folder: ${folder}` : null,
    "",
    `Command: ${command}`,
  ].filter((l) => l !== null).join("\n");
}

/**
 * Split an answer into plain text and fenced code blocks.
 * Returns [{ type: "text" | "code", text }]
 */
export function splitAnswer(answer) {
  const parts = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(answer))) {
    if (m.index > last) parts.push({ type: "text", text: answer.slice(last, m.index).trim() });
    parts.push({ type: "code", text: m[1].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < answer.length) parts.push({ type: "text", text: answer.slice(last).trim() });
  return parts.filter((p) => p.text);
}
