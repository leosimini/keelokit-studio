import {existsSync, readdirSync} from "node:fs";
import {join} from "node:path";

// Remotion needs a headless-shell or Chrome for Testing build, so headless shells are preferred. Tests never download a browser: they use KEELOKIT_CHROMIUM, a system Chromium, or one already under PLAYWRIGHT_BROWSERS_PATH.
function candidates() {
  const found = [process.env.KEELOKIT_CHROMIUM, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsers && existsSync(browsers)) {
    for (const entry of readdirSync(browsers).sort().reverse()) {
      if (/^chromium_headless_shell-\d+$/.test(entry)) found.push(join(browsers, entry, "chrome-linux", "headless_shell"), join(browsers, entry, "chrome-linux64", "chrome-headless-shell"));
    }
    for (const entry of readdirSync(browsers).sort().reverse()) {
      if (/^chromium-\d+$/.test(entry)) found.push(join(browsers, entry, "chrome-linux", "chrome"), join(browsers, entry, "chrome-linux64", "chrome"));
    }
  }
  return found.filter(Boolean);
}

export const chromiumExecutable = candidates().find((path) => existsSync(path)) ?? "/usr/bin/chromium";
