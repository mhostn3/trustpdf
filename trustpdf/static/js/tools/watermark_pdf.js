(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const COLORS = {
    gray: [0.45, 0.45, 0.45],
    red: [0.8, 0.1, 0.1],
    blue: [0.15, 0.3, 0.8],
    black: [0, 0, 0],
  };

  function syncOpacityLabel() {
    $("opacityValue").textContent = `${$("wmOpacity").value}%`;
  }
  $("wmOpacity").addEventListener("input", syncOpacityLabel);
  syncOpacityLabel();

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
    busyText: "Adding watermark…",
    reset() {
      $("wmText").value = "CONFIDENTIAL";
      $("wmLayout").value = "diagonal";
      $("wmSize").value = "auto";
      $("wmColor").value = "gray";
      $("wmOpacity").value = "25";
      $("pages").value = "";
      syncOpacityLabel();
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");
      const text = $("wmText").value.replace(/\s+/g, " ").trim();
      if (!text) throw new T.ToolError("Please type the watermark text.");
      if (text.length > 100) throw new T.ToolError("Please keep the watermark under 100 characters.");

      const doc = await T.loadPdf(file);
      const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      T.assertEncodable(font, text);

      const pages = doc.getPages();
      const total = pages.length;
      const input = $("pages").value.trim();
      const targets = input ? T.parsePageRanges(input, total) : pages.map((_, i) => i + 1);
      if (!targets.length) throw new T.ToolError("Please choose which pages to watermark, or leave the field empty for all pages.");

      handler.lock();

      const layout = $("wmLayout").value;
      const [r, g, b] = COLORS[$("wmColor").value] || COLORS.gray;
      const opacity = Math.min(1, Math.max(0.05, Number($("wmOpacity").value) / 100));
      const sizeChoice = $("wmSize").value;

      for (const n of targets) {
        const page = pages[n - 1];
        const { width, height } = T.visualSize(page);
        const angle = layout === "diagonal" ? (Math.atan2(height, width) * 180) / Math.PI : 0;
        const rad = (angle * Math.PI) / 180;

        // "auto" fills about 70% of the line the text runs along.
        const span = layout === "diagonal" ? Math.hypot(width, height) : width;
        const widthAt1 = font.widthOfTextAtSize(text, 1);
        let size = sizeChoice === "auto" ? (span * 0.7) / widthAt1 : Number(sizeChoice);
        size = Math.max(8, Math.min(size, 200));

        const textWidth = widthAt1 * size;
        const capHeight = font.heightAtSize(size, { descender: false }) * 0.7;
        let cx = width / 2;
        let cy = height / 2;
        if (layout === "top") cy = height - Math.max(30, height * 0.06) - capHeight / 2;
        if (layout === "bottom") cy = Math.max(30, height * 0.06) + capHeight / 2;

        // Move from the centre to the start of the baseline along the text direction.
        const x = cx - Math.cos(rad) * (textWidth / 2) + Math.sin(rad) * (capHeight / 2);
        const y = cy - Math.sin(rad) * (textWidth / 2) - Math.cos(rad) * (capHeight / 2);

        T.drawTextVisual(page, text, { x, y, angle, size, font, color: PDFLib.rgb(r, g, b), opacity });
      }
      doc.setModificationDate(new Date());

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "watermarked"), {
        note: `Added “${text}” to ${targets.length} of ${total} page${total === 1 ? "" : "s"}.`,
      });
    },
  });
})();
