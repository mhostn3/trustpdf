(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const FORMATS = {
    n: (n) => `${n}`,
    page: (n) => `Page ${n}`,
    pageOf: (n, total) => `Page ${n} of ${total}`,
    slash: (n, total) => `${n} / ${total}`,
    dash: (n) => `- ${n} -`,
  };

  function updatePreview() {
    const fmt = FORMATS[$("numberFormat").value] || FORMATS.n;
    const start = Math.max(1, parseInt($("startNumber").value, 10) || 1);
    $("formatPreview").textContent = `Example: ${fmt(start, start + 9)}`;
  }
  ["numberFormat", "startNumber"].forEach((id) => $(id).addEventListener("input", updatePreview));
  updatePreview();

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        if (!files.length) return;
        try {
          const doc = await T.loadPdf(files[0]);
          const n = doc.getPageCount();
          handler.setInfo(`${n} page${n === 1 ? "" : "s"}`);
        } catch (_) {
          handler.setInfo("");
        }
      },
    },
    busyText: "Adding page numbers…",
    reset() {
      $("numberPosition").value = "bottom-center";
      $("numberFormat").value = "n";
      $("startNumber").value = "1";
      $("fontSize").value = "11";
      $("pages").value = "";
      updatePreview();
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const doc = await T.loadPdf(file);
      const pages = doc.getPages();
      const total = pages.length;
      const input = $("pages").value.trim();
      const targets = input ? T.parsePageRanges(input, total) : pages.map((_, i) => i + 1);
      if (!targets.length) throw new T.ToolError("Please choose which pages to number, or leave the field empty for all pages.");

      handler.lock();

      const [vertical, horizontal] = $("numberPosition").value.split("-");
      const fmt = FORMATS[$("numberFormat").value] || FORMATS.n;
      const start = Math.max(1, parseInt($("startNumber").value, 10) || 1);
      const size = Number($("fontSize").value) || 11;
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const color = PDFLib.rgb(0.2, 0.2, 0.2);
      // Numbers count the numbered pages only, so "start at 1" on pages 3-10 gives 1..8.
      const lastNumber = start + targets.length - 1;

      targets.forEach((pageNumber, i) => {
        const page = pages[pageNumber - 1];
        const { width, height } = T.visualSize(page);
        const text = fmt(start + i, lastNumber);
        const textWidth = font.widthOfTextAtSize(text, size);
        const margin = Math.max(18, Math.min(width, height) * 0.045);

        let x = (width - textWidth) / 2;
        if (horizontal === "left") x = margin;
        if (horizontal === "right") x = width - margin - textWidth;
        const y = vertical === "top" ? height - margin - size * 0.75 : margin;

        T.drawTextVisual(page, text, { x, y, size, font, color });
      });
      doc.setModificationDate(new Date());

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "numbered"), {
        note: `Numbered ${targets.length} of ${total} page${total === 1 ? "" : "s"} (${fmt(start, lastNumber)} to ${fmt(lastNumber, lastNumber)}).`,
      });
    },
  });
})();
