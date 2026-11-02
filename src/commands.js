// The commands NEWB knows about, in plain English.
//
// There are two lists here:
//   TREE (further down)  what you browse in the Commands panel.
//   CATEGORIES (this one) the old "Discover" wording. It is no longer shown as its own list; its
//                         everyday titles and keywords are used to make search understand you
//                         (typing "duplicate a file" finds the copy commands).
//
// Blanks: write {{name}} where the person has to fill something in.
//   "cp {{file}} {{to}}" drops in as "cp FILE TO" with FILE and TO highlighted.
// risky: true means "this can delete or change things", so NEWB warns when it is dropped.
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

// Every shortcut, grouped. keys is shown as separate key caps. what is plain English.
export const SHORTCUTS = [
  {
    name: "Everyday",
    rows: [
      { keys: ["Enter"], what: "Run what you have typed" },
      { keys: ["Tab"], what: "Finish a file or command name" },
      { keys: ["Up", "Down"], what: "Go back through past commands" },
      { keys: ["Ctrl", "C"], what: "Stop something that is running" },
      { keys: ["Ctrl", "L"], what: "Clear the screen" },
      { keys: ["Ctrl", "R"], what: "Search your past commands" },
      { keys: ["Ctrl", "A"], what: "Jump to the start of the line" },
      { keys: ["Ctrl", "E"], what: "Jump to the end of the line" },
      { keys: ["Ctrl", "U"], what: "Delete everything before the cursor" },
      { keys: ["Ctrl", "D"], what: "Close the shell on an empty line (closes the tab)" },
    ],
  },
  {
    name: "Copy and paste",
    rows: [
      { keys: ["Ctrl", "C"], what: "Copy the selected text" },
      { keys: ["Ctrl", "V"], what: "Paste" },
      { keys: ["Ctrl", "Shift", "C"], what: "Copy, even when a command is running" },
      { keys: ["Ctrl", "Shift", "V"], what: "Paste, always" },
      { keys: ["Right-click"], what: "Open a menu with Copy, Paste, Select all and Clear screen" },
    ],
  },
  {
    name: "Filling in blanks",
    rows: [
      { keys: ["Tab"], what: "Jump to the next blue blank" },
      { keys: ["Shift", "Tab"], what: "Jump back to the previous blank" },
      { keys: ["Arrow keys"], what: "Stop filling in and edit the line yourself" },
      { keys: ["Enter"], what: "Run the command once every blank is filled in" },
    ],
  },
  {
    name: "Tabs",
    rows: [
      { keys: ["Ctrl", "Shift", "T"], what: "Open a new tab" },
      { keys: ["Ctrl", "Shift", "W"], what: "Close this tab" },
      { keys: ["Ctrl", "Tab"], what: "Go to the next tab" },
      { keys: ["Ctrl", "Shift", "Tab"], what: "Go to the previous tab" },
    ],
  },
  {
    name: "Panels",
    rows: [
      { keys: ["Ctrl", ","], what: "Open Settings" },
      { keys: ["Ctrl", "Shift", "P"], what: "Pick a theme (try them live)" },
      { keys: ["Ctrl", "Shift", "E"], what: "Show or hide Files" },
      { keys: ["Ctrl", "Shift", "F"], what: "Search the text inside a project" },
      { keys: ["Ctrl", "Shift", "B"], what: "Show the editor beside the terminal" },
      { keys: ["Ctrl", "Shift", "S"], what: "Show or hide the cheat sheet" },
      { keys: ["Ctrl", "Shift", "D"], what: "Search the cheat sheet" },
      { keys: ["Ctrl", "Shift", "K"], what: "Show these shortcuts" },
      { keys: ["Esc"], what: "Close the panel you are in" },
    ],
  },
  {
    name: "Size",
    rows: [
      { keys: ["Ctrl", "+"], what: "Make everything bigger" },
      { keys: ["Ctrl", "-"], what: "Make everything smaller" },
      { keys: ["Ctrl", "0"], what: "Back to normal size" },
      { keys: ["Ctrl", "Mouse wheel"], what: "Zoom in and out smoothly" },
    ],
  },
  {
    name: "Welcome screen",
    rows: [
      { keys: ["Ctrl", "Shift", "L"], what: "Try another logo style" },
      { keys: ["Scroll up"], what: "Bring the header with the logo back" },
    ],
  },
];

/** Find a catalog entry by its command text (or null). */
const byCmd = new Map(CATEGORIES.flatMap((c) => c.items).map((i) => [i.cmd, i]));
export function lookup(cmd) {
  return byCmd.get(cmd) || null;
}

/* ------------------------------------------------------------------------------------------
   The command tree (right panel, "Cheat sheet").
   Categories branch like folders in a file explorer. g() makes a group, c() makes a command.
   Written for Fedora (dnf, flatpak, systemd). Blanks use {{name}} as above.
   ------------------------------------------------------------------------------------------ */

const g = (name, ...children) => ({ name, children });
const c = (name, cmd, why, risky = false) => ({ name, cmd, why, risky });

export const TREE = [
  g("Update",
    c("System update", "sudo dnf upgrade --refresh", "Checks for new versions of everything installed with DNF and installs them. It asks you to confirm first."),
    c("Update everything (quick)", "sudo dnf upgrade", "Like System update, but skips refreshing the list of available software first. A bit faster."),
    g("Application updates",
      c("Update Flatpak apps", "flatpak update", "Updates the apps you installed from Flatpak (the app-store style apps)."),
      c("Check what's available", "dnf check-update", "Lists the updates waiting for you, without installing anything."),
      c("Update device firmware", "sudo fwupdmgr update", "Installs firmware updates for things like your motherboard, SSD or keyboard."),
      c("Check for firmware updates", "sudo fwupdmgr refresh && fwupdmgr get-updates", "Looks for firmware updates and lists them. Changes nothing yet."),
    ),
    g("Update mirrors",
      c("Get a fresh mirror list", "sudo dnf clean metadata", "Fedora picks fast download servers (mirrors) for you automatically. This clears the saved list so a fresh one is fetched next time."),
      c("See where updates come from", "dnf repoinfo", "Shows details of each source, including its mirror list address."),
    ),
    g("Update repositories",
      c("List repositories", "dnf repolist", "Shows the sources (repositories) your computer gets software from."),
      c("List all, even switched-off ones", "dnf repolist --all", "Like repolist, but includes repositories that are turned off."),
      c("Refresh repository info", "sudo dnf makecache --refresh", "Downloads the latest list of available software from every repository."),
      c("Turn a repository on", "sudo dnf config-manager setopt {{repo}}.enabled=1", "Switches a repository on so its software shows up. Use the name from dnf repolist --all."),
      c("Turn a repository off", "sudo dnf config-manager setopt {{repo}}.enabled=0", "Switches a repository off without removing it."),
    ),
  ),

  g("Install and remove",
    g("Programs (DNF)",
      c("Search for a program", "dnf search {{word}}", "Looks for programs matching a word. Changes nothing."),
      c("Show details of a program", "dnf info {{package}}", "Shows what a program is, its version and its size."),
      c("Install a program", "sudo dnf install {{package}}", "Downloads and installs a program. sudo means 'do this as the administrator'."),
      c("Remove a program", "sudo dnf remove {{package}}", "Uninstalls a program.", true),
      c("List installed programs", "dnf list --installed", "Shows everything installed through DNF. Long! Try adding | less at the end."),
      c("Which program owns a file?", "rpm -qf {{file}}", "Tells you which installed package a file came from."),
      c("Remove programs nobody needs", "sudo dnf autoremove", "Removes programs that were only installed to support others and are no longer needed.", true),
      c("Clear downloaded files", "sudo dnf clean all", "Deletes downloaded package files and saved info to free space."),
      c("See what was installed and when", "dnf history", "Lists past installs, updates and removals."),
    ),
    g("Flatpak apps",
      c("Search for an app", "flatpak search {{app}}", "Looks for apps in Flatpak's app store."),
      c("Install an app", "flatpak install {{app}}", "Installs an app from Flatpak."),
      c("Run an app", "flatpak run {{app}}", "Starts a Flatpak app from the terminal."),
      c("List installed apps", "flatpak list", "Shows the Flatpak apps you have installed."),
      c("Update all apps", "flatpak update", "Updates every Flatpak app."),
      c("Remove an app", "flatpak uninstall {{app}}", "Uninstalls a Flatpak app.", true),
      c("Remove unused leftovers", "flatpak uninstall --unused", "Removes runtimes that no installed app needs any more.", true),
    ),
    g("AppImages",
      c("Make an AppImage runnable", "chmod +x {{file}}", "Downloaded AppImages need permission to run. This gives it."),
      c("Run an AppImage", "./{{file}}", "Starts the AppImage. The ./ means 'in this folder'."),
    ),
    g("From a downloaded file",
      c("Install an .rpm file", "sudo dnf install ./{{file}}", "Installs a program from a .rpm file you downloaded, and fetches anything it needs."),
    ),
  ),

  g("Files and folders",
    g("Look around",
      c("See what's in this folder", "ls", "Lists the files and folders you're standing in."),
      c("See everything, with details", "ls -la", "Like ls, but also shows hidden files, sizes and dates."),
      c("Show sizes people can read", "ls -lh", "A detailed list with sizes in KB, MB and GB."),
      c("Where am I?", "pwd", "Prints the full path of the folder you're in."),
    ),
    g("Move around",
      c("Go into a folder", "cd {{folder}}", "Moves you into that folder. Press Tab after a few letters to finish the name for you."),
      c("Go up one folder", "cd ..", "Moves you out to the folder that contains this one."),
      c("Go back home", "cd ~", "Jumps to your home folder from anywhere."),
      c("Go back to where I just was", "cd -", "Jumps back to the previous folder you were in."),
    ),
    g("Create",
      c("Make a new folder", "mkdir {{name}}", "Creates an empty folder with that name."),
      c("Make folders inside folders", "mkdir -p {{path}}", "Creates a whole chain of folders at once, like projects/2026/notes."),
      c("Make an empty file", "touch {{file}}", "Creates an empty file, or updates its date if it already exists."),
    ),
    g("Copy and move",
      c("Copy a file", "cp {{file}} {{to}}", "Makes a copy of the file at the new place or under the new name."),
      c("Copy a whole folder", "cp -r {{folder}} {{to}}", "Copies a folder and everything inside it."),
      c("Move or rename", "mv {{from}} {{to}}", "Moves the file or folder to a new place. Moving it within the same folder renames it."),
    ),
    g("Delete",
      c("Delete a file", "rm {{file}}", "Deletes the file for good. There is no rubbish bin.", true),
      c("Delete a folder and everything in it", "rm -r {{folder}}", "Deletes the folder and all its contents for good. Double-check the name first.", true),
      c("Delete an empty folder", "rmdir {{folder}}", "Only works if the folder is empty, so it's the safe way to tidy up."),
    ),
    g("Permissions",
      c("Make a file runnable", "chmod +x {{file}}", "Lets you run the file as a program."),
      c("See who can do what", "ls -l", "The first column shows the permissions: r read, w write, x run."),
      c("Change who owns a file", "sudo chown {{user}} {{file}}", "Gives the file to another user. Needs administrator rights.", true),
    ),
    g("Zip and unzip",
      c("Pack a folder into one file", "tar -czf {{archive}}.tar.gz {{folder}}", "Squashes a folder into a single compressed .tar.gz file."),
      c("Unpack a .tar.gz", "tar -xf {{archive}}", "Unpacks a tar archive into the current folder."),
      c("Make a .zip", "zip -r {{archive}}.zip {{folder}}", "Packs a folder into a .zip file that works on any computer."),
      c("Open a .zip", "unzip {{archive}}.zip", "Unpacks a .zip file into the current folder."),
    ),
    g("Shortcuts",
      c("Make a shortcut (link)", "ln -s {{target}} {{shortcut}}", "Creates a shortcut that points at another file or folder."),
    ),
  ),

  g("Read and search",
    g("View a file",
      c("Show a file", "cat {{file}}", "Prints the whole file on screen. Best for short files."),
      c("Read a long file page by page", "less {{file}}", "Opens the file so you can scroll. Press q to quit."),
      c("See the start of a file", "head {{file}}", "Shows the first 10 lines."),
      c("See the end of a file", "tail {{file}}", "Shows the last 10 lines."),
      c("Watch a file as it grows", "tail -f {{file}}", "Keeps showing new lines as they're added, like a log. Press Ctrl+C to stop."),
    ),
    g("Find files",
      c("Find a file by name", "find . -name \"{{name}}\"", "Searches this folder and everything inside it for a matching name."),
      c("Find files changed today", "find . -mtime -1", "Lists files in this folder tree changed in the last day."),
      c("Find big files", "find . -size +100M", "Lists files over 100 MB, handy when you're running out of space."),
      c("Where is a program?", "which {{program}}", "Shows where a program lives on your computer."),
    ),
    g("Search inside files",
      c("Search for words", "grep -rn \"{{text}}\" .", "Looks through every file here for that text and shows where it is."),
      c("Ignore capital letters", "grep -rni \"{{text}}\" .", "Same search, but 'Cat' and 'cat' count as the same."),
      c("Just list the files that match", "grep -rl \"{{text}}\" .", "Shows only the names of files that contain the text."),
    ),
    g("Compare and count",
      c("Compare two files", "diff {{file1}} {{file2}}", "Shows the lines that differ between two files."),
      c("Count the lines in a file", "wc -l {{file}}", "Tells you how many lines the file has."),
      c("Sort the lines of a file", "sort {{file}}", "Prints the lines in A to Z order."),
    ),
  ),

  g("Your computer",
    g("About this computer",
      c("Who am I?", "whoami", "Shows the name of the user you're logged in as."),
      c("Everything at a glance", "fastfetch", "Shows a summary of your computer, like the header at the top of NEWB."),
      c("Operating system version", "cat /etc/os-release", "Shows which Linux and which version you're running."),
      c("Kernel and machine details", "uname -a", "Prints the kernel version and your computer's name."),
      c("Processor details", "lscpu", "Lists your processor's model, cores and speed."),
      c("Graphics cards and other hardware", "lspci", "Lists the hardware connected inside your computer."),
      c("USB devices", "lsusb", "Lists what's plugged into your USB ports."),
    ),
    g("Space and memory",
      c("How much disk space is left?", "df -h", "Shows the size and free space of each drive in friendly units."),
      c("How much memory is in use?", "free -h", "Shows memory (RAM) used and free."),
      c("How big is this folder?", "du -sh {{folder}}", "Adds up the size of a folder and everything in it."),
      c("What's using the most space here?", "du -sh * | sort -h", "Lists everything in this folder from smallest to biggest."),
      c("How long has the computer been on?", "uptime", "Shows how long your computer has been running."),
    ),
    g("Programs running",
      c("Live list of what's busy", "top", "A live view of running programs. Press q to quit."),
      c("Snapshot of everything running", "ps aux", "Lists every running program once."),
      c("Find a running program", "ps aux | grep {{name}}", "Shows only the running programs whose name contains your word."),
      c("Stop a program by its number", "kill {{number}}", "Asks a running program to stop. Get the number (PID) from ps aux or top.", true),
      c("Stop a program by its name", "pkill {{name}}", "Asks every program with that name to stop.", true),
    ),
    g("Services",
      c("Is a service running?", "systemctl status {{service}}", "Shows whether a background service is running, and its latest messages."),
      c("Start a service", "sudo systemctl start {{service}}", "Starts a background service now."),
      c("Stop a service", "sudo systemctl stop {{service}}", "Stops a background service.", true),
      c("Restart a service", "sudo systemctl restart {{service}}", "Stops and starts a service again, often fixes a stuck one."),
      c("Start it every time the computer starts", "sudo systemctl enable --now {{service}}", "Starts the service now and every time you boot."),
      c("Show services that failed", "systemctl --failed", "Lists services that tried to start and couldn't."),
      c("Read a service's log", "journalctl -u {{service}} -e", "Shows the messages a service has written, newest at the bottom."),
      c("Errors since startup", "journalctl -b -p err", "Shows only the error messages since your computer last started."),
    ),
    g("Power",
      c("Restart", "sudo reboot", "Restarts the computer right away.", true),
      c("Shut down", "sudo shutdown now", "Shuts the computer down right away.", true),
    ),
  ),

  g("Network",
    g("Check the connection",
      c("Is the internet working?", "ping -c 4 {{website}}", "Sends four test messages to a website and shows if it answers."),
      c("My network addresses", "ip addr", "Shows your network connections and their addresses."),
      c("Network connections status", "nmcli device status", "Shows whether your wifi and cable connections are up."),
      c("Wifi networks nearby", "nmcli device wifi list", "Lists the wifi networks your computer can see."),
      c("My public IP address", "curl -s ifconfig.me", "Asks a website what address the internet sees you as."),
    ),
    g("Download",
      c("Download a file", "curl -O {{url}}", "Downloads the file at that web address into this folder."),
      c("Download with wget", "wget {{url}}", "Another way to download a file. It shows a progress bar."),
      c("Peek at a web page's headers", "curl -I {{url}}", "Shows the technical header a web server replies with."),
    ),
    g("Other computers",
      c("Log in to another computer", "ssh {{user}}@{{host}}", "Opens a secure session on another computer. Type exit to come back."),
      c("Copy a file to another computer", "scp {{file}} {{user}}@{{host}}:{{to}}", "Sends a file to another computer over SSH."),
      c("Make a new SSH key", "ssh-keygen -t ed25519", "Creates a key pair so you can log in without typing a password."),
    ),
    g("Ports and firewall",
      c("What's listening for connections?", "sudo ss -tulpn", "Lists the programs waiting for connections and the ports they use."),
      c("Show the firewall settings", "sudo firewall-cmd --list-all", "Lists what the Fedora firewall currently allows."),
    ),
  ),

  g("Git",
    g("Getting started",
      c("Download a project", "git clone {{url}}", "Copies a project from the internet (like GitHub) into a new folder."),
      c("Start tracking this folder", "git init", "Turns the current folder into a git project."),
      c("Set your name", "git config --global user.name \"{{name}}\"", "Tells git who you are. Do this once per computer."),
      c("Set your email", "git config --global user.email \"{{email}}\"", "Tells git your email for your saves. Do this once per computer."),
    ),
    g("Every day",
      c("What has changed?", "git status", "Shows which files you've changed and what's ready to save."),
      c("Get ready to save everything", "git add .", "Marks every changed file to go into your next save."),
      c("Save a snapshot", "git commit -m \"{{message}}\"", "Saves a snapshot of the marked files with a short note about what you did."),
      c("Upload your saves", "git push", "Sends your saved snapshots up to GitHub."),
      c("Download new changes", "git pull", "Brings down any new changes from GitHub."),
      c("See what you changed", "git diff", "Shows the exact lines you've changed since your last save."),
    ),
    g("Branches",
      c("List branches", "git branch", "Shows your branches (separate lines of work). The current one has a star."),
      c("Start a new branch", "git switch -c {{name}}", "Creates a new branch and moves onto it."),
      c("Switch to a branch", "git switch {{name}}", "Moves you onto another branch."),
      c("Bring a branch in", "git merge {{name}}", "Combines the other branch's work into the one you're on."),
    ),
    g("History",
      c("See the history of saves", "git log --oneline", "Lists past snapshots, one line each. Press q to leave."),
      c("Look at one save", "git show {{commit}}", "Shows what a single snapshot changed."),
    ),
    g("Undo",
      c("Throw away changes to a file", "git restore {{file}}", "Puts the file back how it was at your last save. Your changes are lost.", true),
      c("Take a file out of the next save", "git restore --staged {{file}}", "Un-marks a file you'd added, but keeps your changes."),
      c("Set changes aside for later", "git stash", "Tucks your current changes away so you can get a clean folder."),
      c("Bring set-aside changes back", "git stash pop", "Puts your stashed changes back."),
      c("Throw away ALL changes", "git reset --hard", "Resets every file to your last save. Everything unsaved is lost.", true),
    ),
  ),

  g("Disks and USB",
    g("See your drives",
      c("List drives and partitions", "lsblk", "Draws a tree of your drives and the partitions on them."),
      c("Drives with their names and types", "lsblk -f", "Like lsblk, plus the file system type and where each is mounted."),
      c("Free space on each drive", "df -h", "Shows used and free space per drive."),
      c("Detailed partition table", "sudo fdisk -l", "Lists every drive's partitions in detail. Only looks, changes nothing."),
    ),
    g("Mount and eject",
      c("Mount a drive", "sudo mount {{device}} {{folder}}", "Makes a drive's files show up in a folder. Get the device name from lsblk.", true),
      c("Unmount a drive", "sudo umount {{folder}}", "Safely lets go of a mounted drive before you unplug it."),
      c("Power off a USB drive", "udisksctl power-off -b {{device}}", "Safely powers down a USB drive so you can unplug it."),
    ),
  ),

  g("Text and editing",
    g("Edit",
      c("Edit a file (easy editor)", "nano {{file}}", "Opens a simple editor. The shortcuts are listed along the bottom. Ctrl+O saves, Ctrl+X quits."),
      c("Add a line to the end of a file", "echo \"{{text}}\" >> {{file}}", "Adds your text as a new last line. Existing content is kept."),
      c("Replace a file's contents", "echo \"{{text}}\" > {{file}}", "Writes your text into the file and erases what was there.", true),
      c("Save a command's output to a file", "{{command}} > {{file}}", "The > sends what a command prints into a file instead of the screen. It replaces the file's contents.", true),
    ),
    g("Tidy and sort",
      c("Sort and remove duplicates", "sort {{file}} | uniq", "Prints the lines in order with repeated lines shown once."),
      c("Count the words", "wc -w {{file}}", "Tells you how many words the file has."),
    ),
  ),

  g("Terminal tricks",
    g("Get help",
      c("Read the manual for a command", "man {{command}}", "Opens the full manual for a command. Press q to quit."),
      c("Short help for a command", "{{command}} --help", "Most commands print a quick summary of how to use them."),
      c("What kind of command is this?", "type {{command}}", "Tells you if something is a program, a shortcut or a built-in."),
    ),
    g("History",
      c("See commands I used before", "history", "Lists the commands you've typed. Tip: the up arrow steps back through them."),
      c("Search my history", "history | grep {{word}}", "Finds past commands that contain your word."),
      c("Run the last command again", "!!", "Repeats your previous command. Handy after forgetting sudo: sudo !!"),
    ),
    g("Screen",
      c("Clear the screen", "clear", "Wipes the screen so you start fresh. Ctrl+L does the same."),
      c("Fix a scrambled terminal", "reset", "Resets the terminal if it fills with strange symbols."),
      c("Close this terminal session", "exit", "Ends the session and closes the tab."),
    ),
    g("Make your own shortcuts",
      c("Create a short name for a command", "alias {{short}}='{{command}}'", "Makes a short name for a long command. It lasts until you close the tab."),
    ),
  ),
];

/** Every command in the tree, flattened, with the path of groups it sits in. */
export function flattenTree(nodes = TREE, trail = []) {
  const out = [];
  for (const n of nodes) {
    if (n.children) out.push(...flattenTree(n.children, [...trail, n.name]));
    else out.push({ ...n, trail });
  }
  return out;
}

const byTreeCmd = new Map(flattenTree().map((n) => [n.cmd, n]));
/** Find a tree command by its command text (or null). */
export function lookupTree(cmd) {
  return byTreeCmd.get(cmd) || null;
}

/* Search hints: the old Discover titles and keywords, looked up by command. */
const hintByCmd = new Map(CATEGORIES.flatMap((cat) => cat.items.map((i) => [i.cmd, `${i.title} ${i.keys || ""}`])));
export function hintsFor(cmd) {
  return hintByCmd.get(cmd) || "";
}
