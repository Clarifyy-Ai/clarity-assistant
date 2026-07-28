/**
 * Brand JSON-LD injection (external script — avoids CSP script 'unsafe-inline').
 */
(function () {
  var data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "name": "Clarify AI",
        "url": "https://clarify.ai.sltfinanceindia.com/",
        "logo": "https://clarify.ai.sltfinanceindia.com/icon.png",
        "sameAs": [
          "https://twitter.com/clarifyai",
          "https://github.com/clarifyai"
        ]
      },
      {
        "@type": "WebSite",
        "name": "Clarify AI",
        "url": "https://clarify.ai.sltfinanceindia.com/",
        "description": "AI-powered interview preparation with live practice coaching, mock sessions, prep lab, and multi-model AI routing."
      }
    ]
  };
  var el = document.createElement("script");
  el.type = "application/ld+json";
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
})();
