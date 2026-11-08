(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const picker = new T.PagePicker({
    container: "pageGrid",
    wrapper: "pageGridWrapper",
    mode: "sort",
  });

  function reorderItems(sorter) {
    const items = Array.from($("pageGrid").querySelectorAll("li"));
    $("pageGrid").replaceChildren(...sorter(items));
  }

  $("reverseBtn").addEventListener("click", () => reorderItems((items) => items.reverse()));
  $("resetOrderBtn").addEventListener("click", () =>
    reorderItems((items) => items.sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex))));

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        $("reorderActions").classList.add("d-none");
        if (!files.length) {
          picker.clear();
          return;
        }
        T.busy("Loading preview…");
        try {
          await picker.load(files[0]);
          handler.setInfo(`${picker.pageCount} page${picker.pageCount === 1 ? "" : "s"}`);
          $("reorderActions").classList.toggle("d-none", picker.pageCount < 2);
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Reordering…",
    reset() {
      picker.clear();
      $("reorderActions").classList.add("d-none");
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const order = picker.getOrder();
      if (!order.length) throw new T.ToolError("Please wait until the page previews have loaded.");

      handler.lock();
      picker.lock();

      const source = await T.loadPdf(file);
      const doc = await T.createPdf();
      T.copyMetadata(source, doc);
      const pages = await doc.copyPages(source, order);
      pages.forEach((page) => doc.addPage(page));

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "reordered"), {
        note: `Saved ${order.length} pages in the new order.`,
      });
    },
  });
})();
