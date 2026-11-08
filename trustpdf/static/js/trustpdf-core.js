/*
  TrustPDF core: shared behaviour for every tool page.

  Everything here runs in the browser. No file is ever sent anywhere; the
  Content-Security-Policy sent by the server does not even allow it.

  Exposes a single global, `TrustPDF`, with:
    - messages        inline status / error messages
    - busy / idle     progress indicator and button state
    - parsePageRanges "1-3,5,8-10" -> [1,2,3,5,8,9,10], bounded by page count
    - makeFilename    output filename based on the original name
    - loadPdf         PDF-Lib loader with friendly error messages
    - FileHandler     drop zone + file input + optional sortable list
    - download        blob download manager
    - initTool        wires a tool's process / download / start-again buttons
*/
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ----------------------------------------------------------------- */
  /*  Messages                                                          */
  /* ----------------------------------------------------------------- */

  const messages = {
    show(type, text, { html = false } = {}) {
      const box = $("toolMessage");
      if (!box) {
        window.alert(text);
        return;
      }
      const alert = document.createElement("div");
      alert.className = `alert alert-${type} mb-0`;
      alert.setAttribute("role", type === "danger" ? "alert" : "status");
      if (html) {
        alert.innerHTML = text;
      } else {
        alert.textContent = text;
      }
      box.replaceChildren(alert);
      alert.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    error(text) { this.show("danger", text); },
    warn(text) { this.show("warning", text); },
    info(text) { this.show("info", text); },
    success(text) { this.show("success", text); },
    clear() {
      const box = $("toolMessage");
      if (box) box.replaceChildren();
    },
  };

  /* ----------------------------------------------------------------- */
  /*  Busy indicator                                                    */
  /* ----------------------------------------------------------------- */

  let busyDepth = 0;

  function busy(text = "Working…") {
    busyDepth += 1;
    const btn = $("processBtn");
    const indicator = $("busyIndicator");
    const busyText = $("busyText");
    if (btn) btn.disabled = true;
    if (busyText) busyText.textContent = text;
    if (indicator) indicator.classList.remove("d-none");
    document.querySelectorAll("[data-tool-options]").forEach((el) => el.classList.add("is-busy"));
  }

  function idle() {
    busyDepth = Math.max(0, busyDepth - 1);
    if (busyDepth > 0) return;
    const btn = $("processBtn");
    const indicator = $("busyIndicator");
    if (btn) btn.disabled = false;
    if (indicator) indicator.classList.add("d-none");
    document.querySelectorAll("[data-tool-options]").forEach((el) => el.classList.remove("is-busy"));
  }

  /* Let the browser paint the spinner before heavy synchronous work. */
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

  /* ----------------------------------------------------------------- */
  /*  Errors                                                            */
  /* ----------------------------------------------------------------- */

  class ToolError extends Error {
    constructor(message) {
      super(message);
      this.name = "ToolError";
      this.friendly = true;
    }
  }

  function friendlyMessage(error) {
    if (!error) return "Something went wrong. Please try again.";
    if (error.friendly) return error.message;

    const name = error.name || "";
    const text = String(error.message || error);

    if (name === "EncryptedPDFError" || /encrypted/i.test(text)) {
      return "This PDF is password-protected. Remove the password in your PDF reader (File → Save as, without a password) and try again.";
    }
    if (/Failed to parse PDF|No PDF header|Expected instance of PDF|Trying to parse invalid object|is not a PDF/i.test(text)) {
      return "This file could not be read as a PDF. It may be damaged, or it may not be a PDF at all.";
    }
    if (/out of memory|allocation failed|Array buffer allocation/i.test(text)) {
      return "The browser ran out of memory while processing this file. Try a smaller file, or close other tabs and try again.";
    }
    return "Something went wrong while processing the file. Please check that it is a valid PDF and try again.";
  }

  /* ----------------------------------------------------------------- */
  /*  Page ranges                                                       */
  /* ----------------------------------------------------------------- */

  /**
   * Parse "1-3, 5, 8-10" into a sorted list of unique page numbers.
   * Pages outside 1..totalPages are reported, not silently dropped.
   * Throws ToolError on malformed input.
   */
  function parsePageRanges(input, totalPages) {
    const pages = new Set();
    const outOfRange = [];
    const text = String(input || "").trim();

    if (!text) return [];

    for (let part of text.split(/[,;\s]+/)) {
      part = part.trim();
      if (!part) continue;

      const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) {
        throw new ToolError(`"${part}" is not a valid page or range. Use numbers and ranges like 1-3,5,8-10.`);
      }

      const start = Number(match[1]);
      const end = match[2] !== undefined ? Number(match[2]) : start;

      if (start < 1 || end < 1) {
        throw new ToolError("Page numbers start at 1.");
      }
      if (end < start) {
        throw new ToolError(`The range "${part}" ends before it starts.`);
      }

      if (totalPages && start > totalPages) {
        outOfRange.push(part);
        continue;
      }

      const last = totalPages ? Math.min(end, totalPages) : end;
      if (!totalPages && last - start > 10000) {
        throw new ToolError(`The range "${part}" is too large.`);
      }
      if (totalPages && end > totalPages) {
        outOfRange.push(part);
      }
      for (let i = start; i <= last; i++) pages.add(i);
    }

    if (outOfRange.length && !pages.size) {
      throw new ToolError(`This PDF has ${totalPages} page${totalPages === 1 ? "" : "s"}, so ${outOfRange.join(", ")} is out of range.`);
    }

    return Array.from(pages).sort((a, b) => a - b);
  }

  /** Compact a sorted page list into "1-3,5,8-10". */
  function formatPageRanges(pages) {
    const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
    const parts = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      parts.push(j > i + 1 ? `${sorted[i]}-${sorted[j]}` : j === i + 1 ? `${sorted[i]},${sorted[j]}` : `${sorted[i]}`);
      i = j + 1;
    }
    return parts.join(",");
  }

  /* ----------------------------------------------------------------- */
  /*  Filenames                                                         */
  /* ----------------------------------------------------------------- */

  function baseName(filename) {
    return String(filename || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 80);
  }

  /** "Annual report.pdf" + "merged" -> "Annual report-merged.pdf" */
  function makeFilename(originalName, suffix, extension = "pdf") {
    const base = baseName(originalName) || "TrustPDF";
    return suffix ? `${base}-${suffix}.${extension}` : `${base}.${extension}`;
  }

  /* ----------------------------------------------------------------- */
  /*  PDF loading                                                       */
  /* ----------------------------------------------------------------- */

  async function loadPdf(fileOrBytes, options = {}) {
    if (typeof PDFLib === "undefined") {
      throw new ToolError("The PDF library did not load. Please refresh the page.");
    }
    const bytes = fileOrBytes instanceof Uint8Array
      ? fileOrBytes
      : new Uint8Array(await fileOrBytes.arrayBuffer());

    // updateMetadata:false keeps the file's own Producer/Creator/dates
    // instead of stamping "pdf-lib" on them.
    return PDFLib.PDFDocument.load(bytes, { updateMetadata: false, ...options });
  }

  /** Copy Info-dictionary fields from one document to another. */
  function copyMetadata(source, target) {
    const title = source.getTitle();
    const author = source.getAuthor();
    const subject = source.getSubject();
    const keywords = source.getKeywords();
    if (title) target.setTitle(title);
    if (author) target.setAuthor(author);
    if (subject) target.setSubject(subject);
    if (keywords) target.setKeywords(keywords.split(/[,;]\s*/).filter(Boolean));
  }

  /** A new document that says it was made with TrustPDF, nothing more. */
  async function createPdf() {
    const doc = await PDFLib.PDFDocument.create();
    doc.setProducer("TrustPDF (pdf-lib)");
    doc.setCreator("TrustPDF");
    return doc;
  }

  /* ----------------------------------------------------------------- */
  /*  Drawing on pages (page numbers, watermarks)                       */
  /* ----------------------------------------------------------------- */

  function pageRotation(page) {
    return ((page.getRotation().angle % 360) + 360) % 360;
  }

  /** The page size the reader sees, after the page's /Rotate is applied. */
  function visualSize(page) {
    const box = page.getCropBox();
    const turned = pageRotation(page) % 180 !== 0;
    return turned ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
  }

  /**
   * Map a point from visual coordinates (origin bottom-left of the page as
   * displayed, after /Rotate) to the page's own coordinate space.
   */
  function visualToPage(page, x, y) {
    const rotation = pageRotation(page);
    const box = page.getCropBox();
    let px = x;
    let py = y;
    if (rotation === 90) { px = box.width - y; py = x; }
    else if (rotation === 180) { px = box.width - x; py = box.height - y; }
    else if (rotation === 270) { px = y; py = box.height - x; }
    return { x: box.x + px, y: box.y + py, rotation };
  }

  /**
   * Draw text in visual coordinates: (x, y) is the start of the baseline and
   * `angle` turns the text counter-clockwise. Pages with /Rotate 90, 180 or
   * 270 get their text upright anyway.
   */
  function drawTextVisual(page, text, { x, y, angle = 0, ...options }) {
    const p = visualToPage(page, x, y);
    page.drawText(text, { ...options, x: p.x, y: p.y, rotate: PDFLib.degrees((angle + p.rotation) % 360) });
  }

  /** Draw an embedded image with its bottom-left corner at visual (x, y). */
  function drawImageVisual(page, image, { x, y, width, height, ...options }) {
    const p = visualToPage(page, x, y);
    page.drawImage(image, { ...options, x: p.x, y: p.y, width, height, rotate: PDFLib.degrees(p.rotation) });
  }

  /** Draw an embedded page (PDFEmbeddedPage) with its bottom-left corner at visual (x, y). */
  function drawPageVisual(page, embedded, { x, y, width, height, ...options }) {
    const p = visualToPage(page, x, y);
    page.drawPage(embedded, { ...options, x: p.x, y: p.y, width, height, rotate: PDFLib.degrees(p.rotation) });
  }

  /** Standard PDF fonts only cover Latin text; say which character is the problem. */
  function assertEncodable(font, text) {
    for (const ch of text) {
      try {
        font.encodeText(ch);
      } catch (_) {
        throw new ToolError(`The character "${ch}" is not supported. The built-in PDF fonts cover Latin letters (including most accented ones), digits and common punctuation.`);
      }
    }
  }

  /* ----------------------------------------------------------------- */
  /*  Download manager                                                  */
  /* ----------------------------------------------------------------- */

  const download = {
    blobUrl: null,
    filename: null,

    prepare(bytesOrBlob, filename, type = "application/pdf") {
      this.clear();
      const blob = bytesOrBlob instanceof Blob ? bytesOrBlob : new Blob([bytesOrBlob], { type });
      this.blobUrl = URL.createObjectURL(blob);
      this.filename = filename;
      this.size = blob.size;
      this.bytes = bytesOrBlob instanceof Blob ? null : bytesOrBlob;
    },

    trigger(event) {
      if (event) event.preventDefault();
      if (!this.blobUrl || !this.filename) {
        messages.warn("Please process the file first.");
        return;
      }
      const link = document.createElement("a");
      link.href = this.blobUrl;
      link.download = this.filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    clear() {
      if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
      this.filename = null;
      this.size = 0;
      this.bytes = null;
    },
  };

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /* ----------------------------------------------------------------- */
  /*  File handler                                                      */
  /* ----------------------------------------------------------------- */

  const ACCEPT_PRESETS = {
    pdf: { mimes: ["application/pdf"], extensions: [".pdf"], label: "PDF files" },
    image: { mimes: ["image/jpeg", "image/png"], extensions: [".jpg", ".jpeg", ".png"], label: "JPG or PNG images" },
  };

  class FileHandler {
    constructor(options) {
      this.dropZone = $(options.dropZoneId || "dropZone");
      this.input = $(options.inputId || "fileInput");
      this.fileList = options.fileListId ? $(options.fileListId) : null;
      this.totalSizeDisplay = options.totalSizeId ? $(options.totalSizeId) : null;
      this.fileInfo = $("fileInfo");

      this.multiple = Boolean(options.multiple);
      this.sortable = Boolean(options.sortable);
      this.accept = ACCEPT_PRESETS[options.accept] || ACCEPT_PRESETS.pdf;
      this.onChange = options.onChange || null;

      this.fileMap = new Map();
      this.loadedFile = null;
      this.sortableList = null;
      this.locked = false;

      this.originalDropZoneHTML = this.dropZone.innerHTML;

      this.bindDropZoneEvents();
      this.bindInputEvent();
      this.initSortable();
    }

    bindDropZoneEvents() {
      // Dropping outside the drop zone must not open the file in the tab.
      window.addEventListener("dragover", (e) => e.preventDefault());
      window.addEventListener("drop", (e) => e.preventDefault());

      const open = () => {
        if (!this.locked && this.input) this.input.click();
      };

      this.dropZone.addEventListener("click", (e) => {
        if (e.target === this.input) return;
        open();
      });
      this.dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      this.dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!this.locked) this.dropZone.classList.add("border-primary");
      });
      this.dropZone.addEventListener("dragleave", () => {
        this.dropZone.classList.remove("border-primary");
      });
      this.dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        this.dropZone.classList.remove("border-primary");
        if (!this.locked) this.handleFiles(e.dataTransfer.files);
      });
    }

    bindInputEvent() {
      if (!this.input) return;
      this.input.addEventListener("change", (e) => {
        this.handleFiles(e.target.files);
        // Allow choosing the same file again after removing it.
        e.target.value = "";
      });
    }

    initSortable() {
      if (this.sortable && this.fileList && typeof Sortable !== "undefined") {
        this.sortableList = new Sortable(this.fileList, {
          animation: 150,
          onEnd: () => this.changed(),
        });
      }
    }

    isAccepted(file) {
      if (!file) return false;
      const name = file.name.toLowerCase();
      if (this.accept.mimes.includes(file.type)) return true;
      // Some browsers/OSes report an empty or generic MIME type; fall back to the extension.
      return this.accept.extensions.some((ext) => name.endsWith(ext));
    }

    handleFiles(files) {
      if (!files || !files.length) return;
      messages.clear();

      const rejected = [];
      const accepted = [];
      for (const file of files) {
        (this.isAccepted(file) ? accepted : rejected).push(file);
      }

      if (rejected.length) {
        const names = rejected.map((f) => f.name).slice(0, 3).join(", ");
        const more = rejected.length > 3 ? ` and ${rejected.length - 3} more` : "";
        messages.warn(`Only ${this.accept.label} are supported. Skipped: ${names}${more}.`);
      }

      if (!accepted.length) return;

      if (this.multiple) {
        let added = 0;
        for (const file of accepted) {
          if (this.addFile(file)) added += 1;
        }
        if (!added && accepted.length) {
          messages.info("Those files are already in the list.");
        }
      } else {
        this.setSingleFile(accepted[0]);
      }

      this.updateTotalSize();
      this.changed();
    }

    addFile(file) {
      const key = this.getFileKey(file);
      if (this.fileMap.has(key)) return false;
      this.fileMap.set(key, file);

      if (!this.fileList) return true;

      const li = document.createElement("li");
      li.className = "list-group-item";
      li.dataset.filekey = key;

      const wrapper = document.createElement("div");
      wrapper.className = "d-flex align-items-center file-name";

      const icon = document.createElement("i");
      icon.className = this.getIconClass(file);
      icon.setAttribute("aria-hidden", "true");

      const span = document.createElement("span");
      span.textContent = `${file.name} (${formatSize(file.size)})`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-sm btn-outline-danger flex-shrink-0";
      removeBtn.textContent = "Remove";
      removeBtn.setAttribute("aria-label", `Remove ${file.name}`);
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.fileMap.delete(key);
        li.remove();
        this.updateTotalSize();
        this.changed();
      });

      wrapper.append(icon, span);
      li.append(wrapper, removeBtn);
      this.fileList.appendChild(li);
      return true;
    }

    setSingleFile(file) {
      this.loadedFile = file;
      this.dropZone.replaceChildren();

      const wrapper = document.createElement("div");
      wrapper.className = "d-flex align-items-center justify-content-center flex-wrap gap-2";

      const icon = document.createElement("i");
      icon.className = this.getIconClass(file);
      icon.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.className = "fw-bold text-success file-name";
      text.textContent = `${file.name} (${formatSize(file.size)})`;

      const hint = document.createElement("span");
      hint.className = "text-body-secondary small w-100";
      hint.textContent = "Click or drop another file to replace it";

      wrapper.append(icon, text, hint);
      this.dropZone.appendChild(wrapper);
    }

    getFileKey(file) {
      return `${file.name}_${file.size}_${file.lastModified}`;
    }

    getIconClass(file) {
      if (file.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(file.name)) {
        return "bi bi-file-earmark-image-fill text-primary me-2";
      }
      return "bi bi-file-earmark-pdf-fill text-danger me-2";
    }

    getFiles() {
      if (this.multiple) {
        if (this.fileList) {
          return Array.from(this.fileList.querySelectorAll("li"))
            .map((li) => this.fileMap.get(li.dataset.filekey))
            .filter(Boolean);
        }
        return Array.from(this.fileMap.values());
      }
      return this.loadedFile ? [this.loadedFile] : [];
    }

    getSingleFile() {
      return this.loadedFile;
    }

    setInfo(text) {
      if (this.fileInfo) this.fileInfo.textContent = text || "";
    }

    updateTotalSize() {
      if (!this.totalSizeDisplay) return;
      const files = this.getFiles();
      if (!files.length) {
        this.totalSizeDisplay.textContent = "";
        return;
      }
      const totalBytes = files.reduce((acc, file) => acc + file.size, 0);
      this.totalSizeDisplay.textContent = `${files.length} file${files.length === 1 ? "" : "s"} · Total size: ${formatSize(totalBytes)}`;
    }

    changed() {
      if (this.onChange) {
        Promise.resolve(this.onChange(this.getFiles())).catch((error) => {
          console.error(error);
          messages.error(friendlyMessage(error));
        });
      }
    }

    /** Freeze the list while processing / after processing. */
    lock() {
      this.locked = true;
      this.dropZone.classList.add("is-busy");
      this.dropZone.setAttribute("aria-disabled", "true");
      if (this.fileList) {
        this.fileList.querySelectorAll("button").forEach((btn) => btn.remove());
      }
      if (this.sortableList) this.sortableList.option("disabled", true);
    }

    reset() {
      this.locked = false;
      this.fileMap.clear();
      this.loadedFile = null;
      this.dropZone.classList.remove("is-busy");
      this.dropZone.removeAttribute("aria-disabled");

      if (this.fileList) this.fileList.replaceChildren();

      this.dropZone.innerHTML = this.originalDropZoneHTML;
      this.input = this.dropZone.querySelector('input[type="file"]');
      if (this.input) {
        this.input.value = "";
        this.bindInputEvent();
      }

      this.setInfo("");
      this.updateTotalSize();

      if (this.sortableList) {
        this.sortableList.destroy();
        this.sortableList = null;
      }
      this.initSortable();
      this.changed();
    }
  }

  /* ----------------------------------------------------------------- */
  /*  Tool wiring                                                       */
  /* ----------------------------------------------------------------- */

  const state = { config: null, fileHandler: null };

  function showDownloadArea(show) {
    const area = $("downloadArea");
    if (area) area.classList.toggle("d-none", !show);
  }

  function showProcessButton(show) {
    const btn = $("processBtn");
    if (btn) btn.classList.toggle("d-none", !show);
  }

  /**
   * Call when a tool has produced output bytes. Shows the download area and
   * freezes the inputs until "Start again".
   */
  function finish(bytes, filename, { type = "application/pdf", note } = {}) {
    download.prepare(bytes, filename, type);

    const btn = $("downloadBtn");
    if (btn) {
      btn.dataset.filename = filename;
      const label = btn.querySelector("[data-download-label]");
      if (label) label.textContent = btn.dataset.label || label.textContent;
    }
    const name = $("downloadName");
    if (name) name.textContent = `${filename} · ${formatSize(download.size)}`;

    showProcessButton(false);
    if (state.fileHandler) state.fileHandler.lock();
    showDownloadArea(true);
    messages.success(note || "Done. Your file is ready to save.");
    const area = $("downloadArea");
    if (area) area.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /**
   * Run a tool's main function with busy state and error handling.
   */
  async function runTool(fn, busyText) {
    messages.clear();
    busy(busyText);
    await nextFrame();
    try {
      await fn();
    } catch (error) {
      if (!error || !error.friendly) console.error(error);
      messages.error(friendlyMessage(error));
      showProcessButton(true);
    } finally {
      idle();
    }
  }

  function startAgain() {
    download.clear();
    messages.clear();
    if (state.fileHandler) state.fileHandler.reset();
    showDownloadArea(false);
    showProcessButton(true);
    if (state.config && typeof state.config.reset === "function") {
      state.config.reset();
    }
    const dz = $("dropZone");
    if (dz) dz.focus();
  }

  /**
   * config = {
   *   files: { multiple, sortable, accept: 'pdf'|'image', fileListId, totalSizeId, onChange },
   *   busyText: 'Merging…',
   *   process: async () => { ... TrustPDF.finish(bytes, name) },
   *   reset: () => { ... },
   * }
   */
  function initTool(config) {
    state.config = config;
    state.fileHandler = new FileHandler({ dropZoneId: "dropZone", inputId: "fileInput", ...(config.files || {}) });

    const processBtn = $("processBtn");
    if (processBtn) {
      processBtn.addEventListener("click", () => runTool(config.process, config.busyText));
    }
    const downloadBtn = $("downloadBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", (e) => download.trigger(e));
    }
    const startAgainBtn = $("startAgainBtn");
    if (startAgainBtn) {
      startAgainBtn.addEventListener("click", startAgain);
    }

    return state.fileHandler;
  }

  window.TrustPDF = {
    $,
    messages,
    busy,
    idle,
    nextFrame,
    ToolError,
    friendlyMessage,
    parsePageRanges,
    formatPageRanges,
    makeFilename,
    formatSize,
    loadPdf,
    createPdf,
    copyMetadata,
    visualSize,
    visualToPage,
    drawTextVisual,
    drawImageVisual,
    drawPageVisual,
    assertEncodable,
    download,
    FileHandler,
    initTool,
    runTool,
    finish,
    startAgain,
    get fileHandler() { return state.fileHandler; },
  };
})();
