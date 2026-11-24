(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const FIELDS = ["pdfTitle", "pdfAuthor", "pdfSubject", "pdfKeywords", "pdfCreator", "pdfProducer"];

  function clearFields() {
    FIELDS.forEach((id) => { $(id).value = ""; });
  }

  $("clearAllBtn").addEventListener("click", () => {
    clearFields();
    $("stripXmp").checked = true;
    $("keepDates").checked = false;
    T.messages.info("All fields cleared. Click “Update Metadata” to save a PDF with no metadata.");
  });

  async function fillExistingMetadata(file) {
    const doc = await T.loadPdf(file);
    $("pdfTitle").value = doc.getTitle() || "";
    $("pdfAuthor").value = doc.getAuthor() || "";
    $("pdfSubject").value = doc.getSubject() || "";
    $("pdfKeywords").value = doc.getKeywords() || "";
    $("pdfCreator").value = doc.getCreator() || "";
    $("pdfProducer").value = doc.getProducer() || "";

    const pages = doc.getPageCount();
    const xmp = doc.catalog.has(PDFLib.PDFName.of("Metadata"));
    const others = otherInfoKeys(doc);
    handler.setInfo(`${pages} page${pages === 1 ? "" : "s"} · XMP metadata stream: ${xmp ? "present" : "none"}` +
      (others.length ? ` · ${others.length} other entr${others.length === 1 ? "y" : "ies"} (${others.slice(0, 4).join(", ")}${others.length > 4 ? "…" : ""}), removed with “Clear all fields”` : ""));
  }

  const N = (name) => PDFLib.PDFName.of(name);
  // Info entries with a field on this page, the two dates, and /Trapped (a print setting, not about the author).
  const KNOWN_INFO = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"];

  /** Names of the other entries of the Info dictionary, e.g. Company or Manager from Word. */
  function otherInfoKeys(doc) {
    return doc.getInfoDict().entries().map(([key]) => key.decodeText()).filter((name) => !KNOWN_INFO.includes(name));
  }

  /**
   * Remove every XMP metadata stream: the document's own and those of single
   * pages, images and fonts (a photo's XMP can hold the camera and the place).
   * The streams themselves are deleted, not just the references to them:
   * pdf-lib writes every object it holds, referenced or not.
   */
  function removeXmp(doc) {
    const context = doc.context;
    const key = N("Metadata");
    const isXmp = (obj) => obj instanceof PDFLib.PDFStream && obj.dict.get(N("Type")) === key;
    let found = false;
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      if (isXmp(obj)) {
        context.delete(ref);
        found = true;
        continue;
      }
      const dict = obj instanceof PDFLib.PDFDict ? obj : obj instanceof PDFLib.PDFStream ? obj.dict : null;
      const value = dict && dict.get(key);
      if (!value) continue;
      const target = value instanceof PDFLib.PDFRef ? context.lookup(value) : value;
      // The catalog's /Metadata is always XMP; elsewhere only a stream that says so (or one already deleted).
      if (dict === doc.catalog || target === undefined || isXmp(target)) {
        dict.delete(key);
        if (value instanceof PDFLib.PDFRef) context.delete(value);
        found = true;
      }
    }
    return found;
  }

  function keywordList(value) {
    return value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        if (!files.length) return;
        T.busy("Reading metadata…");
        try {
          await fillExistingMetadata(files[0]);
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Updating…",
    reset() {
      clearFields();
      $("stripXmp").checked = true;
      $("keepDates").checked = false;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const doc = await T.loadPdf(file);
      handler.lock();

      const title = $("pdfTitle").value.trim();
      const author = $("pdfAuthor").value.trim();
      const subject = $("pdfSubject").value.trim();
      const keywords = keywordList($("pdfKeywords").value);
      const creator = $("pdfCreator").value.trim();
      const producer = $("pdfProducer").value.trim();

      // Setting a field to "" writes an empty string. To truly remove the
      // key we delete it from the Info dictionary instead.
      const info = doc.getInfoDict();
      const setOrDelete = (key, value, setter) => {
        if (value && value.length) setter(value);
        else info.delete(PDFLib.PDFName.of(key));
      };
      setOrDelete("Title", title, (v) => doc.setTitle(v));
      setOrDelete("Author", author, (v) => doc.setAuthor(v));
      setOrDelete("Subject", subject, (v) => doc.setSubject(v));
      setOrDelete("Keywords", keywords, (v) => doc.setKeywords(v));
      setOrDelete("Creator", creator, (v) => doc.setCreator(v));
      setOrDelete("Producer", producer, (v) => doc.setProducer(v));

      const empty = !title && !author && !subject && !keywords.length && !creator && !producer;
      const keepDates = $("keepDates").checked;
      let others = 0;
      if (empty) {
        // "Remove all metadata" means all of it: entries without a field on this page
        // (Company, Manager, document labels...) and, unless they are to be kept, the dates.
        otherInfoKeys(doc).forEach((name) => { info.delete(N(name)); others += 1; });
        if (!keepDates) ["CreationDate", "ModDate"].forEach((name) => info.delete(N(name)));
      } else if (!keepDates) {
        doc.setModificationDate(new Date());
      }

      const strippedXmp = $("stripXmp").checked && removeXmp(doc);

      const bytes = await doc.save();
      const kept = empty ? 0 : otherInfoKeys(doc).length;
      T.finish(bytes, T.makeFilename(file.name, empty ? "no-metadata" : "metadata"), {
        note: (empty ? "Metadata removed." : "Metadata updated.") +
          (others ? ` ${others} other entr${others === 1 ? "y was" : "ies were"} removed as well.` : "") +
          (strippedXmp ? " The XMP metadata was removed too." : "") +
          (kept ? ` ${kept} other entr${kept === 1 ? "y was" : "ies were"} kept; use “Clear all fields” to remove everything.` : ""),
      });
    },
  });
})();
