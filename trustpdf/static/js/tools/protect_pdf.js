(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  $("showPasswords").addEventListener("change", () => {
    const type = $("showPasswords").checked ? "text" : "password";
    ["userPassword", "userPassword2", "ownerPassword"].forEach((id) => { $(id).type = type; });
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
          handler.setInfo(`${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`);
          pdf.release();
        } catch (error) {
          if (/password-protected/.test(error.message)) {
            throw new T.ToolError("This PDF already has a password. Use Unlock PDF first if you want to change it.");
          }
          throw error;
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Encrypting…",
    reset() {
      ["userPassword", "userPassword2", "ownerPassword"].forEach((id) => { $(id).value = ""; });
      $("allowPrint").checked = true;
      $("allowCopy").checked = true;
      $("allowModify").checked = false;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");
      const user = $("userPassword").value;
      const user2 = $("userPassword2").value;
      let owner = $("ownerPassword").value;
      if (!user) throw new T.ToolError("Please type the password that will be needed to open the PDF.");
      if (user !== user2) throw new T.ToolError("The two passwords do not match.");
      if (user.length < 4) throw new T.ToolError("Please use at least 4 characters.");
      if (!owner) {
        // With the same password for both, anyone who can open the file would have
        // owner rights and the restrictions below would do nothing. Use a random one.
        const random = crypto.getRandomValues(new Uint8Array(32));
        owner = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("");
      }

      handler.lock();
      const args = [
        "--encrypt", `--user-password=${user}`, `--owner-password=${owner}`, "--bits=256",
        `--print=${$("allowPrint").checked ? "full" : "none"}`,
        `--modify=${$("allowModify").checked ? "all" : "none"}`,
        `--extract=${$("allowCopy").checked ? "y" : "n"}`,
        "--", "/in.pdf", "/out.pdf",
      ];
      const bytes = await T.runQpdf(new Uint8Array(await file.arrayBuffer()), args);
      T.finish(bytes, T.makeFilename(file.name, "protected"), {
        note: "The PDF is now encrypted with AES-256. Keep the password safe: it cannot be recovered.",
      });
    },
  });
})();
