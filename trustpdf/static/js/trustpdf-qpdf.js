/*
  qpdf (compiled to WebAssembly) for the password tools. Loaded on demand,
  from this origin, the first time a tool needs it. Exposes TrustPDF.qpdf().

  The <script> tag that includes this file carries data-qpdf-js and
  data-qpdf-wasm with the URLs of the two qpdf files.
*/
(function () {
  "use strict";
  const T = window.TrustPDF;
  const script = document.currentScript;
  const QPDF_JS = script && script.dataset.qpdfJs;
  const QPDF_WASM = script && script.dataset.qpdfWasm;

  let modulePromise = null;
  let stderr = [];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new T.ToolError("The PDF encryption library could not be loaded. Please check your connection and refresh the page."));
      document.head.appendChild(el);
    });
  }

  async function qpdf() {
    if (!modulePromise) {
      modulePromise = (async () => {
        T.busy("Loading the encryption library (1.3 MB)…");
        try {
          await loadScript(QPDF_JS);
          const factory = window.Module; // defined by qpdf.js
          const instance = await factory({
            noInitialRun: true,
            locateFile: () => QPDF_WASM,
            print: () => {},
            printErr: (line) => stderr.push(String(line)),
          });
          return instance;
        } finally {
          T.idle();
        }
      })().catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }

  /**
   * Run qpdf on `bytes` with the given arguments; "/in.pdf" and "/out.pdf"
   * are substituted with the virtual file names. Returns the output bytes.
   * Throws ToolError with qpdf's message on failure.
   */
  async function runQpdf(bytes, args) {
    const q = await qpdf();
    stderr = [];
    q.FS.writeFile("/in.pdf", bytes);
    let code;
    // This qpdf build writes its messages straight to console.error rather
    // than through printErr, so capture them there for the duration of the call.
    const consoleError = console.error;
    console.error = (...parts) => stderr.push(parts.map(String).join(" "));
    try {
      code = q.callMain(args);
    } catch (error) {
      code = typeof error === "number" ? error : 2;
    } finally {
      console.error = consoleError;
    }
    const message = stderr.join("\n").replace(/^[^:\n]*: (\/in\.pdf: )?/gm, "").trim();
    try { q.FS.unlink("/in.pdf"); } catch (_) { /* ignore */ }

    if (code !== 0 && code !== 3) { // 3 = finished with warnings
      try { q.FS.unlink("/out.pdf"); } catch (_) { /* ignore */ }
      if (/invalid password/i.test(message)) throw new T.ToolError("Wrong password. Please check it and try again.");
      throw new T.ToolError(message ? `qpdf: ${message}` : "The PDF could not be processed. It may be damaged.");
    }
    const out = q.FS.readFile("/out.pdf");
    q.FS.unlink("/out.pdf");
    return out;
  }

  T.qpdf = qpdf;
  T.runQpdf = runQpdf;
})();
