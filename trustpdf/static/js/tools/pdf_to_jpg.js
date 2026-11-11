(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  let pageCount = 0;

  function syncQuality() {
    const png = $("imgFormat").value === "png";
    $("qualityGroup").classList.toggle("d-none", png);
  }
  $("imgFormat").addEventListener("change", syncQuality);
  syncQuality();

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        pageCount = 0;
        if (!files.length) return;
        T.busy("Reading PDF…");
        try {
          const pdf = await T.openWithPdfjs(files[0]);
          pageCount = pdf.numPages;
          await pdf.release();
          handler.setInfo(`${pageCount} page${pageCount === 1 ? "" : "s"}`);
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Converting…",
    reset() {
      $("imgFormat").value = $("imgFormat").dataset.default || "jpg";
      $("imgDpi").value = "150";
      $("imgQuality").value = "0.9";
      $("pages").value = "";
      syncQuality();
      pageCount = 0;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const pdf = await T.openWithPdfjs(file);
      try {
        const total = pdf.numPages;
        const input = $("pages").value.trim();
        const targets = input ? T.parsePageRanges(input, total) : Array.from({ length: total }, (_, i) => i + 1);
        if (!targets.length) throw new T.ToolError("Please choose the pages to convert, or leave the field empty for all pages.");

        handler.lock();

        const png = $("imgFormat").value === "png";
        const ext = png ? "png" : "jpg";
        const type = png ? "image/png" : "image/jpeg";
        const dpi = Number($("imgDpi").value) || 150;
        const quality = Number($("imgQuality").value) || 0.9;

        const images = [];
        for (let i = 0; i < targets.length; i++) {
          const n = targets[i];
          T.busy(`Rendering page ${n} (${i + 1} of ${targets.length})…`);
          await T.nextFrame();
          try {
            const { canvas } = await T.renderPage(pdf, n, dpi);
            images.push({ name: T.makeFilename(file.name, `page-${n}`, ext), bytes: await T.canvasToBytes(canvas, type, quality) });
            canvas.width = canvas.height = 0; // free the memory right away
          } finally {
            T.idle();
          }
        }

        if (images.length === 1) {
          T.finish(images[0].bytes, images[0].name, { type, note: `Converted page ${targets[0]} to ${ext.toUpperCase()} at ${dpi} DPI.` });
          return;
        }
        const zip = new T.Zip();
        images.forEach((img) => zip.add(img.name, img.bytes));
        T.finish(zip.build(), T.makeFilename(file.name, ext === "png" ? "png-images" : "jpg-images", "zip"), {
          type: "application/zip",
          note: `Converted ${images.length} pages to ${ext.toUpperCase()} images at ${dpi} DPI, packed in a ZIP file.`,
        });
      } finally {
        pdf.release();
      }
    },
  });
})();
