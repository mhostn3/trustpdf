/* TrustPDF first-party analytics: no cookies, no storage, no typed values, no file data.
 * Page views are counted on the server; this script adds
 *   click  - buttons, tabs, downloads and outbound links (data-tp-event names win)
 *   input  - dropdown, checkbox and radio changes ("Label: option"); never typed text
 *   engage - seconds the page was visible
 *   view   - sent once on load: tells the server a real browser ran this script (bots usually don't)
 *
 * Privacy guard: names are taken only from the page as the server sent it. Everything a tool
 * adds later (file lists, page thumbnails, "Remove <file name>" buttons, download links) is
 * ignored unless it carries a fixed data-tp-event name, and clicks made by scripts are ignored.
 * So file names, page contents and anything else from your files can never be sent.
 */
(function () {
  "use strict";
  var URL = "/analytics/e/";

  function send(k, n, v) {
    try {
      var body = JSON.stringify({ k: k, n: n || "", p: location.pathname, v: v });
      if (navigator.sendBeacon && navigator.sendBeacon(URL, new Blob([body], { type: "text/plain" }))) return;
      fetch(URL, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch (e) { /* never break the page */ }
  }
  window.tpTrack = function (name) { send("click", String(name)); };

  function clean(s, max) { return (s || "").replace(/\s+/g, " ").trim().slice(0, max || 60); }

  function labelFor(el) {
    if (el.id) {
      var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return clean(l.textContent);
    }
    var wrap = el.closest("label");
    if (wrap) return clean(wrap.textContent);
    var group = el.closest(".input-group, .form-floating, .form-check, .mb-2, .mb-3, .col, [class*='col-']");
    var gl = group && group.querySelector("label, .form-label, .input-group-text");
    if (gl) return clean(gl.textContent);
    return clean(el.getAttribute("aria-label") || el.name || el.id);
  }

  var CLICKABLE = "[data-tp-event],button,[role=tab],a[download],a.btn,a[href^='http'],input[type=submit],input[type=button]";

  function clickName(el) {
    var named = el.getAttribute("data-tp-event");
    if (named) return named;
    if (el.closest("header, footer, nav.navbar, .navbar")) return "";  // navigation = page views
    if (el.tagName === "A") {
      var href = el.getAttribute("href") || "";
      if (el.hasAttribute("download")) return "Download: " + clean(el.getAttribute("download") || el.textContent);
      if (/^https?:/.test(href) && el.hostname !== location.hostname) return "Outbound: " + el.hostname.replace(/^www\./, "");
      if (!el.classList.contains("btn") && el.getAttribute("role") !== "tab") return "";
    }
    return clean(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.value);
  }

  // Snapshot of the page as served: element -> name, select option -> text, control -> label.
  var clickNames = new WeakMap(), optionTexts = new WeakMap(), inputLabels = new WeakMap();
  function snapshot() {
    document.querySelectorAll(CLICKABLE).forEach(function (el) { clickNames.set(el, clickName(el)); });
    document.querySelectorAll("select option").forEach(function (o) { optionTexts.set(o, clean(o.text, 40)); });
    document.querySelectorAll("select, input[type=checkbox], input[type=radio]").forEach(function (el) {
      inputLabels.set(el, { label: labelFor(el), group: clean(el.name) });
    });
  }
  snapshot();
  send("view");

  document.addEventListener("click", function (e) {
    if (!e.isTrusted) return;  // a script's click (e.g. saving a file), not the visitor's
    var el = e.target.closest && e.target.closest(CLICKABLE);
    if (!el) return;
    var name = el.getAttribute("data-tp-event") || clickNames.get(el);
    if (name) send("click", name);
  }, true);

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!e.isTrusted || !el || !el.tagName || el.closest("header, footer, .navbar")) return;
    var known = inputLabels.get(el);
    if (!known) return;  // added by a tool after load: never reported
    var label = known.label, val;
    if (el.tagName === "SELECT") {
      val = optionTexts.get(el.options[el.selectedIndex]);
      if (!val) return;
    } else if (el.type === "checkbox") val = el.checked ? "on" : "off";
    else if (el.type === "radio") { if (!el.checked) return; val = known.label; label = known.group || label; }
    else return;  // text, number, file and textarea values are never sent
    send("input", (label ? label + ": " : "") + val);
  }, true);

  // Visible time on the page, sent when the page is hidden or closed.
  var visibleSince = document.visibilityState === "visible" ? Date.now() : null, total = 0;
  function flush() {
    if (visibleSince !== null) { total += Date.now() - visibleSince; visibleSince = null; }
    var s = Math.round(total / 1000);
    if (s >= 1) send("engage", "", s);
    total = 0;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
    else visibleSince = Date.now();
  });
  window.addEventListener("pagehide", flush);
})();
