(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  function cell(value) {
    const td = document.createElement("td");
    if (value === null || value === undefined || value === "") {
      const span = document.createElement("span");
      span.className = "text-body-secondary";
      span.textContent = "Not set";
      td.appendChild(span);
    } else {
      td.textContent = String(value);
    }
    return td;
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return value.toLocaleString();
    } catch (_) {
      return String(value);
    }
  }

  function hasXmp(doc) {
    return doc.catalog.has(PDFLib.PDFName.of("Metadata"));
  }

  const handler = T.initTool({
    files: { multiple: false, accept: "pdf" },
    busyText: "Reading…",
    reset() {
      $("metadataResult").replaceChildren();
      $("metadataResult").classList.add("d-none");
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const doc = await T.loadPdf(file);
      const pageCount = doc.getPageCount();
      const first = pageCount ? doc.getPage(0).getSize() : null;
      const pageSize = first ? `${(first.width / 72 * 25.4).toFixed(0)} × ${(first.height / 72 * 25.4).toFixed(0)} mm` : "";

      const rows = [
        ["File name", file.name],
        ["File size", T.formatSize(file.size)],
        ["Pages", pageCount],
        ["First page size", pageSize],
        ["Title", doc.getTitle()],
        ["Author", doc.getAuthor()],
        ["Subject", doc.getSubject()],
        ["Keywords", doc.getKeywords()],
        ["Creator (application)", doc.getCreator()],
        ["Producer (PDF library)", doc.getProducer()],
        ["Creation date", formatDate(doc.getCreationDate())],
        ["Modification date", formatDate(doc.getModificationDate())],
        ["XMP metadata stream", hasXmp(doc) ? "Present (may contain additional details)" : "None"],
      ];

      const heading = document.createElement("h2");
      heading.className = "h4 mb-3";
      heading.textContent = "PDF Metadata";

      const table = document.createElement("table");
      table.className = "table table-sm align-middle mb-0";
      const tbody = document.createElement("tbody");
      for (const [label, value] of rows) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        th.style.width = "35%";
        th.textContent = label;
        tr.append(th, cell(value));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      const wrap = document.createElement("div");
      wrap.className = "table-responsive";
      wrap.appendChild(table);

      const result = $("metadataResult");
      result.replaceChildren(heading, wrap);
      result.classList.remove("d-none");

      handler.lock();
      $("processBtn").classList.add("d-none");
      $("downloadArea").classList.remove("d-none");
      result.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  });
})();
