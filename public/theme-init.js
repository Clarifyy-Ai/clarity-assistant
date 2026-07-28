/**
 * Pre-hydration theme bootstrap (external so CSP can omit script 'unsafe-inline').
 * Keeps theme consistent before React renders.
 */
(function () {
  try {
    if (/Electron/i.test(navigator.userAgent)) {
      document.documentElement.dataset.electron = "true";
    }

    var stored = localStorage.getItem("confideq-ui");
    var isDark = false;

    if (stored) {
      var state = JSON.parse(stored);
      var resolved = state.state && state.state.resolved_theme;
      var theme = state.state && state.state.theme;

      isDark =
        theme === "dark" ||
        (theme === "system" && resolved === "dark");
    }

    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {
    document.documentElement.classList.remove("dark");
  }
})();
