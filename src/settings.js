// The Settings tab (Ctrl+,). A list of sections on the left, a search box on top, and the
// settings themselves in one scrolling page. Changes apply straight away and are remembered.

import { el, askChoice } from "./ui.js";
import { prefs } from "./prefs.js";
import { icon } from "./icons.js";
import { THEMES, currentTheme, customThemes, onThemeChange, onThemesListChange, setTheme, setSync, themeState } from "./themes.js";

// A row of buttons where one is chosen.
function choice(items, value, onPick) {
  const box = el("div", "seg");
  const buttons = items.map((it) => {
    const b = el("button", "", it.label);
    b.type = "button";
    b.addEventListener("click", () => onPick(it.id));
    box.append(b);
    return { id: it.id, b };
  });
  const set = (v) => buttons.forEach(({ id, b }) => b.classList.toggle("on", id === v));
  set(value);
  return { el: box, set };
}

function toggle(on, onChange) {
  const b = el("button", "switch");
  b.type = "button";
  b.setAttribute("role", "switch");
  const set = (v) => {
    b.setAttribute("aria-checked", v ? "true" : "false");
    b.classList.toggle("on", Boolean(v));
  };
  set(on);
  b.addEventListener("click", () => onChange(b.getAttribute("aria-checked") !== "true"));
  return { el: b, set };
}

/**
 * options: { host, display, toast, welcome, projects, version, themes, logo, showThemesFolder(), showFontsFolder() }
 * returns { show(sectionId), focus(), destroy() }
 */
export function createSettingsView({ host, display, toast, welcome, projects, version, themes, logo, showThemesFolder, showFontsFolder }) {
  const rows = []; // { section, el, text } for searching
  const sections = []; // { id, title, el, navEl }

  const root = el("div", "settings");
  const nav = el("nav", "st-nav");
  const main = el("div", "st-main");
  const search = el("input", "st-search");
  search.type = "text";
  search.placeholder = "Search settings";
  search.spellcheck = false;
  search.autocomplete = "off";
  const none = el("div", "empty", "No setting matches that. Try a shorter word.");
  none.hidden = true;
  const page = el("div", "st-page");
  main.append(search, page, none);
  root.append(nav, main);
  host.append(root);

  function section(id, title) {
    const sec = el("section", "st-section");
    sec.dataset.section = id;
    sec.append(el("h2", "", title));
    page.append(sec);
    const navEl = el("button", "st-nav-item", title);
    navEl.type = "button";
    navEl.addEventListener("click", () => {
      search.value = "";
      applySearch();
      sec.scrollIntoView({ block: "start", behavior: "smooth" });
      navEl.blur();
    });
    nav.append(navEl);
    sections.push({ id, title, el: sec, navEl });
    return sec;
  }

  // One setting: a label with a hint on the left, the control on the right.
  function row(sec, label, hint, control, keywords = "") {
    const r = el("div", "st-row");
    const text = el("div", "st-text");
    text.append(el("div", "st-label", label));
    if (hint) text.append(el("div", "st-hint", hint));
    r.append(text, control);
    sec.append(r);
    rows.push({ section: sec, el: r, text: `${label} ${hint || ""} ${keywords}`.toLowerCase() });
    return r;
  }

  function applySearch() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let any = false;
    for (const sec of sections) {
      let shown = 0;
      for (const r of rows.filter((x) => x.section === sec.el)) {
        const hit = words.every((w) => r.text.includes(w));
        r.el.hidden = !hit;
        if (hit) shown++;
      }
      sec.el.hidden = words.length > 0 && !shown;
      any = any || shown > 0;
    }
    none.hidden = any || !words.length;
  }
  search.addEventListener("input", applySearch);

  /* ---------- Appearance ---------- */

  const look = section("appearance", "Appearance");

  // Theme gallery
  const gallery = el("div", "st-gallery");
  const cards = new Map();
  function themeCard(theme) {
    const b = el("button", "theme-card");
    b.type = "button";
    b.title = theme.name;
    const pv = el("div", "theme-pv");
    pv.style.background = theme.bg;
    pv.style.color = theme.ink;
    const line = (parts) => {
      const d = el("div");
      for (const [text, colour] of parts) {
        const s = el("span", "", text);
        if (colour) s.style.color = colour;
        d.append(s);
      }
      return d;
    };
    pv.append(
      line([["$ ", theme.green], ["ls -la"]]),
      line([["docs ", theme.accent], ["src ", theme.amber], ["run.sh", theme.purple]]),
      line([["error ", theme.red], ["ok ", theme.cyan]]),
    );
    const name = el("div", "theme-name");
    name.append(el("span", "", theme.name), icon("check"));
    b.append(pv, name);
    b.addEventListener("click", () => {
      const st = themeState();
      const picked = setTheme(theme.id);
      if (st.sync && picked.dark !== currentTheme().dark) {
        toast(`Saved for when your system is in ${picked.dark ? "dark" : "light"} mode.`, 3500);
      }
    });
    cards.set(theme.id, b);
    return b;
  }
  const darkOnes = el("div", "theme-grid");
  const lightOnes = el("div", "theme-grid");
  for (const th of THEMES) (th.dark ? darkOnes : lightOnes).append(themeCard(th));
  gallery.append(el("div", "st-sub", "Dark"), darkOnes, el("div", "st-sub", "Light"), lightOnes);
  const galleryRow = el("div", "st-block");
  galleryRow.append(el("div", "st-label", "Theme"), el("div", "st-hint", "One click recolours everything: the terminal, the editor, the panels and the header. Ctrl+Shift+P opens a quick picker from anywhere."), gallery);
  look.append(galleryRow);
  rows.push({ section: look, el: galleryRow, text: "theme colour colours dark light nord dracula gruvbox solarized catppuccin tokyo monokai github one pine" });

  /* ---------- Your own themes ---------- */

  const mine = el("div", "st-block");
  const mineHint = el("div", "st-hint");
  const mineActions = el("div", "st-actions");
  const newBtn = el("button", "st-btn", "New theme from this one");
  const folderBtn = el("button", "st-btn", "Show the folder");
  for (const b of [newBtn, folderBtn]) b.type = "button";
  newBtn.addEventListener("click", () => themes?.createFromCurrent());
  folderBtn.addEventListener("click", () => showThemesFolder?.());
  mineActions.append(newBtn, folderBtn);
  const mineGrid = el("div", "theme-grid");
  const mineEmpty = el("div", "st-hint", "No themes of your own yet.");
  const gitForm = el("form", "st-add");
  const gitInput = el("input", "st-input");
  gitInput.type = "text";
  gitInput.placeholder = "Add from Git: https://github.com/…";
  gitInput.spellcheck = false;
  const gitBtn = el("button", "st-btn", "Add");
  gitBtn.type = "submit";
  gitForm.append(gitInput, gitBtn);
  gitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = gitInput.value.trim();
    if (!url || !themes) return;
    gitBtn.disabled = true;
    const problem = await themes.install(url);
    gitBtn.disabled = false;
    if (problem) toast(problem, 5000);
    else gitInput.value = "";
  });
  mine.append(el("div", "st-label", "Your own themes"), mineHint, mineActions, mineGrid, mineEmpty, gitForm);
  mine.hidden = !themes;
  look.append(mine);
  if (themes) rows.push({ section: look, el: mine, text: "your own custom themes make new edit colours colors.toml omarchy git github download add import folder" });

  let mineIds = [];
  function renderMine() {
    mineHint.textContent = `They live in ${themes ? themes.prettyDir() : "~/.config/newb/themes"}. Change a colour in a theme's colors.toml and press Ctrl+S: NEWB recolours as you save. Omarchy themes work too.`;
    for (const id of mineIds) cards.delete(id);
    mineIds = [];
    mineGrid.replaceChildren();
    const list = customThemes();
    for (const th of list) {
      const wrap = el("div", "theme-wrap");
      const card = themeCard(th);
      mineIds.push(th.id);
      const acts = el("div", "theme-acts");
      const edit = el("button");
      edit.type = "button";
      edit.title = "Edit its colours";
      edit.append(icon("edit"));
      edit.addEventListener("click", (e) => { e.stopPropagation(); themes?.edit(th); });
      const del = el("button");
      del.type = "button";
      del.title = "Move to the trash";
      del.append(icon("trash"));
      del.addEventListener("click", (e) => { e.stopPropagation(); themes?.remove(th); });
      acts.append(edit, del);
      wrap.append(card, acts);
      mineGrid.append(wrap);
    }
    mineEmpty.hidden = list.length > 0;
    markCards();
  }
  function markCards() {
    const th = currentTheme();
    for (const [id, b] of cards) b.classList.toggle("on", id === th.id);
  }
  const unsubscribeThemes = onThemesListChange(renderMine);
  renderMine();

  const sync = toggle(themeState().sync, (v) => {
    setSync(v);
    toast(v ? "NEWB will follow your system's light or dark setting." : "NEWB will keep the theme you picked.", 3000);
  });
  row(look, "Match the system light or dark setting", "Uses your dark theme at night and your light theme by day, if your system switches.", sync.el, "system automatic auto");

  const lookSeg = choice(
    [{ id: "classic", label: "Classic" }, { id: "flat", label: "Flat" }, { id: "terminal", label: "Terminal" }],
    display.state.panels,
    (id) => display.setLook(id),
  );
  row(look, "Look", "The style of the panels and icons.", lookSeg.el, "panels style icons classic flat terminal");

  const sizeSeg = choice(
    [75, 100, 125, 150, 200].map((n) => ({ id: n / 100, label: String(n) })),
    display.state.scale,
    (id) => display.setScale(id, { quiet: true }),
  );
  row(look, "Size", "Makes everything bigger or smaller. Ctrl + and Ctrl - do the same.", sizeSeg.el, "zoom scale bigger smaller percent");

  const fontStep = el("div", "stepper");
  const fontMinus = el("button", "step-btn", "−");
  const fontVal = el("span", "st-value");
  const fontPlus = el("button", "step-btn", "+");
  for (const b of [fontMinus, fontPlus]) b.type = "button";
  fontMinus.addEventListener("click", () => display.setFont(display.state.font - 1));
  fontPlus.addEventListener("click", () => display.setFont(display.state.font + 1));
  fontStep.append(fontMinus, fontVal, fontPlus);
  row(look, "Terminal text size", "The size of the letters in the terminal and the editor.", fontStep, "font letters bigger smaller");

  /* ---------- Logo ---------- */

  const logoSeg = choice(welcome.logos(), welcome.logo(), (id) => welcome.setLogo(id));
  let fontSelect = null;
  let fontRowHint = null;
  let fontsFolderHint = null;
  if (logo) {
    const logoText = el("input", "st-input st-input-short");
    logoText.type = "text";
    logoText.maxLength = logo.maxChars;
    logoText.spellcheck = false;
    logoText.autocomplete = "off";
    logoText.value = logo.text();
    let typing = null;
    logoText.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(() => logo.setText(logoText.value), 300);
    });
    logoText.addEventListener("blur", () => { logoText.value = logo.text(); });
    row(look, "Logo text", `What the big logo at the top says. Short words look best (up to ${logo.maxChars} characters).`, logoText, "logo text name word akin newb");

    fontSelect = el("select", "st-select");
    fontSelect.addEventListener("change", () => logo.setFont(fontSelect.value));
    const fontRow = row(look, "Logo font", "The letters the logo is drawn in.", fontSelect, "logo font vortex metal mania gothic");
    fontRowHint = fontRow.querySelector(".st-hint");
  }
  row(look, "Logo style", "How the logo is drawn: with 0s and 1s, dots or shaded characters.", logoSeg.el, "logo style ascii code dot matrix shade");
  if (logo) {
    const fontsBtn = el("button", "st-btn", "Show the fonts folder");
    fontsBtn.type = "button";
    fontsBtn.addEventListener("click", () => showFontsFolder?.());
    const fontsRow = row(look, "Your own fonts", "", fontsBtn, "logo fonts folder add install ttf otf vortex file");
    fontsFolderHint = fontsRow.querySelector(".st-hint") || fontsRow.querySelector(".st-text").appendChild(el("div", "st-hint"));
  }

  function showLogoFonts() {
    if (!logo || !fontSelect) return;
    const options = logo.options();
    fontSelect.replaceChildren(
      ...options.map((o) => {
        const opt = el("option", "", o.label);
        opt.value = o.id;
        return opt;
      }),
    );
    fontSelect.value = options.some((o) => o.id === logo.font()) ? logo.font() : "metal-mania";
    fontRowHint.textContent = logo.note() || "The letters the logo is drawn in.";
    fontRowHint.classList.toggle("warn", Boolean(logo.note()));
    fontsFolderHint.textContent = `Put a font file (.ttf or .otf) in ${logo.prettyDir()} and it shows up in the list above. FT Vortex works this way.`;
  }
  const unsubscribeLogo = logo?.subscribe(showLogoFonts);
  showLogoFonts();

  /* ---------- Terminal ---------- */

  const term = section("terminal", "Terminal");
  const cursorSeg = choice(
    [{ id: "block", label: "Block" }, { id: "bar", label: "Bar" }, { id: "underline", label: "Underline" }],
    prefs.get("cursorStyle"),
    (id) => prefs.set("cursorStyle", id),
  );
  row(term, "Cursor shape", "How the blinking marker where you type looks.", cursorSeg.el, "cursor block bar underline");
  const blink = toggle(prefs.get("cursorBlink"), (v) => prefs.set("cursorBlink", v));
  row(term, "Blinking cursor", "", blink.el, "cursor blink flash");
  const historySeg = choice(
    [1000, 5000, 10000, 50000].map((n) => ({ id: n, label: n.toLocaleString() })),
    prefs.get("scrollback"),
    (id) => prefs.set("scrollback", id),
  );
  row(term, "History", "How many lines you can scroll back through in each terminal.", historySeg.el, "scrollback lines scroll back memory");

  /* ---------- Editor ---------- */

  const edit = section("editor", "Editor");
  const keysSeg = choice(
    [{ id: "friendly", label: "Friendly" }, { id: "vim", label: "Vim" }],
    display.state.editor,
    (id) => display.setEditor(id),
  );
  row(edit, "Keys", "Friendly is normal typing. Vim is for people who already know Vim keys.", keysSeg.el, "vim keys keyboard editor");
  const tabSeg = choice(
    [2, 4, 8].map((n) => ({ id: n, label: String(n) })),
    prefs.get("tabSize"),
    (id) => prefs.set("tabSize", id),
  );
  row(edit, "Tab size", "How many spaces wide one indent is.", tabSeg.el, "tab indent spaces");
  const wrap = toggle(prefs.get("wordWrap"), (v) => prefs.set("wordWrap", v));
  row(edit, "Wrap long lines", "Show a long line on several rows instead of scrolling sideways.", wrap.el, "word wrap long lines");
  const lines = toggle(prefs.get("lineNumbers"), (v) => prefs.set("lineNumbers", v));
  row(edit, "Line numbers", "", lines.el, "line numbers gutter");

  /* ---------- Panels ---------- */

  const panels = section("panels", "Panels");
  const showRepos = toggle(prefs.get("showRepos"), (v) => prefs.set("showRepos", v));
  row(panels, "Show the Repos tab", "Turn this off if you don't use git.", showRepos.el, "repos git projects tab");
  const showSearch = toggle(prefs.get("showSearch"), (v) => prefs.set("showSearch", v));
  row(panels, "Show the Search tab", "Finds text inside your projects (Ctrl+Shift+F).", showSearch.el, "search find tab");

  /* ---------- Welcome screen ---------- */

  const hello = section("welcome", "Welcome screen");
  const layoutSeg = choice(welcome.layouts(), welcome.layout(), (id) => welcome.setLayout(id));
  row(hello, "Layout", "The logo and system info at the top of the terminal.", layoutSeg.el, "welcome header logo info text off");

  /* ---------- Projects ---------- */

  const proj = section("projects", "Projects");
  const folders = el("div", "st-folders");
  const addBox = el("form", "st-add");
  const addInput = el("input", "st-input");
  addInput.type = "text";
  addInput.placeholder = "~/Projects";
  addInput.spellcheck = false;
  const addBtn = el("button", "st-btn", "Add");
  addBtn.type = "submit";
  addBox.append(addInput, addBtn);
  addBox.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!addInput.value.trim() || !projects) return;
    const problem = await projects.addRoot(addInput.value);
    if (problem) toast(problem, 3000);
    else addInput.value = "";
  });
  const foldersBox = el("div");
  foldersBox.append(folders, addBox);
  row(proj, "Folders to look in", "NEWB finds projects (folders with a .git folder) inside these. They appear in the Repos tab and the Search tab.", foldersBox, "projects folders repos git");

  function showFolders() {
    folders.replaceChildren();
    for (const path of projects ? projects.roots() : []) {
      const line = el("div", "st-folder");
      const del = el("button");
      del.type = "button";
      del.title = "Stop looking here";
      del.append(icon("close"));
      del.addEventListener("click", () => projects.removeRoot(path));
      line.append(el("span", "", projects.pretty(path)), del);
      folders.append(line);
    }
    if (!folders.childElementCount) folders.append(el("div", "st-hint", "No folders yet."));
  }
  showFolders();
  const unsubscribeRoots = projects?.subscribeRoots(showFolders);

  /* ---------- About ---------- */

  const about = section("about", "About");
  row(about, `NEWB ${version ? `v${version}` : ""}`, "A terminal for people who are new to the terminal. Open source (MIT): github.com/ITSZUMBATIME/NEWB-TERMINAL", el("span"), "about version licence");

  const reset = el("button", "st-btn danger", "Reset all settings");
  reset.type = "button";
  reset.addEventListener("click", async () => {
    const pick = await askChoice({
      title: "Reset all settings?",
      message: "Theme, size, text size, editor and panel choices all go back to how NEWB first looked. Your favourites, categories and files are not touched.",
      choices: [
        { id: "reset", label: "Reset", danger: true },
        { id: "keep", label: "Keep my settings", primary: true, cancel: true },
      ],
    });
    if (pick !== "reset") return;
    setSync(false);
    setTheme("newb-dark");
    prefs.reset();
    display.setScale(1, { quiet: true });
    display.setFont(14);
    display.setLook("classic");
    display.setEditor("friendly");
    welcome.setLayout("pinned");
    welcome.setLogo("code");
    toast("Settings reset.", 2500);
  });
  row(about, "Start over", "Puts every setting back to how it was.", reset, "reset defaults start over");

  /* ---------- Keeping the page in step ---------- */

  function refresh() {
    markCards();
    sync.set(themeState().sync);
    lookSeg.set(display.state.panels);
    sizeSeg.set(Math.round(display.state.scale * 100) / 100);
    fontVal.textContent = `${display.state.font} px`;
    keysSeg.set(display.state.editor);
    cursorSeg.set(prefs.get("cursorStyle"));
    blink.set(prefs.get("cursorBlink"));
    historySeg.set(prefs.get("scrollback"));
    tabSeg.set(prefs.get("tabSize"));
    wrap.set(prefs.get("wordWrap"));
    lines.set(prefs.get("lineNumbers"));
    showRepos.set(prefs.get("showRepos"));
    showSearch.set(prefs.get("showSearch"));
    layoutSeg.set(welcome.layout());
    logoSeg.set(welcome.logo());
    showLogoFonts();
  }
  refresh();
  onThemeChange(refresh);
  const unsubscribe = display.subscribe(refresh);
  const unsubscribePrefs = prefs.subscribe(refresh);
  const unsubscribeWelcome = welcome.subscribe(refresh);

  // Highlight the section you are looking at in the list on the left.
  function markNav() {
    let current = sections[0];
    // While the tab is hidden everything measures zero, so keep the first section lit.
    if (page.clientHeight > 0) {
      const top = page.getBoundingClientRect().top + 40;
      for (const sec of sections) if (!sec.el.hidden && sec.el.getBoundingClientRect().top <= top) current = sec;
      // At the very bottom the last sections can never reach the top, so light the last one.
      const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 2;
      if (atBottom && page.scrollTop > 0) {
        const shown = sections.filter((s) => !s.el.hidden);
        current = shown[shown.length - 1] || current;
      }
    }
    for (const sec of sections) sec.navEl.classList.toggle("on", sec === current);
  }
  page.addEventListener("scroll", markNav);
  // Also re-check when the tab is shown (its size changes from nothing to something).
  const resizer = new ResizeObserver(markNav);
  resizer.observe(page);
  markNav();

  return {
    show(id) {
      const sec = sections.find((s) => s.id === id);
      if (sec) sec.el.scrollIntoView({ block: "start" });
    },
    focus: () => search.focus(),
    destroy() {
      resizer.disconnect();
      unsubscribeThemes();
      unsubscribeLogo?.();
      unsubscribe();
      unsubscribePrefs();
      unsubscribeWelcome();
      unsubscribeRoots?.();
      root.remove();
    },
  };
}
