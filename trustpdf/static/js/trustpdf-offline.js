/* Registers the service worker (/sw.js) that lets TrustPDF work offline.
   It caches the site's own public files only; see the comments in sw.js. */
(function () {
  "use strict";
  const script = document.currentScript;
  if (!("serviceWorker" in navigator) || !script || !script.dataset.sw) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(script.dataset.sw, { scope: "/" }).catch(() => { /* the site works without it */ });
  });
})();
