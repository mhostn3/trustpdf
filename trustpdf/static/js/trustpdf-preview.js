/*
  Single-page preview with an overlay for tools that place something on a
  page (sign) or pick a region (crop).

    const preview = new TrustPDF.PagePreview({ canvas: "previewCanvas", overlay: "previewOverlay" });
    await preview.show(pdf, 1);          // pdf = PDF.js document
    preview.width / preview.height      // visual page size in PDF points
    preview.scale                       // CSS pixels per point
    preview.toPoint(clientX, clientY)   // -> { x, y } in points, origin bottom-left
*/
(function () {
  "use strict";

  class PagePreview {
    constructor({ canvas, overlay, maxWidth = 640 }) {
      this.canvas = document.getElementById(canvas);
      this.overlay = document.getElementById(overlay);
      this.maxWidth = maxWidth;
      this.width = 0;
      this.height = 0;
      this.scale = 1;
      this.pageNumber = 0;
    }

    async show(pdf, pageNumber) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      // The stage is inline-block, so measure the block that holds it.
      const container = this.canvas.parentElement.parentElement || this.canvas.parentElement;
      const available = Math.min(this.maxWidth, (container.clientWidth || this.maxWidth) - 2);
      this.scale = Math.min(available / base.width, 800 / base.height);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: this.scale * dpr });

      this.canvas.width = Math.ceil(viewport.width);
      this.canvas.height = Math.ceil(viewport.height);
      this.canvas.style.width = `${Math.round(base.width * this.scale)}px`;
      this.canvas.style.height = `${Math.round(base.height * this.scale)}px`;
      const ctx = this.canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();

      this.width = base.width;
      this.height = base.height;
      this.pageNumber = pageNumber;
      if (this.overlay) {
        this.overlay.style.width = this.canvas.style.width;
        this.overlay.style.height = this.canvas.style.height;
      }
      return this;
    }

    /** Pixels of the rendered page (for auto-detection), in CSS size. */
    imageData() {
      return this.canvas.getContext("2d").getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    toPoint(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / this.scale;
      const yTop = (clientY - rect.top) / this.scale;
      return { x: Math.max(0, Math.min(this.width, x)), y: Math.max(0, Math.min(this.height, this.height - yTop)) };
    }

    /** CSS left/top (px) of a visual point. */
    toCss(x, y) {
      return { left: x * this.scale, top: (this.height - y) * this.scale };
    }
  }

  window.TrustPDF.PagePreview = PagePreview;
})();
