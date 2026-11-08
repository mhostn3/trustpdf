/*
  Follow the operating system's light/dark preference using Bootstrap's
  data-bs-theme attribute. Nothing is stored: no cookies, no localStorage.
*/
(function () {
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function apply() {
    document.documentElement.setAttribute("data-bs-theme", media.matches ? "dark" : "light");
  }

  apply();

  if (media.addEventListener) {
    media.addEventListener("change", apply);
  }
})();
