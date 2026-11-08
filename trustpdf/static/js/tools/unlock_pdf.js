(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  let needsPassword = null; // null = unknown, true/false after reading the file

  $("showPassword").addEventListener("change", () => {
    $("pdfPassword").type = $("showPassword").checked ? "text" : "password";
  });

  async function inspect(file) {
    const pdfjsLib = await T.loadPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjsLib.getDocument({ data, isEvalSupported: false, password: "" });
    try {
      const pdf = await task.promise;
      const perms = await pdf.getPermissions();
      return { needsPassword: false, restricted: Array.isArray(perms), pages: pdf.numPages };
    } catch (error) {
      if (error && error.name === "PasswordException") return { needsPassword: true };
      if (error && error.name === "InvalidPDFException") throw new T.ToolError("This file could not be read as a PDF.");
      throw error;
    } finally {
      task.destroy();
    }
  }

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        needsPassword = null;
        if (!files.length) return;
        T.busy("Checking the PDF…");
        try {
          const info = await inspect(files[0]);
          needsPassword = info.needsPassword;
          if (info.needsPassword) {
            handler.setInfo("This PDF needs a password to open. Type it below.");
            $("pdfPassword").focus();
          } else if (info.restricted) {
            handler.setInfo(`${info.pages} page${info.pages === 1 ? "" : "s"} · opens without a password, but has restrictions (printing, copying or editing). Unlock removes them.`);
          } else {
            handler.setInfo(`${info.pages} page${info.pages === 1 ? "" : "s"} · this PDF is not password-protected or restricted.`);
          }
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Removing the password…",
    reset() {
      $("pdfPassword").value = "";
      needsPassword = null;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");
      const password = $("pdfPassword").value;
      if (needsPassword && !password) throw new T.ToolError("Please type the password of this PDF.");

      if (needsPassword) {
        // Check the password with PDF.js first: a clear message beats qpdf's.
        const pdfjsLib = await T.loadPdfjs();
        const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, password });
        try {
          await task.promise;
        } catch (error) {
          if (error && error.name === "PasswordException") throw new T.ToolError("Wrong password. Please check it and try again.");
          throw error;
        } finally {
          task.destroy();
        }
      }

      handler.lock();
      const args = [];
      if (password) args.push(`--password=${password}`);
      args.push("--decrypt", "/in.pdf", "/out.pdf");
      const bytes = await T.runQpdf(new Uint8Array(await file.arrayBuffer()), args);
      T.finish(bytes, T.makeFilename(file.name, "unlocked"), {
        note: "Password and restrictions removed. The PDF now opens without a password.",
      });
    },
  });
})();
