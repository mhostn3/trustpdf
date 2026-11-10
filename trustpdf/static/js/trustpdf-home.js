/* Home page: filter the tool cards as the visitor types. Nothing typed here is sent anywhere. */
(function () {
  "use strict";
  const input = document.getElementById("toolSearch");
  if (!input) return;
  const cards = Array.from(document.querySelectorAll("[data-tool-search]"));
  const sections = Array.from(document.querySelectorAll(".tool-group-section"));
  const empty = document.getElementById("toolSearchEmpty");
  const status = document.getElementById("toolSearchStatus");
  const nav = document.querySelector(".group-nav");
  const texts = new Map(cards.map((card) => [card, card.dataset.toolSearch.toLowerCase()]));

  function filter() {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const match = words.every((word) => texts.get(card).includes(word));
      card.classList.toggle("d-none", !match);
      if (match) shown += 1;
    }
    for (const section of sections) {
      section.classList.toggle("d-none", !section.querySelector("[data-tool-search]:not(.d-none)"));
    }
    if (nav) nav.classList.toggle("d-none", words.length > 0);
    empty.classList.toggle("d-none", shown > 0);
    status.textContent = words.length ? `${shown} tool${shown === 1 ? "" : "s"} found` : "";
  }

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (event) => {
    // Enter opens the first match, so "mer" + Enter goes straight to Merge PDF.
    if (event.key !== "Enter") return;
    const first = document.querySelector("[data-tool-search]:not(.d-none) a");
    if (first && input.value.trim()) window.location.href = first.href;
  });
  filter(); // the browser may restore a previous value on back navigation
})();
