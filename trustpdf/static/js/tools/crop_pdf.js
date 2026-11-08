(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;
  const MM = 72 / 25.4;

  const preview = new T.PagePreview({ canvas: "previewCanvas", overlay: "previewOverlay" });
  const box = $("cropBox");
  let pdf = null;
  let pageCount = 0;
  // Crop rectangle in visual points, origin bottom-left.
  let crop = null;

  /* ---------------- rectangle <-> inputs ---------------- */

  function clampCrop() {
    crop.x = Math.max(0, Math.min(crop.x, preview.width - 20));
    crop.y = Math.max(0, Math.min(crop.y, preview.height - 20));
    crop.w = Math.max(20, Math.min(crop.w, preview.width - crop.x));
    crop.h = Math.max(20, Math.min(crop.h, preview.height - crop.y));
  }

  function renderBox() {
    if (!crop) return;
    clampCrop();
    const css = preview.toCss(crop.x, crop.y + crop.h);
    box.style.left = `${css.left}px`;
    box.style.top = `${css.top}px`;
    box.style.width = `${crop.w * preview.scale}px`;
    box.style.height = `${crop.h * preview.scale}px`;
    box.classList.remove("d-none");
    $("cropInfo").textContent = `Result: ${(crop.w / MM).toFixed(0)} × ${(crop.h / MM).toFixed(0)} mm (page is ${(preview.width / MM).toFixed(0)} × ${(preview.height / MM).toFixed(0)} mm)`;
  }

  function cropToInputs() {
    $("marginTop").value = ((preview.height - crop.y - crop.h) / MM).toFixed(1).replace(/\.0$/, "");
    $("marginBottom").value = (crop.y / MM).toFixed(1).replace(/\.0$/, "");
    $("marginLeft").value = (crop.x / MM).toFixed(1).replace(/\.0$/, "");
    $("marginRight").value = ((preview.width - crop.x - crop.w) / MM).toFixed(1).replace(/\.0$/, "");
  }

  function inputsToCrop() {
    if (!preview.width) return;
    const m = (id) => Math.max(0, Number($(id).value) || 0) * MM;
    crop = {
      x: m("marginLeft"),
      y: m("marginBottom"),
      w: preview.width - m("marginLeft") - m("marginRight"),
      h: preview.height - m("marginTop") - m("marginBottom"),
    };
    renderBox();
  }
  ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach((id) => $(id).addEventListener("input", inputsToCrop));

  /* ---------------- mouse / touch interaction ---------------- */

  let drag = null;
  const overlay = $("previewOverlay");

  overlay.addEventListener("pointerdown", (e) => {
    if (!crop) return;
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    const p = preview.toPoint(e.clientX, e.clientY);
    const handle = e.target.dataset.handle;
    // A box that still covers the whole page is not "moved": dragging draws a new one.
    const fullPage = crop.w >= preview.width - 1 && crop.h >= preview.height - 1;
    if (handle) {
      drag = { kind: "resize", handle, start: { ...crop } };
    } else if (e.target === box && !fullPage) {
      drag = { kind: "move", offset: { x: p.x - crop.x, y: p.y - crop.y } };
    } else {
      drag = { kind: "draw", origin: p };
      crop = { x: p.x, y: p.y, w: 20, h: 20 };
    }
  });

  overlay.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = preview.toPoint(e.clientX, e.clientY);
    if (drag.kind === "move") {
      crop.x = p.x - drag.offset.x;
      crop.y = p.y - drag.offset.y;
    } else if (drag.kind === "draw") {
      crop.x = Math.min(drag.origin.x, p.x);
      crop.y = Math.min(drag.origin.y, p.y);
      crop.w = Math.abs(p.x - drag.origin.x);
      crop.h = Math.abs(p.y - drag.origin.y);
    } else {
      const s = drag.start;
      const right = s.x + s.w;
      const top = s.y + s.h;
      if (drag.handle.includes("w")) { crop.x = Math.min(p.x, right - 20); crop.w = right - crop.x; }
      if (drag.handle.includes("e")) { crop.w = Math.max(20, p.x - s.x); }
      if (drag.handle.includes("s")) { crop.y = Math.min(p.y, top - 20); crop.h = top - crop.y; }
      if (drag.handle.includes("n")) { crop.h = Math.max(20, p.y - s.y); }
    }
    renderBox();
    cropToInputs();
  });

  const endDrag = () => { drag = null; };
  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);

  /* ---------------- auto trim ---------------- */

  $("autoTrimBtn").addEventListener("click", () => {
    if (!preview.width) return;
    const img = preview.imageData();
    const { width, height, data } = img;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      T.messages.info("This page looks empty, so there is nothing to trim.");
      return;
    }
    const pxPerPt = width / preview.width;
    const pad = 3 * MM;
    const x = minX / pxPerPt - pad;
    const w = (maxX - minX) / pxPerPt + 2 * pad;
    const top = minY / pxPerPt - pad;
    const h = (maxY - minY) / pxPerPt + 2 * pad;
    crop = { x, y: preview.height - top - h, w, h };
    renderBox();
    cropToInputs();
    T.messages.clear();
  });

  $("resetCropBtn").addEventListener("click", () => {
    crop = { x: 0, y: 0, w: preview.width, h: preview.height };
    renderBox();
    cropToInputs();
  });

  /* ---------------- page selection for the preview ---------------- */

  async function showPage(n) {
    T.busy("Rendering preview…");
    try {
      await preview.show(pdf, n);
      $("previewPageLabel").textContent = `Page ${n} of ${pageCount}`;
      if (!crop) crop = { x: 0, y: 0, w: preview.width, h: preview.height };
      renderBox();
      cropToInputs();
    } finally {
      T.idle();
    }
  }
  $("prevPageBtn").addEventListener("click", () => { if (preview.pageNumber > 1) showPage(preview.pageNumber - 1); });
  $("nextPageBtn").addEventListener("click", () => { if (preview.pageNumber < pageCount) showPage(preview.pageNumber + 1); });

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        if (pdf) { pdf.release(); pdf = null; }
        crop = null;
        $("previewWrapper").classList.add("d-none");
        if (!files.length) return;
        T.busy("Loading preview…");
        try {
          pdf = await T.openWithPdfjs(files[0]);
          pageCount = pdf.numPages;
          handler.setInfo(`${pageCount} page${pageCount === 1 ? "" : "s"}`);
          $("previewWrapper").classList.remove("d-none");
        } finally {
          T.idle();
        }
        await showPage(1);
      },
    },
    busyText: "Cropping…",
    reset() {
      if (pdf) { pdf.release(); pdf = null; }
      crop = null;
      $("previewWrapper").classList.add("d-none");
      $("pages").value = "";
      ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach((id) => { $(id).value = "0"; });
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file || !crop) throw new T.ToolError("Please select a PDF file first.");
      if (crop.w >= preview.width - 0.5 && crop.h >= preview.height - 0.5) {
        throw new T.ToolError("Draw a rectangle on the preview, type margins, or click “Auto-trim” first. The crop currently covers the whole page.");
      }

      const doc = await T.loadPdf(file);
      const pages = doc.getPages();
      const total = pages.length;
      const input = $("pages").value.trim();
      const targets = input ? T.parsePageRanges(input, total) : pages.map((_, i) => i + 1);
      if (!targets.length) throw new T.ToolError("Please choose which pages to crop, or leave the field empty for all pages.");

      handler.lock();
      // The rectangle is defined on the previewed page in visual points; apply
      // the same margins to every target page, scaled if a page has another size.
      const ref = { w: preview.width, h: preview.height };
      for (const n of targets) {
        const page = pages[n - 1];
        const size = T.visualSize(page);
        const sx = size.width / ref.w;
        const sy = size.height / ref.h;
        const vx = crop.x * sx;
        const vy = crop.y * sy;
        const vw = crop.w * sx;
        const vh = crop.h * sy;
        const a = T.visualToPage(page, vx, vy);
        const b = T.visualToPage(page, vx + vw, vy + vh);
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        page.setMediaBox(x, y, w, h);
        page.setCropBox(x, y, w, h);
        page.setBleedBox(x, y, w, h);
        page.setTrimBox(x, y, w, h);
        page.setArtBox(x, y, w, h);
      }
      doc.setModificationDate(new Date());
      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "cropped"), {
        note: `Cropped ${targets.length} of ${total} page${total === 1 ? "" : "s"} to ${(crop.w / MM).toFixed(0)} × ${(crop.h / MM).toFixed(0)} mm.`,
      });
    },
  });
})();
