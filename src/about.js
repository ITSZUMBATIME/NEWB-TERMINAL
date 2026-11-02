// The (i) button: what AKIN is, how to get started, and where to find more.

import { makePopover } from "./ui.js";
import pkg from "../package.json";

/**
 * options: { openCheats(), openKeys() }
 * returns { popover }
 */
export function initAbout({ openCheats, openKeys }) {
  const pop = document.getElementById("info-pop");
  const popover = makePopover(pop, document.getElementById("open-info"));
  document.getElementById("about-ver").textContent = `v${pkg.version}`;
  document.getElementById("about-cheats").addEventListener("click", () => {
    popover.close();
    openCheats();
  });
  document.getElementById("about-keys").addEventListener("click", () => {
    popover.close();
    openKeys();
  });
  return { popover };
}
