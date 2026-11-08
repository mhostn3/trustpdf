(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;
  const MM = 72 / 25.4;

  /* ================= signature sources ================= */

  let signature = null; // { pngBytes, width, height } (pixels)

  /* ---- draw ---- */
  const pad = $("signaturePad");
  const padCtx = pad.getContext("2d");
  let drawing = false;
  let strokes = [];
  let current = null;

  function padSetup() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = pad.parentElement.clientWidth || 500;
    pad.width = Math.round(cssWidth * dpr);
    pad.height = Math.round(180 * dpr);
    pad.style.width = `${cssWidth}px`;
    pad.style.height = "180px";
    padRedraw();
  }

  function padRedraw() {
    const dpr = window.devicePixelRatio || 1;
    padCtx.clearRect(0, 0, pad.width, pad.height);
    padCtx.lineCap = "round";
    padCtx.lineJoin = "round";
    padCtx.strokeStyle = $("penColor").value;
    padCtx.lineWidth = 2.2 * dpr;
    for (const stroke of strokes) {
      if (stroke.length < 2) {
        padCtx.beginPath();
        padCtx.arc(stroke[0].x, stroke[0].y, padCtx.lineWidth / 2, 0, Math.PI * 2);
        padCtx.fillStyle = padCtx.strokeStyle;
        padCtx.fill();
        continue;
      }
      padCtx.beginPath();
      padCtx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const mx = (stroke[i].x + stroke[i + 1].x) / 2;
        const my = (stroke[i].y + stroke[i + 1].y) / 2;
        padCtx.quadraticCurveTo(stroke[i].x, stroke[i].y, mx, my);
      }
      const last = stroke[stroke.length - 1];
      padCtx.lineTo(last.x, last.y);
      padCtx.stroke();
    }
  }

  function padPoint(e) {
    const rect = pad.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    drawing = true;
    current = [padPoint(e)];
    strokes.push(current);
    padRedraw();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    current.push(padPoint(e));
    padRedraw();
  });
  const padEnd = () => { drawing = false; current = null; updateSignatureFromSource(); };
  pad.addEventListener("pointerup", padEnd);
  pad.addEventListener("pointercancel", padEnd);
  $("clearPadBtn").addEventListener("click", () => { strokes = []; padRedraw(); updateSignatureFromSource(); });
  $("penColor").addEventListener("change", () => { padRedraw(); updateSignatureFromSource(); });
  window.addEventListener("resize", padSetup);
  padSetup();

  /* ---- type ---- */
  const FONTS = {
    script: '"Brush Script MT", "Segoe Script", "Snell Roundhand", "Apple Chancery", "URW Chancery L", cursive',
    hand: '"Bradley Hand", "Comic Sans MS", "Segoe Print", "Chalkboard", cursive',
    serif: 'Georgia, "Times New Roman", serif',
  };

  function typedCanvas() {
    const text = $("typedName").value.trim();
    if (!text) return null;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const size = 96;
    ctx.font = `italic ${size}px ${FONTS[$("typedFont").value] || FONTS.script}`;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    c.width = w;
    c.height = size * 1.6;
    ctx.font = `italic ${size}px ${FONTS[$("typedFont").value] || FONTS.script}`;
    ctx.fillStyle = $("typedColor").value;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, c.height / 2);
    return c;
  }
  ["typedName", "typedFont", "typedColor"].forEach((id) => $(id).addEventListener("input", updateSignatureFromSource));

  /* ---- upload ---- */
  let uploadedImage = null;
  $("signatureImage").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      URL.revokeObjectURL(url);
      updateSignatureFromSource();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      T.messages.error("That image could not be read. Please use a PNG or JPG file.");
    };
    img.src = url;
  });
  $("removeBackground").addEventListener("change", updateSignatureFromSource);

  function uploadedCanvas() {
    if (!uploadedImage) return null;
    const c = document.createElement("canvas");
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(uploadedImage.width, uploadedImage.height));
    c.width = Math.round(uploadedImage.width * scale);
    c.height = Math.round(uploadedImage.height * scale);
    const ctx = c.getContext("2d");
    ctx.drawImage(uploadedImage, 0, 0, c.width, c.height);
    if ($("removeBackground").checked) {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (lum > 200) d[i + 3] = Math.max(0, Math.round((235 - lum) / 35 * 255)); // soft edge: 200..235 fades out
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  }

  /* ---- common: trim transparent margins and export PNG ---- */

  function trimmed(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const d = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const m = 6;
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1 + 2 * m;
    out.height = maxY - minY + 1 + 2 * m;
    out.getContext("2d").drawImage(canvas, minX - m, minY - m, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  let updateTimer = null;
  function updateSignatureFromSource() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(async () => {
      const mode = document.querySelector('input[name="sigMode"]:checked').value;
      let source = null;
      if (mode === "draw" && strokes.length) source = pad;
      if (mode === "type") source = typedCanvas();
      if (mode === "upload") source = uploadedCanvas();
      const canvas = source ? trimmed(source) : null;
      if (!canvas) {
        signature = null;
        renderOverlay();
        return;
      }
      signature = { pngBytes: await T.canvasToBytes(canvas, "image/png"), width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL("image/png") };
      renderOverlay();
    }, 150);
  }

  document.querySelectorAll('input[name="sigMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      document.querySelectorAll("[data-sig-panel]").forEach((el) => el.classList.toggle("d-none", el.dataset.sigPanel !== radio.value));
      if (radio.value === "draw") padSetup();
      updateSignatureFromSource();
    });
  });

  /* ================= placement on the page ================= */

  const preview = new T.PagePreview({ canvas: "previewCanvas", overlay: "previewOverlay" });
  const overlayImg = $("signatureOverlay");
  let pdf = null;
  let pageCount = 0;
  // Bottom-left corner of the signature in visual points, plus width in points.
  let place = { x: 40 * MM, y: 25 * MM, w: 50 * MM };

  function renderOverlay() {
    if (!preview.width || !signature) {
      overlayImg.classList.add("d-none");
      return;
    }
    place.w = Number($("sigWidth").value) * MM;
    const h = place.w * signature.height / signature.width;
    place.x = Math.max(0, Math.min(place.x, preview.width - place.w));
    place.y = Math.max(0, Math.min(place.y, preview.height - h));
    const css = preview.toCss(place.x, place.y + h);
    overlayImg.src = signature.dataUrl;
    overlayImg.style.left = `${css.left}px`;
    overlayImg.style.top = `${css.top}px`;
    overlayImg.style.width = `${place.w * preview.scale}px`;
    overlayImg.classList.remove("d-none");
  }
  $("sigWidth").addEventListener("input", () => { $("sigWidthValue").textContent = `${$("sigWidth").value} mm`; renderOverlay(); });

  let drag = null;
  const overlay = $("previewOverlay");
  overlay.addEventListener("pointerdown", (e) => {
    if (!signature || !preview.width) return;
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    const p = preview.toPoint(e.clientX, e.clientY);
    const h = place.w * signature.height / signature.width;
    const inside = p.x >= place.x && p.x <= place.x + place.w && p.y >= place.y && p.y <= place.y + h;
    drag = inside ? { dx: p.x - place.x, dy: p.y - place.y } : { dx: place.w / 2, dy: h / 2 };
    if (!inside) { place.x = p.x - drag.dx; place.y = p.y - drag.dy; renderOverlay(); }
  });
  overlay.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = preview.toPoint(e.clientX, e.clientY);
    place.x = p.x - drag.dx;
    place.y = p.y - drag.dy;
    renderOverlay();
  });
  const endDrag = () => { drag = null; };
  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);

  async function showPage(n) {
    T.busy("Rendering preview…");
    try {
      await preview.show(pdf, n);
      $("previewPageLabel").textContent = `Page ${n} of ${pageCount}`;
      renderOverlay();
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
        await showPage(pageCount); // signatures usually go on the last page
      },
    },
    busyText: "Signing…",
    reset() {
      if (pdf) { pdf.release(); pdf = null; }
      $("previewWrapper").classList.add("d-none");
      $("allPages").checked = false;
      $("addDate").checked = false;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");
      if (!signature) throw new T.ToolError("Please draw, type or upload your signature first.");

      const doc = await T.loadPdf(file);
      const pages = doc.getPages();
      const targets = $("allPages").checked ? pages.map((_, i) => i + 1) : [preview.pageNumber];

      handler.lock();
      const png = await doc.embedPng(signature.pngBytes);
      const font = $("addDate").checked ? await doc.embedFont(PDFLib.StandardFonts.Helvetica) : null;
      const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      const ref = { w: preview.width, h: preview.height };

      for (const n of targets) {
        const page = pages[n - 1];
        const size = T.visualSize(page);
        const sx = size.width / ref.w;
        const sy = size.height / ref.h;
        const w = place.w * sx;
        const h = w * signature.height / signature.width;
        const x = place.x * sx;
        const y = place.y * sy;
        T.drawImageVisual(page, png, { x, y, width: w, height: h });
        if (font) {
          const fontSize = Math.max(7, Math.min(10, w / 14));
          T.drawTextVisual(page, date, { x, y: Math.max(2, y - fontSize - 2), size: fontSize, font, color: PDFLib.rgb(0.25, 0.25, 0.25) });
        }
      }
      doc.setModificationDate(new Date());
      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(file.name, "signed"), {
        note: targets.length === 1 ? `Signature placed on page ${targets[0]}.` : `Signature placed on all ${targets.length} pages.`,
      });
    },
  });
})();
