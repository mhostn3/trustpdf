(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const cfg = document.getElementById("ocrConfig").dataset;
  const OCR_DPI = 200;

  // One worker per language combination; kept for the session so a second
  // file does not download the language data again.
  let worker = null;
  let workerLangs = "";

  function simdSupported() {
    // A tiny wasm module that uses a SIMD instruction; validate() says if the engine accepts it.
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (_) {
      return false;
    }
  }

  async function getWorker(langs) {
    if (worker && workerLangs === langs) return worker;
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    const corePath = `${cfg.corePath}/${simdSupported() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js"}`;
    worker = await Tesseract.createWorker(langs, 1, {
      workerPath: cfg.workerPath,
      corePath,
      langPath: cfg.langPath,
      workerBlobURL: false,
      cacheMethod: "none",
      logger: (m) => {
        if (m.status === "loading tesseract core") T.busy("Loading the OCR engine (4 MB, once)…");
        else if (m.status === "loading language traineddata") T.busy("Loading language data…");
        else if (m.status === "recognizing text" && typeof m.progress === "number") T.busy(`Recognizing text… ${Math.round(m.progress * 100)}%`);
        if (m.status !== "recognizing text") return;
      },
    });
    await worker.setParameters({ user_defined_dpi: String(OCR_DPI) });
    workerLangs = langs;
    return worker;
  }

  $("copyTextBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("textPreview").value);
      T.messages.success("Text copied to the clipboard.");
    } catch (_) {
      $("textPreview").select();
      T.messages.info("Press Ctrl+C (or ⌘C) to copy the selected text.");
    }
  });

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        if (!files.length) return;
        T.busy("Reading PDF…");
        try {
          const pdf = await T.openWithPdfjs(files[0]);
          const n = pdf.numPages;
          // A quick look at the first page tells whether it already has text.
          const page = await pdf.getPage(1);
          const content = await page.getTextContent();
          const chars = content.items.reduce((acc, i) => acc + (i.str || "").length, 0);
          page.cleanup();
          pdf.release();
          handler.setInfo(`${n} page${n === 1 ? "" : "s"}${chars > 20 ? " · the first page already contains selectable text; OCR is mainly for scans" : " · no text found on the first page, so OCR will help"}`);
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Starting OCR…",
    reset() {
      $("pages").value = "";
      $("ocrLang").value = "eng";
      $("ocrLang2").value = "";
      $("ocrOutput").value = "pdf";
      $("textPreview").value = "";
      $("textResult").classList.add("d-none");
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");
      if (typeof Tesseract === "undefined") throw new T.ToolError("The OCR library did not load. Please refresh the page.");

      const lang1 = $("ocrLang").value;
      const lang2 = $("ocrLang2").value;
      const langs = lang2 && lang2 !== lang1 ? `${lang1}+${lang2}` : lang1;
      const wantPdf = $("ocrOutput").value === "pdf";

      const source = await T.loadPdf(file);
      const pdf = await T.openWithPdfjs(file);
      try {
        const total = pdf.numPages;
        const input = $("pages").value.trim();
        const targets = input ? T.parsePageRanges(input, total) : Array.from({ length: total }, (_, i) => i + 1);
        if (!targets.length) throw new T.ToolError("Please choose the pages to recognize, or leave the field empty for all pages.");

        handler.lock();
        const w = await getWorker(langs);
        const texts = [];
        let chars = 0;

        for (let i = 0; i < targets.length; i++) {
          const n = targets[i];
          T.busy(`Page ${n} (${i + 1} of ${targets.length}): rendering…`);
          await T.nextFrame();
          try {
            const { canvas } = await T.renderPage(pdf, n, OCR_DPI);
            T.busy(`Page ${n} (${i + 1} of ${targets.length}): recognizing text…`);
            await T.nextFrame();
            const { data } = await w.recognize(canvas, { pdfTitle: "", pdfTextOnly: true }, { text: true, pdf: wantPdf });
            canvas.width = canvas.height = 0;
            const text = (data.text || "").trim();
            chars += text.length;
            texts.push({ n, text });

            if (wantPdf && data.pdf) {
              // Tesseract gives a PDF page with invisible text at the image's
              // position; lay it over the original page, scaled to fit.
              const textLayer = await PDFLib.PDFDocument.load(Uint8Array.from(data.pdf));
              const [embedded] = await source.embedPdf(textLayer, [0]);
              const page = source.getPage(n - 1);
              const size = T.visualSize(page);
              T.drawPageVisual(page, embedded, { x: 0, y: 0, width: size.width, height: size.height });
            }
          } finally {
            T.idle();
          }
        }

        if (!chars) {
          throw new T.ToolError("No text was recognized. Check that the pages contain readable text and that the right language is selected.");
        }

        const preview = texts.map(({ n, text }) => `--- Page ${n} ---\n${text}`).join("\n\n") + "\n";
        $("textPreview").value = preview;
        $("textResult").classList.remove("d-none");

        if (wantPdf) {
          source.setModificationDate(new Date());
          const bytes = await source.save();
          T.finish(bytes, T.makeFilename(file.name, "searchable"), {
            note: `Recognized ${chars.toLocaleString()} characters on ${targets.length} page${targets.length === 1 ? "" : "s"}. The pages look the same, but the text can now be selected and searched.`,
          });
        } else {
          T.finish(new Blob([preview], { type: "text/plain;charset=utf-8" }), T.makeFilename(file.name, "ocr", "txt"), {
            type: "text/plain",
            note: `Recognized ${chars.toLocaleString()} characters on ${targets.length} page${targets.length === 1 ? "" : "s"}.`,
          });
        }
      } finally {
        pdf.release();
      }
    },
  });
})();
