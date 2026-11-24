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

      // The pages are moved inside the file itself, not copied into a new one, so
      // bookmarks, links between pages, form fields and metadata all stay as they are.
      const doc = await T.loadPdf(file);
      const pages = doc.getPages();
      if (order.length !== pages.length || order.some((i) => !pages[i])) {
        throw new T.ToolError("The preview does not match this PDF. Please select the file again.");
      }
      const N = (name) => PDFLib.PDFName.of(name);
      // A page may take its size, rotation and resources from its place in the page
      // tree; write them on the page before the tree is rebuilt.
      for (const page of pages) {
        for (const key of ["Resources", "MediaBox", "CropBox", "Rotate"]) {
          const value = page.node.getInheritableAttribute(N(key));
          if (value && !page.node.has(N(key))) page.node.set(N(key), value);
        }
      }
      // One flat page tree in the new order; the old inner nodes are no longer needed.
      const rootRef = doc.catalog.get(N("Pages"));
      const root = doc.catalog.Pages();
      for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFLib.PDFPageTree && obj !== root) doc.context.delete(ref);
      }
      root.set(N("Kids"), doc.context.obj(order.map((i) => pages[i].ref)));
      root.set(N("Count"), PDFLib.PDFNumber.of(order.length));
      pages.forEach((page) => page.node.set(N("Parent"), rootRef));
      doc.setModificationDate(new Date());

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "reordered"), {
        note: `Saved ${order.length} pages in the new order.`,
      });
    },
  });
})();
