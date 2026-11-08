(function () {
  "use strict";
  const T = window.TrustPDF;

  const handler = T.initTool({
    files: { multiple: true, sortable: true, accept: "pdf", fileListId: "fileList", totalSizeId: "totalSize" },
    busyText: "Merging…",

    async process() {
      const files = handler.getFiles();

      if (!files.length) {
        throw new T.ToolError("Please add at least one PDF file to merge.");
      }
      if (files.length === 1) {
        T.messages.info("Only one file selected. Add more files to merge them, or save this one as is.");
      }

      handler.lock();
      const merged = await T.createPdf();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        T.busy(`Merging file ${i + 1} of ${files.length}: ${file.name}`);
        await T.nextFrame();
        try {
          const source = await T.loadPdf(file);
          const pages = await merged.copyPages(source, source.getPageIndices());
          pages.forEach((page) => merged.addPage(page));
          if (i === 0) T.copyMetadata(source, merged);
        } catch (error) {
          throw new T.ToolError(`${file.name}: ${T.friendlyMessage(error)}`);
        } finally {
          T.idle();
        }
      }

      const bytes = await merged.save();
      T.finish(bytes, T.makeFilename(files[0].name, "merged"), {
        note: `Merged ${files.length} file${files.length === 1 ? "" : "s"} into ${merged.getPageCount()} pages.`,
      });
    },
  });
})();
