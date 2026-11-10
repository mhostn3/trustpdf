(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const LEVELS = {
    // Rebuild the file structure only: nothing visible changes.
    lossless: null,
    // Pages become JPEG images. Text is no longer selectable.
    strong: { dpi: 150, quality: 0.65 },
    extreme: { dpi: 100, quality: 0.45 },
  };

  function describeLevel() {
    const level = $("compressLevel").value;
    $("levelHelp").textContent = level === "lossless"
      ? "Rewrites the PDF structure more compactly. Text, links and quality stay exactly the same. Savings depend on how the file was made."
      : "Turns every page into a compressed image. Best for scans and photo-heavy PDFs. Text will no longer be selectable or searchable, and links and form fields are dropped.";
  }
  $("compressLevel").addEventListener("change", describeLevel);
  describeLevel();

  /** Runs in a worker, so the page stays responsive with big files. */
  async function lossless(file) {
    const buffer = await file.arrayBuffer();
    return (await T.runInWorker("compress", { buffer }, { transfer: [buffer] })).bytes;
  }

  async function rasterize(file, { dpi, quality }) {
    const pdf = await T.openWithPdfjs(file);
    try {
      const out = await T.createPdf();
      // Title, author, subject and keywords come from PDF.js, which has the file
      // open anyway; parsing it a second time with pdf-lib would double the memory.
      const { info = {} } = await pdf.getMetadata().catch(() => ({}));
      if (info.Title) out.setTitle(info.Title);
      if (info.Author) out.setAuthor(info.Author);
      if (info.Subject) out.setSubject(info.Subject);
      if (info.Keywords) out.setKeywords(String(info.Keywords).split(/[,;]\s*/).filter(Boolean));
      for (let n = 1; n <= pdf.numPages; n++) {
        T.busy(`Compressing page ${n} of ${pdf.numPages}…`);
        await T.nextFrame();
        try {
          const { canvas, width, height } = await T.renderPage(pdf, n, dpi);
          const jpg = await out.embedJpg(await T.canvasToBytes(canvas, "image/jpeg", quality));
          canvas.width = canvas.height = 0;
          const page = out.addPage([width, height]);
          page.drawImage(jpg, { x: 0, y: 0, width, height });
        } finally {
          T.idle();
        }
      }
      return out.save({ useObjectStreams: true });
    } finally {
      pdf.release();
    }
  }

  const handler = T.initTool({
    files: { multiple: false, accept: "pdf" },
    busyText: "Compressing…",
    reset() {
      $("compressLevel").value = "lossless";
      describeLevel();
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const level = $("compressLevel").value;
      const settings = LEVELS[level];
      const bytes = settings ? await rasterize(file, settings) : await lossless(file);

      const before = file.size;
      const after = bytes.length;
      if (after >= before * 0.98) {
        T.messages.warn(
          `This PDF is already well compressed (${T.formatSize(before)}); the ${level} setting would not make it smaller.` +
          (level === "lossless" ? " Try “Strong” if the file is mostly scans or photos." : " Your original file is the best version to keep.")
        );
        return;
      }

      handler.lock();
      const saved = Math.round((1 - after / before) * 100);
      T.finish(bytes, T.makeFilename(file.name, "compressed"), {
        note: `Reduced from ${T.formatSize(before)} to ${T.formatSize(after)} (${saved}% smaller).`,
      });
    },
  });
})();
