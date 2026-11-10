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
      // The merge itself runs in a worker, so the page stays responsive with big files.
      const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
      let result;
      try {
        result = await T.runInWorker("merge", { buffers }, {
          transfer: buffers,
          onProgress: ({ index, total }) => T.progress(`Merging file ${index + 1} of ${total}: ${files[index].name}`),
        });
      } catch (error) {
        if (error.index === undefined) throw error;
        throw new T.ToolError(`${files[error.index].name}: ${T.friendlyMessage(error)}`);
      }

      T.finish(result.bytes, T.makeFilename(files[0].name, "merged"), {
        note: `Merged ${files.length} file${files.length === 1 ? "" : "s"} into ${result.pages} pages.`,
      });
    },
  });
})();
