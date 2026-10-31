// The commands AKIN knows about, in plain English.
//
// Blanks: write {{name}} where the person has to fill something in.
//   "cp {{file}} {{to}}" drops in as "cp FILE TO" with FILE and TO highlighted.
// risky: true means "this can delete or change things", so AKIN warns when it is dropped.
// keys: extra words people might search for.

export const CATEGORIES = [
  {
    id: "look",
    name: "Look around",
    items: [
      { title: "See what's in this folder", cmd: "ls", why: "Lists the files and folders you're standing in.", keys: "list show files directory dir" },
      { title: "See everything, with details", cmd: "ls -la", why: "Like ls, but also shows hidden files, sizes and dates.", keys: "list hidden files size date" },
      { title: "Where am I?", cmd: "pwd", why: "Prints the full path of the folder you're in.", keys: "current folder directory location path" },
      { title: "Go into a folder", cmd: "cd {{folder}}", why: "Moves you into that folder. Press Tab after a few letters to finish the name for you.", keys: "change directory open enter" },
      { title: "Go up one folder", cmd: "cd ..", why: "Moves you out to the folder that contains this one.", keys: "back parent" },
      { title: "Go back home", cmd: "cd ~", why: "Jumps to your home folder from anywhere.", keys: "home" },
    ],
  },
  {
    id: "files",
    name: "Files and folders",
    items: [
      { title: "Make a new folder", cmd: "mkdir {{name}}", why: "Creates an empty folder with that name.", keys: "create directory new" },
      { title: "Make an empty file", cmd: "touch {{file}}", why: "Creates an empty file, or updates its date if it already exists.", keys: "create new" },
      { title: "Copy a file", cmd: "cp {{file}} {{to}}", why: "Makes a copy of the file at the new place or under the new name.", keys: "duplicate" },
      { title: "Copy a whole folder", cmd: "cp -r {{folder}} {{to}}", why: "Copies a folder and everything inside it.", keys: "duplicate directory recursive" },
      { title: "Move or rename a file", cmd: "mv {{from}} {{to}}", why: "Moves the file to a new place. Moving it within the same folder renames it.", keys: "rename" },
      { title: "Delete a file", cmd: "rm {{file}}", why: "Deletes the file for good. There is no rubbish bin.", keys: "remove erase", risky: true },
      { title: "Delete a folder and everything in it", cmd: "rm -r {{folder}}", why: "Deletes the folder and all its contents for good. Double-check the name first.", keys: "remove erase directory", risky: true },
    ],
  },
  {
    id: "read",
    name: "Read files",
    items: [
      { title: "Show a file", cmd: "cat {{file}}", why: "Prints the whole file on screen. Best for short files.", keys: "read view display print" },
      { title: "Read a long file page by page", cmd: "less {{file}}", why: "Opens the file so you can scroll. Press q to quit.", keys: "read view scroll page" },
      { title: "See the start of a file", cmd: "head {{file}}", why: "Shows the first 10 lines.", keys: "top beginning first lines" },
      { title: "See the end of a file", cmd: "tail {{file}}", why: "Shows the last 10 lines.", keys: "bottom last lines" },
      { title: "Watch a file as it grows", cmd: "tail -f {{file}}", why: "Keeps showing new lines as they're added, like a log. Press Ctrl+C to stop.", keys: "log follow live" },
    ],
  },
  {
    id: "find",
    name: "Find things",
    items: [
      { title: "Find a file by name", cmd: "find . -name \"{{name}}\"", why: "Searches this folder and everything inside it for a matching name.", keys: "search locate" },
      { title: "Search inside files for words", cmd: "grep -rn \"{{text}}\" .", why: "Looks through every file here for that text and shows where it is.", keys: "search text find contents" },
      { title: "Where is a program?", cmd: "which {{program}}", why: "Shows where a program lives on your computer.", keys: "locate path" },
      { title: "Read the manual for a command", cmd: "man {{command}}", why: "Opens the full manual for a command. Press q to quit.", keys: "help docs documentation" },
    ],
  },
  {
    id: "edit",
    name: "Edit files",
    items: [
      { title: "Edit a file (easy editor)", cmd: "nano {{file}}", why: "Opens a simple editor. The shortcuts are listed along the bottom. Ctrl+O saves, Ctrl+X quits.", keys: "change write text editor" },
      { title: "Save the output of a command to a file", cmd: "{{command}} > {{file}}", why: "The > sends what a command prints into a file instead of the screen. It replaces the file's contents.", keys: "redirect write save output", risky: true },
    ],
  },
  {
    id: "system",
    name: "Your computer",
    items: [
      { title: "Who am I?", cmd: "whoami", why: "Shows the name of the user you're logged in as.", keys: "user name" },
      { title: "How much disk space is left?", cmd: "df -h", why: "Shows the size and free space of each drive in friendly units.", keys: "storage space drive" },
      { title: "How much memory is in use?", cmd: "free -h", why: "Shows memory (RAM) used and free.", keys: "ram" },
      { title: "How big is this folder?", cmd: "du -sh {{folder}}", why: "Adds up the size of a folder and everything in it.", keys: "size space" },
      { title: "How long has the computer been on?", cmd: "uptime", why: "Shows how long your computer has been running.", keys: "time" },
      { title: "What's using my computer?", cmd: "top", why: "A live list of running programs. Press q to quit.", keys: "processes cpu monitor task manager" },
      { title: "List running programs", cmd: "ps aux", why: "A snapshot of everything that's running.", keys: "processes" },
      { title: "Stop a program by its number", cmd: "kill {{number}}", why: "Asks a running program to stop. Get the number (PID) from ps aux or top.", keys: "end close pid", risky: true },
    ],
  },
  {
    id: "install",
    name: "Install and update (Fedora)",
    items: [
      { title: "Install a program", cmd: "sudo dnf install {{package}}", why: "Downloads and installs a program. sudo means 'do this as the administrator'.", keys: "add software app package", risky: true },
      { title: "Search for a program", cmd: "dnf search {{word}}", why: "Looks for programs matching a word. Doesn't change anything.", keys: "find software package" },
      { title: "Update everything", cmd: "sudo dnf upgrade", why: "Updates all the installed programs and the system.", keys: "update software", risky: true },
      { title: "Remove a program", cmd: "sudo dnf remove {{package}}", why: "Uninstalls a program.", keys: "uninstall delete software", risky: true },
      { title: "Install a Flatpak app", cmd: "flatpak install {{app}}", why: "Installs an app from Flatpak (like an app store).", keys: "software" },
      { title: "See installed Flatpak apps", cmd: "flatpak list", why: "Lists the Flatpak apps you've installed.", keys: "software" },
    ],
  },
  {
    id: "git",
    name: "Git (saving your projects)",
    items: [
      { title: "Download a project", cmd: "git clone {{url}}", why: "Copies a project from the internet (like GitHub) into a new folder.", keys: "download github repository repo" },
      { title: "What has changed?", cmd: "git status", why: "Shows which files you've changed and what's ready to save.", keys: "changes" },
      { title: "Get ready to save everything", cmd: "git add .", why: "Marks every changed file to go into your next save.", keys: "stage" },
      { title: "Save a snapshot", cmd: "git commit -m \"{{message}}\"", why: "Saves a snapshot of the marked files with a short note about what you did.", keys: "save commit" },
      { title: "Upload your saves", cmd: "git push", why: "Sends your saved snapshots up to GitHub.", keys: "upload send" },
      { title: "Download new changes", cmd: "git pull", why: "Brings down any new changes from GitHub.", keys: "update sync" },
      { title: "See the history of saves", cmd: "git log --oneline", why: "Lists past snapshots, one line each. Press q to leave.", keys: "history commits" },
    ],
  },
  {
    id: "net",
    name: "Network",
    items: [
      { title: "Is the internet working?", cmd: "ping -c 4 {{website}}", why: "Sends four test messages to a website and shows if it answers.", keys: "connection test online" },
      { title: "What's my IP address?", cmd: "ip addr", why: "Shows your network connections and their addresses.", keys: "network wifi" },
      { title: "Download a file", cmd: "curl -O {{url}}", why: "Downloads the file at that web address into this folder.", keys: "get fetch" },
    ],
  },
  {
    id: "tidy",
    name: "Tidy up",
    items: [
      { title: "Clear the screen", cmd: "clear", why: "Wipes the screen so you start fresh. Ctrl+L does the same.", keys: "clean" },
      { title: "See commands I used before", cmd: "history", why: "Lists the commands you've typed. Tip: the up arrow steps back through them.", keys: "past previous" },
      { title: "Close this terminal session", cmd: "exit", why: "Ends the session and closes the tab.", keys: "quit leave close" },
    ],
  },
];

// Short list for the cheat sheet. Each entry is a cmd from the catalog above.
export const ESSENTIALS = [
  "ls -la",
  "cd {{folder}}",
  "cd ..",
  "pwd",
  "mkdir {{name}}",
  "cp {{file}} {{to}}",
  "mv {{from}} {{to}}",
  "rm {{file}}",
  "cat {{file}}",
  "less {{file}}",
  "grep -rn \"{{text}}\" .",
  "man {{command}}",
  "clear",
];

// Keys that help every beginner. These are tips, not commands to drop.
export const KEYS = [
  ["Ctrl+C", "Stop whatever is running"],
  ["Tab", "Finish a file or command name for you"],
  ["↑  ↓", "Step through commands you used before"],
  ["Ctrl+R", "Search your past commands"],
  ["Ctrl+L", "Clear the screen"],
  ["Ctrl+A / Ctrl+E", "Jump to the start / end of the line"],
  ["Ctrl+Shift+C / V", "Copy / paste"],
  ["Ctrl+Shift+T / W", "New tab / close tab"],
  ["Ctrl+Shift+D", "Open or close Discover"],
  ["Ctrl+Shift+S", "Open or close this cheat sheet"],
];

/** Find a catalog entry by its command text (or null). */
const byCmd = new Map(CATEGORIES.flatMap((c) => c.items).map((i) => [i.cmd, i]));
export function lookup(cmd) {
  return byCmd.get(cmd) || null;
}
