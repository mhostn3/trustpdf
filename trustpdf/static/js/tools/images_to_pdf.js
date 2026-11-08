(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const MM = 72 / 25.4;
  const SIZES = {
    a4: [210 * MM, 297 * MM],
    letter: [8.5 * 72, 11 * 72],
  };

  function isPng(file) {
    return file.type === "image/png" || /\.png$/i.test(file.name);
  }

  async function embed(doc, file) {
    const bytes = await file.arrayBuffer();
    try {
      return isPng(file) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch (error) {
      // Extension and content may disagree; try the other decoder before giving up.
      try {
        return isPng(file) ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      } catch (_) {
        throw new T.ToolError(`${file.name} could not be read as a JPG or PNG image.`);
      }
    }
  }

  const handler = T.initTool({
    files: { multiple: true, sortable: true, accept: "image", fileListId: "fileList", totalSizeId: "totalSize" },
    busyText: "Creating PDF…",
    reset() {
      $("pageSize").value = "image";
      $("pageMargin").value = "0";
    },

    async process() {
      const files = handler.getFiles();
      if (!files.length) throw new T.ToolError("Please add at least one JPG or PNG image.");

      handler.lock();

      const sizeMode = $("pageSize").value;
      const margin = Number($("pageMargin").value) * MM;
      const doc = await T.createPdf();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        T.busy(`Adding image ${i + 1} of ${files.length}: ${file.name}`);
        await T.nextFrame();
        try {
          const image = await embed(doc, file);

          if (sizeMode === "image") {
            const page = doc.addPage([image.width + 2 * margin, image.height + 2 * margin]);
            page.drawImage(image, { x: margin, y: margin, width: image.width, height: image.height });
          } else {
            let [w, h] = SIZES[sizeMode];
            if (image.width > image.height && w < h) [w, h] = [h, w];
            const page = doc.addPage([w, h]);
            const scale = Math.min((w - 2 * margin) / image.width, (h - 2 * margin) / image.height);
            const dw = image.width * scale;
            const dh = image.height * scale;
            page.drawImage(image, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
          }
        } finally {
          T.idle();
        }
      }

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(files.length === 1 ? files[0].name : "images", files.length === 1 ? "" : `${files.length}-images`), {
        note: `Created a PDF with ${files.length} page${files.length === 1 ? "" : "s"}.`,
      });
    },
  });
})();
