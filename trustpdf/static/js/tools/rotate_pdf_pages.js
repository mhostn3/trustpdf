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

  picker.setRotation($("rotationAngle").value);
  $("rotationAngle").addEventListener("change", () => picker.setRotation($("rotationAngle").value));

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
    busyText: "Rotating…",
    reset() {
      $("pages").value = "";
      $("rotationAngle").value = "90";
      picker.setRotation(90);
      picker.clear();
      pageCount = 0;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const angle = Number($("rotationAngle").value);
      const doc = await T.loadPdf(file);
      const pages = doc.getPages();
      const total = pages.length;

      const input = $("pages").value.trim();
      const targets = input
        ? T.parsePageRanges(input, total)
        : Array.from({ length: total }, (_, i) => i + 1);

      if (!targets.length) {
        throw new T.ToolError("Please choose the pages to rotate, or leave the field empty to rotate all pages.");
      }

      handler.lock();
      picker.lock();

      for (const n of targets) {
        const page = pages[n - 1];
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((current + angle) % 360));
      }
      doc.setModificationDate(new Date());

      const bytes = await doc.save();
      const all = targets.length === total;
      T.finish(bytes, T.makeFilename(file.name, "rotated"), {
        note: all ? `Rotated all ${total} pages.` : `Rotated ${targets.length} of ${total} pages.`,
      });
    },
  });
})();
