(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  let pageCount = 0;
  let syncing = false;

  const picker = new T.PagePicker({
    container: "pageGrid",
    wrapper: "pageGridWrapper",
    mode: "select",
    onChange(p) {
      if (syncing) return;
      syncing = true;
      $("pages").value = T.formatPageRanges(p.getSelected());
      syncing = false;
    },
  });

  $("pages").addEventListener("input", () => {
    if (syncing || !pageCount) return;
    syncing = true;
    try {
      picker.setSelected(T.parsePageRanges($("pages").value, pageCount));
    } catch (_) {
      // Incomplete input while typing; ignore.
    } finally {
      syncing = false;
    }
  });

  $("selectAllBtn").addEventListener("click", () => picker.selectAll(true));
  $("selectNoneBtn").addEventListener("click", () => picker.selectAll(false));

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        pageCount = 0;
        if (!files.length) {
          picker.clear();
          return;
        }
        T.busy("Loading preview…");
        try {
          await picker.load(files[0]);
          pageCount = picker.pageCount;
          handler.setInfo(`${pageCount} page${pageCount === 1 ? "" : "s"}`);
          $("pages").dispatchEvent(new Event("input"));
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Removing pages…",
    reset() {
      $("pages").value = "";
      picker.clear();
      pageCount = 0;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const source = await T.loadPdf(file);
      const total = source.getPageCount();

      const remove = T.parsePageRanges($("pages").value, total);
      if (!remove.length) {
        throw new T.ToolError("Please choose the pages to remove, by clicking them or typing page numbers.");
      }
      if (remove.length >= total) {
        throw new T.ToolError("You cannot remove every page. At least one page must remain.");
      }

      handler.lock();
      picker.lock();

      const removeSet = new Set(remove);
      const keep = [];
      for (let n = 1; n <= total; n++) {
        if (!removeSet.has(n)) keep.push(n - 1);
      }

      const doc = await T.createPdf();
      T.copyMetadata(source, doc);
      const pages = await doc.copyPages(source, keep);
      pages.forEach((page) => doc.addPage(page));

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "pages-removed"), {
        note: `Removed ${remove.length} of ${total} pages; ${keep.length} remain.`,
      });
    },
  });
})();
