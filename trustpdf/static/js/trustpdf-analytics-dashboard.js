/* Analytics dashboard (staff only): daily charts and auto-submitting period filters. */
(function () {
  "use strict";
  document.querySelectorAll("[data-autosubmit]").forEach(function (el) {
    el.addEventListener("change", function () { el.form.submit(); });
  });

  const data = document.getElementById("an-daily");
  if (!data || !window.Plotly) return;
  const rows = JSON.parse(data.textContent);
  const x = rows.map(r => r.day);
  const css = getComputedStyle(document.body);
  const ink = css.getPropertyValue("--bs-secondary-color").trim() || "#6c757d";
  const grid = css.getPropertyValue("--bs-border-color").trim() || "#dee2e6";
  function bars(id, y, label) {
    Plotly.newPlot(id, [{
      type: "bar", x, y, name: label, marker: { color: "#0d6efd" },
      hovertemplate: "%{x|%a %d %b}<br>" + label + ": %{y}<extra></extra>",
    }], {
      margin: { l: 36, r: 8, t: 4, b: 28 }, bargap: 0.25,
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { size: 11, color: ink },
      xaxis: { type: "date", showgrid: false, tickformat: "%d %b" },
      yaxis: { gridcolor: grid, rangemode: "tozero", fixedrange: true, tickformat: "d", dtick: Math.max(...y, 0) <= 5 ? 1 : null },
    }, { displayModeBar: false, responsive: true });
  }
  bars("ch-visitors", rows.map(r => r.visitors), "Visitors");
  bars("ch-actions", rows.map(r => r.actions), "Clicks");
})();
