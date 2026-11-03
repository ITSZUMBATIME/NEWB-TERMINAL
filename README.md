# NEWB

A terminal for people who are new to the terminal. It is a real terminal (your own shell, bash or zsh), with friendly extras around it so the command line feels less scary.

- **Cheat sheet:** plain-English commands. Search for "delete a file" or "wifi", then drag a command into the terminal. NEWB types it and waits: you press Enter when you're happy with it. Some commands have blue blanks to fill in.
- **Files:** browse folders, drag a file or folder into the terminal to type its name, jump into a folder with the little `cd` button.
- **Editor:** click a file to edit it in a tab, or show it beside the terminal. Friendly keys by default, Vim if you like.
- **Git buttons:** a Repos tab with one sync button per project, a changes list and a commit box. Hide it in Settings if you don't use git.
- **Themes:** 17 built in, a quick picker (Ctrl+Shift+P) that previews live, and your own themes in `~/.config/newb/themes` (the same `colors.toml` format Omarchy uses, so Omarchy themes work). Edit one and the window recolours as you save.
- **Your logo:** type your own text for the welcome logo and pick a font (see Fonts below).
- **AI helpers (optional, off by default):** an AI chat beside the terminal, a quick Ask bar and an Explain button on each command, using your own Claude Code or Codex. NEWB has no AI of its own and keeps no keys.
- **A short tour** the first time you open it ("Take the tour" at the top of the Commands panel).

Settings are in the cog at the top right (Ctrl+,).

## Install

Download the latest file from the [Releases](https://github.com/ITSZUMBATIME/NEWB-TERMINAL/releases) page:

- **AppImage**: runs on most Linux systems. Make it executable (`chmod +x NEWB*.AppImage`) and double-click it.
- **.rpm** (Fedora): `sudo dnf install ./NEWB*.rpm`
- **.deb** (Debian, Ubuntu): `sudo apt install ./NEWB*.deb`

## Build it yourself

You need Node.js, Rust, and the system packages Tauri needs. On Fedora:

```
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install "c-development"
```

Then, from this folder:

```
npm install
npm run tauri dev      # run it
npm run tauri build    # make the AppImage, .rpm and .deb (in src-tauri/target/release/bundle)
```

## Your own folders

NEWB keeps two folders you can add things to (Settings shows buttons that jump to them):

- `~/.config/newb/themes/<name>/colors.toml`: your themes.
- `~/.config/newb/fonts/`: font files for the logo.

## Fonts
The logo can be drawn in Metal Mania, which is bundled through [Fontsource](https://fontsource.org/fonts/metal-mania) under the SIL Open Font License 1.1. FT Vortex is not included (it is free for personal use only): to use it, put your own copy of the font file in `~/.config/newb/fonts`.

## Licence

MIT. See `LICENSE`.
