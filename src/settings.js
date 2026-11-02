// The Settings tab (Ctrl+,). A list of sections on the left, a search box on top, and the
// settings themselves in one scrolling page. Changes apply straight away and are remembered.

import { el } from "./ui.js";
import { icon } from "./icons.js";
import { THEMES, currentTheme, onThemeChange, setTheme, setSync, themeState } from "./themes.js";

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
 * options: { host, display, toast }
 * returns { show(sectionId), focus(), destroy() }
 */
export function createSettingsView({ host, display, toast }) {
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
  galleryRow.append(el("div", "st-label", "Theme"), el("div", "st-hint", "One click recolours everything: the terminal, the editor, the panels and the header."), gallery);
  look.append(galleryRow);
  rows.push({ section: look, el: galleryRow, text: "theme colour colours dark light nord dracula gruvbox solarized catppuccin tokyo monokai github one pine" });

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

  /* ---------- Keeping the page in step ---------- */

  function refresh() {
    const th = currentTheme();
    for (const [id, b] of cards) b.classList.toggle("on", id === th.id);
    sync.set(themeState().sync);
    lookSeg.set(display.state.panels);
    sizeSeg.set(Math.round(display.state.scale * 100) / 100);
    fontVal.textContent = `${display.state.font} px`;
  }
  refresh();
  onThemeChange(refresh);
  const unsubscribe = display.subscribe(refresh);

  return {
    show(id) {
      const sec = sections.find((s) => s.id === id);
      if (sec) sec.el.scrollIntoView({ block: "start" });
    },
    focus: () => search.focus(),
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
