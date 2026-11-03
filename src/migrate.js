// Runs before anything else reads a saved setting.
// Older versions kept their settings under names starting "akin."; they are now "newb.".
// Each old value is copied across once. The old ones are left alone, so going back to an older
// version loses nothing.

try {
  const old = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("akin.")) old.push(key); // collect first: adding keys while counting would confuse the loop
  }
  for (const key of old) {
    const next = `newb.${key.slice("akin.".length)}`;
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key));
  }
} catch (_) {
  /* no saved settings to carry over */
}
