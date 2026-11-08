(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  /** Join PDF.js text items into lines, keeping the reading order PDF.js gives. */
  function pageText(content) {
    let out = "";
    let lastY = null;
    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
      out += item.str;
      if (item.hasEOL) out += "\n";
      lastY = y;
    }
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  $("copyTextBtn").addEventListener("click", async () => {
    const text = $("textPreview").value;
    try {
      await navigator.clipboard.writeText(text);
      T.messages.success("Text copied to the clipboard.");
    } catch (_) {
      $("textPreview").select();
      T.messages.info("Press Ctrl+C (or ⌘C) to copy the selected text.");
    }
  });

  const handler = T.initTool({
    files: { multiple: false, accept: "pdf" },
    busyText: "Extracting text…",
    reset() {
      $("pages").value = "";
      $("pageMarkers").checked = true;
      $("textPreview").value = "";
      $("textResult").classList.add("d-none");
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const pdf = await T.openWithPdfjs(file);
      try {
        const total = pdf.numPages;
        const input = $("pages").value.trim();
        const targets = input ? T.parsePageRanges(input, total) : Array.from({ length: total }, (_, i) => i + 1);
        if (!targets.length) throw new T.ToolError("Please choose the pages to read, or leave the field empty for all pages.");

        handler.lock();
        const markers = $("pageMarkers").checked;
        const parts = [];
        let chars = 0;
        for (let i = 0; i < targets.length; i++) {
          const n = targets[i];
          if (i % 10 === 0) {
            T.busy(`Reading page ${n} (${i + 1} of ${targets.length})…`);
            await T.nextFrame();
            T.idle();
          }
          const page = await pdf.getPage(n);
          const text = pageText(await page.getTextContent());
          page.cleanup();
          chars += text.length;
          parts.push(markers ? `--- Page ${n} ---\n${text}` : text);
        }

        if (!chars) {
          throw new T.ToolError("No text was found. This PDF is probably a scan (pictures of pages), which needs OCR to turn into text.");
        }

        const output = parts.join("\n\n") + "\n";
        $("textPreview").value = output;
        $("textResult").classList.remove("d-none");
        T.finish(new Blob([output], { type: "text/plain;charset=utf-8" }), T.makeFilename(file.name, "", "txt"), {
          type: "text/plain",
          note: `Extracted ${chars.toLocaleString()} characters from ${targets.length} page${targets.length === 1 ? "" : "s"}.`,
        });
      } finally {
        pdf.release();
      }
    },
  });
})();
