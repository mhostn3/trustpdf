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

      // pageCount comes from the preview; ask the worker when the preview is not ready yet.
      const buffer = await file.arrayBuffer();
      const total = pageCount || (await T.runInWorker("count", { buffer: buffer.slice(0) })).pages;

      const wanted = T.parsePageRanges($("pages").value, total);
      if (!wanted.length) {
        throw new T.ToolError("Please choose the pages to extract, by clicking them or typing page numbers.");
      }

      handler.lock();
      picker.lock();

      // The copying runs in a worker, so the page stays responsive with big files.
      const each = $("splitEach").checked && wanted.length > 1;
      const { files } = await T.runInWorker("split", { buffer, pages: wanted, each }, {
        transfer: [buffer],
        onProgress: ({ index, total: count }) => T.progress(`Creating page ${wanted[index]} (${index + 1} of ${count})…`),
      });

      if (each) {
        const zip = new T.Zip();
        files.forEach((bytes, i) => zip.add(T.makeFilename(file.name, `page-${wanted[i]}`), bytes));
        T.finish(zip.build(), T.makeFilename(file.name, "pages", "zip"), {
          type: "application/zip",
          note: `Created ${wanted.length} separate PDFs, one per page, in a ZIP file.`,
        });
        return;
      }

      T.finish(files[0], T.makeFilename(file.name, `pages-${T.formatPageRanges(wanted)}`), {
        note: `Extracted ${wanted.length} of ${total} pages.`,
      });
    },
  });
})();
