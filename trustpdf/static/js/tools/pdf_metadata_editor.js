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
    handler.setInfo(`${pages} page${pages === 1 ? "" : "s"} · XMP metadata stream: ${xmp ? "present" : "none"}`);
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

      if (!$("keepDates").checked) {
        doc.setModificationDate(new Date());
      }

      let strippedXmp = false;
      if ($("stripXmp").checked) {
        const key = PDFLib.PDFName.of("Metadata");
        if (doc.catalog.has(key)) {
          doc.catalog.delete(key);
          strippedXmp = true;
        }
      }

      const bytes = await doc.save();
      const empty = !title && !author && !subject && !keywords.length && !creator && !producer;
      T.finish(bytes, T.makeFilename(file.name, empty ? "no-metadata" : "metadata"), {
        note: (empty ? "Metadata removed." : "Metadata updated.") + (strippedXmp ? " The XMP metadata stream was removed too." : ""),
      });
    },
  });
})();
