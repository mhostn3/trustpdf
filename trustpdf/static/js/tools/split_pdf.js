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
    busyText: "Splitting…",
    reset() {
      $("pages").value = "";
      $("splitEach").checked = false;
      picker.clear();
      pageCount = 0;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const source = await T.loadPdf(file);
      const total = source.getPageCount();

      const wanted = T.parsePageRanges($("pages").value, total);
      if (!wanted.length) {
        throw new T.ToolError("Please choose the pages to extract, by clicking them or typing page numbers.");
      }

      handler.lock();
      picker.lock();

      if ($("splitEach").checked && wanted.length > 1) {
        const zip = new T.Zip();
        for (let i = 0; i < wanted.length; i++) {
          const n = wanted[i];
          T.busy(`Creating page ${n} (${i + 1} of ${wanted.length})…`);
          await T.nextFrame();
          const doc = await T.createPdf();
          T.copyMetadata(source, doc);
          const [page] = await doc.copyPages(source, [n - 1]);
          doc.addPage(page);
          zip.add(T.makeFilename(file.name, `page-${n}`), await doc.save());
          T.idle();
        }
        T.finish(zip.build(), T.makeFilename(file.name, "pages", "zip"), {
          type: "application/zip",
          note: `Created ${wanted.length} separate PDFs, one per page, in a ZIP file.`,
        });
        return;
      }

      const doc = await T.createPdf();
      T.copyMetadata(source, doc);
      const pages = await doc.copyPages(source, wanted.map((n) => n - 1));
      pages.forEach((page) => doc.addPage(page));

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, `pages-${T.formatPageRanges(wanted)}`), {
        note: `Extracted ${wanted.length} of ${total} pages.`,
      });
    },
  });
})();
