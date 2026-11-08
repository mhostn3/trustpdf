/*
  TrustPDF page picker: renders page thumbnails with PDF.js and lets the
  user click pages to select them (split, rotate, remove) or drag them
  into a new order (reorder).

  Thumbnails are rendered lazily as they scroll into view, one at a time,
  so a 300-page document does not freeze the browser. Loading a new file
  cancels any render still in progress and frees the previous document.

  Usage:
    const picker = new TrustPDF.PagePicker({
      container: 'pageGrid',       // <ul> element id
      mode: 'select' | 'sort',
      onChange: (picker) => {},
    });
    await picker.load(file);
    picker.getSelected()  -> [1-based page numbers]
    picker.setSelected([1, 2])
    picker.getOrder()     -> [0-based page indices in display order]
*/
(function () {
  "use strict";

  const script = document.currentScript;
  const PDFJS_SRC = script && script.dataset.pdfjsSrc;
  const PDFJS_WORKER = script && script.dataset.pdfjsWorker;

  let pdfjsPromise = null;

  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_SRC).then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return pdfjsLib;
      });
    }
    return pdfjsPromise;
  }

  const THUMB_HEIGHT = 120;

  class PagePicker {
    constructor(options) {
      this.container = document.getElementById(options.container);
      this.wrapper = options.wrapper ? document.getElementById(options.wrapper) : null;
      this.mode = options.mode || "select";
      this.onChange = options.onChange || null;

      this.pdf = null;
      this.task = null;
      this.pageCount = 0;
      this.generation = 0;
      this.sortable = null;
      this.observer = null;
      this.queue = [];
      this.rendering = false;
      this.rotation = 0;
      this.locked = false;

      this.container.classList.add("page-grid");
      if (this.mode === "sort") this.container.classList.add("sortable");

      this.container.addEventListener("click", (e) => this.handleClick(e));
      this.container.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          const li = e.target.closest("li");
          if (li) {
            e.preventDefault();
            this.toggle(li);
          }
        }
      });
    }

    /* ---------------- loading ---------------- */

    async load(file) {
      this.clear();
      const generation = this.generation;
      this.show(true);

      const pdfjsLib = await loadPdfjs();
      const data = new Uint8Array(await file.arrayBuffer());

      const task = pdfjsLib.getDocument({ data, isEvalSupported: false });
      let pdf;
      try {
        pdf = await task.promise;
      } catch (error) {
        if (generation !== this.generation) return;
        this.show(false);
        if (error && error.name === "PasswordException") {
          throw new TrustPDF.ToolError("This PDF is password-protected. Remove the password in your PDF reader and try again.");
        }
        throw error;
      }

      if (generation !== this.generation) {
        task.destroy();
        return;
      }

      this.task = task;
      this.pdf = pdf;
      this.pageCount = pdf.numPages;

      const fragment = document.createDocumentFragment();
      for (let n = 1; n <= this.pageCount; n++) {
        fragment.appendChild(this.createItem(n));
      }
      this.container.replaceChildren(fragment);

      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.observer.unobserve(entry.target);
            this.enqueue(entry.target, generation);
          }
        }
      }, { rootMargin: "300px 0px" });

      this.container.querySelectorAll("li").forEach((li) => this.observer.observe(li));

      if (this.mode === "sort" && typeof Sortable !== "undefined") {
        this.sortable = new Sortable(this.container, {
          animation: 150,
          onEnd: () => this.changed(),
        });
      }

      this.changed();
    }

    createItem(pageNumber) {
      const li = document.createElement("li");
      li.dataset.pageIndex = String(pageNumber - 1);
      li.dataset.pageNumber = String(pageNumber);
      li.tabIndex = 0;
      if (this.mode === "select") {
        li.setAttribute("role", "checkbox");
        li.setAttribute("aria-checked", "false");
      }
      li.setAttribute("aria-label", `Page ${pageNumber}`);

      const placeholder = document.createElement("div");
      placeholder.className = "placeholder-glow";
      placeholder.style.height = `${THUMB_HEIGHT}px`;
      placeholder.innerHTML = '<span class="placeholder w-100 h-100 rounded"></span>';

      const label = document.createElement("span");
      label.className = "page-label";
      label.textContent = `Page ${pageNumber}`;

      li.append(placeholder, label);
      return li;
    }

    enqueue(li, generation) {
      this.queue.push({ li, generation });
      this.drain();
    }

    async drain() {
      if (this.rendering) return;
      this.rendering = true;
      try {
        while (this.queue.length) {
          const { li, generation } = this.queue.shift();
          if (generation !== this.generation || !this.pdf) continue;
          try {
            await this.renderThumbnail(li, generation);
          } catch (error) {
            console.error(error);
          }
        }
      } finally {
        this.rendering = false;
      }
    }

    async renderThumbnail(li, generation) {
      const pageNumber = Number(li.dataset.pageNumber);
      const page = await this.pdf.getPage(pageNumber);
      if (generation !== this.generation) return;

      const base = page.getViewport({ scale: 1 });
      const scale = (THUMB_HEIGHT * (window.devicePixelRatio || 1)) / Math.max(base.height, 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute("aria-hidden", "true");

      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      page.cleanup();

      if (generation !== this.generation) return;
      const placeholder = li.querySelector(".placeholder-glow");
      if (placeholder) placeholder.replaceWith(canvas);
    }

    /* ---------------- selection ---------------- */

    handleClick(e) {
      if (this.mode !== "select" || this.locked) return;
      const li = e.target.closest("li");
      if (li) this.toggle(li);
    }

    toggle(li) {
      if (this.mode !== "select" || this.locked) return;
      const selected = !li.classList.contains("selected");
      li.classList.toggle("selected", selected);
      li.setAttribute("aria-checked", String(selected));
      this.changed();
    }

    getSelected() {
      return Array.from(this.container.querySelectorAll("li.selected"))
        .map((li) => Number(li.dataset.pageNumber))
        .sort((a, b) => a - b);
    }

    setSelected(pages) {
      const set = new Set(pages);
      this.container.querySelectorAll("li").forEach((li) => {
        const on = set.has(Number(li.dataset.pageNumber));
        li.classList.toggle("selected", on);
        li.setAttribute("aria-checked", String(on));
      });
      this.applyRotationPreview();
    }

    selectAll(on = true) {
      this.setSelected(on ? Array.from({ length: this.pageCount }, (_, i) => i + 1) : []);
      this.changed();
    }

    getOrder() {
      return Array.from(this.container.querySelectorAll("li")).map((li) => Number(li.dataset.pageIndex));
    }

    /* ---------------- rotation preview ---------------- */

    setRotation(angle) {
      this.rotation = Number(angle) || 0;
      this.applyRotationPreview();
    }

    applyRotationPreview() {
      const selected = this.getSelected();
      const all = selected.length === 0;
      this.container.querySelectorAll("li").forEach((li) => {
        li.classList.remove("rotate-90", "rotate-180", "rotate-270");
        if (this.rotation && (all || li.classList.contains("selected"))) {
          li.classList.add(`rotate-${this.rotation}`);
        }
      });
    }

    /* ---------------- misc ---------------- */

    changed() {
      if (this.rotation) this.applyRotationPreview();
      if (this.onChange) this.onChange(this);
    }

    show(on) {
      if (this.wrapper) this.wrapper.classList.toggle("d-none", !on);
    }

    lock() {
      this.locked = true;
      if (this.sortable) this.sortable.option("disabled", true);
      this.container.classList.add("is-busy");
    }

    clear() {
      this.generation += 1;
      this.queue = [];
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.sortable) {
        this.sortable.destroy();
        this.sortable = null;
      }
      if (this.task) {
        this.task.destroy();
        this.task = null;
      }
      this.pdf = null;
      this.pageCount = 0;
      this.locked = false;
      this.container.classList.remove("is-busy");
      this.container.replaceChildren();
      this.show(false);
    }
  }

  /**
   * Open a file with PDF.js (for rendering or reading text).
   * Returns the PDFDocumentProxy; call `pdf.release()` when done to free
   * the worker's memory.
   */
  async function openWithPdfjs(file) {
    const pdfjsLib = await loadPdfjs();
    const data = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
    const task = pdfjsLib.getDocument({ data, isEvalSupported: false });
    try {
      const pdf = await task.promise;
      pdf.release = () => task.destroy();
      return pdf;
    } catch (error) {
      task.destroy();
      if (error && error.name === "PasswordException") {
        throw new TrustPDF.ToolError("This PDF is password-protected. Remove the password in your PDF reader and try again.");
      }
      if (error && error.name === "InvalidPDFException") {
        throw new TrustPDF.ToolError("This file could not be read as a PDF. It may be damaged, or it may not be a PDF at all.");
      }
      throw error;
    }
  }

  /** Render one page (1-based) to a canvas at `dpi` (72 = the page's own size). */
  async function renderPage(pdf, pageNumber, dpi, { background = "#ffffff" } = {}) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / 72 });
    // Browsers cap canvas size; stay well below the limits (about 16k px a side, 268M px total).
    const maxSide = 10000;
    const factor = Math.min(1, maxSide / Math.max(viewport.width, viewport.height), Math.sqrt(64e6 / (viewport.width * viewport.height)));
    const vp = factor < 1 ? page.getViewport({ scale: (dpi / 72) * factor }) : viewport;

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const size = page.getViewport({ scale: 1 });
    page.cleanup();
    return { canvas, width: size.width, height: size.height };
  }

  function canvasToBytes(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new TrustPDF.ToolError("The browser could not create the image. Try a lower resolution."));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, type, quality);
    });
  }

  window.TrustPDF.PagePicker = PagePicker;
  window.TrustPDF.openWithPdfjs = openWithPdfjs;
  window.TrustPDF.renderPage = renderPage;
  window.TrustPDF.canvasToBytes = canvasToBytes;
})();
