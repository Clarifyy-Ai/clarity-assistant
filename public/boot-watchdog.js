/* Boot watchdog: if React never mounts, surface the real error + retry.
   Kept as an external file so it satisfies a `script-src 'self'` CSP
   (inline scripts are blocked by the preview/production CSP). */
(function () {
  var BOOT_TIMEOUT_MS = 8000;
  var firstError = null;

  function onErr(e) {
    if (!firstError) {
      firstError =
        (e && (e.message || (e.reason && e.reason.message) || e.reason)) ||
        "Unknown error";
    }
  }

  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);

  function escapeHtml(s) {
    return String(s).replace(/[<>&]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c];
    });
  }

  setTimeout(function () {
    var splash = document.getElementById("boot-splash");
    if (!splash || !splash.isConnected) return; // React mounted, splash replaced

    splash.innerHTML =
      '<div style="max-width:32rem;text-align:center;display:flex;flex-direction:column;gap:12px;padding:0 24px">' +
      '<p style="margin:0;font-size:18px;font-weight:700">The app didn\'t finish loading</p>' +
      '<p style="margin:0;font-size:13px;opacity:.7;line-height:1.6">This is usually a stale cached bundle in the preview. Retry below, or hard-refresh with Ctrl/Cmd + Shift + R.</p>' +
      (firstError
        ? '<pre style="margin:0;white-space:pre-wrap;text-align:left;font-size:11px;background:rgba(148,163,184,.12);padding:10px;border-radius:8px;overflow:auto;max-height:160px">' +
          escapeHtml(firstError) +
          "</pre>"
        : "") +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button id="boot-retry" style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;background:#8b5cf6;color:#fff">Retry</button>' +
      '<a href="https://developer.chrome.com/docs/devtools/open" target="_blank" rel="noopener noreferrer" style="border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;color:#e2e8f0;text-decoration:none">How to open DevTools</a>' +
      "</div></div>";

    splash.removeAttribute("aria-busy");

    var btn = document.getElementById("boot-retry");
    if (btn) {
      btn.addEventListener("click", function () {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker
            .getRegistrations()
            .then(function (rs) {
              rs.forEach(function (r) {
                r.unregister();
              });
            })
            .catch(function () {});
        }
        if (window.caches) {
          caches
            .keys()
            .then(function (ks) {
              ks.forEach(function (k) {
                caches.delete(k);
              });
            })
            .catch(function () {});
        }
        setTimeout(function () {
          window.location.reload();
        }, 150);
      });
    }
  }, BOOT_TIMEOUT_MS);
})();
