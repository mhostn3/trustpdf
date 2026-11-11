/*
  Redact PDF: black boxes are burned into an image of each marked page, so
  the text, images and layers under them are not in the saved file at all.
  Unmarked pages are copied as they are (or rasterised too, if the user asks).
*/
(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;
  const MIN = 3; // smallest box side in points; smaller drags are treated as clicks

  const preview = new T.PagePreview({ canvas: "previewCanvas", overlay: "previewOverlay" });
  const overlay = $("previewOverlay");
  let pdf = null; // PDF.js document
  let pageCount = 0;
  let locked = false;
  // page number -> [{ x, y, w, h }] in visual points, origin bottom-left
  let boxes = new Map();

  T.lockables.push({ lock() { locked = true; }, unlock() { locked = false; } });

  /* ---------------- boxes ---------------- */

  function pageBoxes(n) {
    if (!boxes.has(n)) boxes.set(n, []);
    return boxes.get(n);
  }

  function markedPages() {
    return [...boxes.keys()].filter((n) => boxes.get(n).length).sort((a, b) => a - b);
  }

  function addBox(n, box) {
    const list = pageBoxes(n);
    const same = list.some((b) => Math.abs(b.x - box.x) < 0.5 && Math.abs(b.y - box.y) < 0.5 && Math.abs(b.w - box.w) < 0.5 && Math.abs(b.h - box.h) < 0.5);
    if (!same) list.push(box);
    return !same;
  }

  function updateInfo() {
    const pages = markedPages();
    const count = pages.reduce((sum, n) => sum + boxes.get(n).length, 0);
    $("redactInfo").textContent = count
      ? `${count} area${count === 1 ? "" : "s"} marked on ${pages.length === 1 ? "page" : "pages"} ${T.formatPageRanges(pages)}.`
      : "Nothing marked yet.";
  }

  function renderBoxes() {
    overlay.querySelectorAll(".redact-box").forEach((el) => el.remove());
    if (!preview.width) return;
    pageBoxes(preview.pageNumber).forEach((box, i) => {
      const el = document.createElement("div");
      el.className = "redact-box";
      const css = preview.toCss(box.x, box.y + box.h);
      el.style.left = `${css.left}px`;
      el.style.top = `${css.top}px`;
      el.style.width = `${box.w * preview.scale}px`;
      el.style.height = `${box.h * preview.scale}px`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "redact-remove";
      remove.dataset.index = String(i);
      remove.setAttribute("aria-label", "Remove this box");
      remove.textContent = "×";
      el.appendChild(remove);
      overlay.appendChild(el);
    });
    updateInfo();
  }

  /* ---------------- drawing ---------------- */

  let drag = null;
  let draft = null;

  overlay.addEventListener("pointerdown", (e) => {
    if (!preview.width || locked) return;
    e.preventDefault();
    if (e.target.classList.contains("redact-remove")) {
      pageBoxes(preview.pageNumber).splice(Number(e.target.dataset.index), 1);
      renderBoxes();
      return;
    }
    overlay.setPointerCapture(e.pointerId);
    drag = { origin: preview.toPoint(e.clientX, e.clientY) };
    draft = document.createElement("div");
    draft.className = "redact-box redact-draft";
    overlay.appendChild(draft);
  });

  function dragRect(e) {
    const p = preview.toPoint(e.clientX, e.clientY);
    const o = drag.origin;
    return { x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) };
  }

  overlay.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = dragRect(e);
    const css = preview.toCss(r.x, r.y + r.h);
    draft.style.left = `${css.left}px`;
    draft.style.top = `${css.top}px`;
    draft.style.width = `${r.w * preview.scale}px`;
    draft.style.height = `${r.h * preview.scale}px`;
  });

  function endDrag(e, keep) {
    if (!drag) return;
    const r = dragRect(e);
    drag = null;
    if (draft) { draft.remove(); draft = null; }
    if (keep && r.w >= MIN && r.h >= MIN) addBox(preview.pageNumber, r);
    renderBoxes();
  }
  overlay.addEventListener("pointerup", (e) => endDrag(e, true));
  overlay.addEventListener("pointercancel", (e) => endDrag(e, false));

  /* ---------------- find text ---------------- */

  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
  const PHONE = /(?:\+|\b00)?\(?\d[\d ().\/-]{5,}\d/g;
  const DATE = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;

  function isPhone(text) {
    const digits = text.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15 && !DATE.test(text.trim());
  }

  /** Bounding box (visual points, origin bottom-left) of characters [from, to) of a text item. */
  function itemBox(item, from, to, viewport) {
    const [a, b, c, d, e, f] = item.transform;
    const len = item.str.length || 1;
    const dirLen = Math.hypot(a, b) || 1;
    const upLen = Math.hypot(c, d) || 1;
    const dir = [a / dirLen, b / dirLen];
    const fontH = item.height || upLen;
    const up = [(c / upLen) * fontH, (d / upLen) * fontH];
    // Character positions are estimated from the item's width, so pad by a
    // fraction of a character: covering a little too much is the safe side.
    const charW = item.width / len;
    const s = Math.max(0, (from - 0.35) * charW);
    const t = Math.min(item.width, (to + 0.35) * charW);
    const pts = [];
    for (const along of [s, t]) {
      for (const k of [-0.3, 1.05]) {
        const x = e + dir[0] * along + up[0] * k;
        const y = f + dir[1] * along + up[1] * k;
        const [vx, vy] = viewport.convertToViewportPoint(x, y);
        pts.push([vx, viewport.height - vy]);
      }
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs) - 0.5;
    const y = Math.min(...ys) - 0.5;
    return { x, y, w: Math.max(...xs) - x + 0.5, h: Math.max(...ys) - y + 0.5 };
  }

  async function findAndMark(makePattern, accept = () => true, label) {
    if (!pdf) {
      T.messages.warn("Please select a PDF file first.");
      return;
    }
    T.messages.clear();
    let found = 0;
    const pagesHit = new Set();
    T.busy("Searching…");
    try {
      for (let n = 1; n <= pageCount; n++) {
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!item.str || !item.width) continue;
          const re = makePattern();
          let m;
          while ((m = re.exec(item.str)) !== null) {
            if (!m[0].length) { re.lastIndex++; continue; }
            if (!accept(m[0])) continue;
            if (addBox(n, itemBox(item, m.index, m.index + m[0].length, viewport))) found++;
            pagesHit.add(n);
          }
        }
        page.cleanup();
      }
    } finally {
      T.idle();
    }
    renderBoxes();
    if (pagesHit.size) {
      T.messages.info(`Marked ${found} new match${found === 1 ? "" : "es"} for ${label} on ${pagesHit.size === 1 ? "page" : "pages"} ${T.formatPageRanges([...pagesHit].sort((a, b) => a - b))}. Check every page before saving.`);
    } else {
      T.messages.info(`No ${label} found in the PDF's text. Scanned pages have no text layer, so draw boxes by hand there.`);
    }
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  $("findBtn").addEventListener("click", () => {
    const text = $("findText").value.trim();
    if (!text) {
      T.messages.warn("Type the text you want to find first.");
      return;
    }
    const pattern = escapeRegExp(text).replace(/\s+/g, "\\s+");
    findAndMark(() => new RegExp(pattern, "gi"), undefined, `“${text}”`);
  });
  $("findText").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("findBtn").click(); }
  });
  $("findEmailsBtn").addEventListener("click", () => findAndMark(() => new RegExp(EMAIL.source, "gi"), undefined, "email addresses"));
  $("findPhonesBtn").addEventListener("click", () => findAndMark(() => new RegExp(PHONE.source, "g"), isPhone, "phone numbers"));

  $("clearPageBtn").addEventListener("click", () => {
    if (locked) return;
    boxes.delete(preview.pageNumber);
    renderBoxes();
  });
  $("clearAllBtn").addEventListener("click", () => {
    if (locked) return;
    boxes = new Map();
    renderBoxes();
  });

  /* ---------------- preview ---------------- */

  async function showPage(n) {
    T.busy("Rendering preview…");
    try {
      await preview.show(pdf, n);
      $("previewPageLabel").textContent = `Page ${n} of ${pageCount}`;
      renderBoxes();
    } finally {
      T.idle();
    }
  }
  $("prevPageBtn").addEventListener("click", () => { if (pdf && preview.pageNumber > 1) showPage(preview.pageNumber - 1); });
  $("nextPageBtn").addEventListener("click", () => { if (pdf && preview.pageNumber < pageCount) showPage(preview.pageNumber + 1); });

  /* ---------------- building the redacted file ---------------- */

  const N = (name) => PDFLib.PDFName.of(name);

  /**
   * Copying a page also copies everything it refers to. Drop the references
   * that can point at other pages (link targets, annotation parents, article
   * beads), so a redacted page can never come along with a kept one.
   */
  function detachPage(page) {
    const node = page.node;
    node.delete(N("B"));
    const annots = node.lookup(N("Annots"));
    if (!(annots instanceof PDFLib.PDFArray)) return;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFLib.PDFDict)) continue;
      ["P", "Parent", "Popup", "IRT", "Dest"].forEach((key) => annot.delete(N(key)));
      const action = annot.lookup(N("A"));
      const kind = action instanceof PDFLib.PDFDict ? action.lookup(N("S")) : null;
      if (action && kind !== N("URI")) annot.delete(N("A"));
    }
  }

  /** Remove any page object (and its content) that is in the file but not one of its pages. */
  function dropStrayPages(doc) {
    const kept = new Set(doc.getPages().map((p) => p.ref.toString()));
    const stray = [];
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFLib.PDFDict && obj.get(N("Type")) === N("Page") && !kept.has(ref.toString())) stray.push([ref, obj]);
    }
    for (const [ref, obj] of stray) {
      const contents = obj.get(N("Contents"));
      const refs = contents instanceof PDFLib.PDFArray ? contents.asArray() : [contents];
      refs.forEach((r) => { if (r instanceof PDFLib.PDFRef) doc.context.delete(r); });
      doc.context.delete(ref);
    }
    return stray.length;
  }

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        if (pdf) { pdf.release(); pdf = null; }
        boxes = new Map();
        $("previewWrapper").classList.add("d-none");
        $("redactInfo").textContent = "";
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
    busyText: "Redacting…",
    reset() {
      if (pdf) { pdf.release(); pdf = null; }
      boxes = new Map();
      pageCount = 0;
      locked = false;
      $("previewWrapper").classList.add("d-none");
      $("findText").value = "";
      $("redactDpi").value = "200";
      $("redactAll").checked = false;
      $("redactInfo").textContent = "";
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file || !pdf) throw new T.ToolError("Please select a PDF file first.");
      const everyPage = $("redactAll").checked;
      const marked = new Set(markedPages());
      if (!marked.size && !everyPage) {
        throw new T.ToolError("Nothing is marked yet. Drag a box over what you want to hide, or use “Find and mark”.");
      }

      handler.lock();
      locked = true;
      const dpi = Number($("redactDpi").value) || 200;
      const rasterise = (n) => everyPage || marked.has(n);
      const keep = [];
      for (let n = 1; n <= pageCount; n++) if (!rasterise(n)) keep.push(n);

      const out = await T.createPdf();
      let copied = [];
      if (keep.length) {
        const src = await T.loadPdf(file);
        const srcPages = src.getPages();
        keep.forEach((n) => detachPage(srcPages[n - 1]));
        copied = await out.copyPages(src, keep.map((n) => n - 1));
      }

      let k = 0;
      for (let n = 1; n <= pageCount; n++) {
        if (!rasterise(n)) {
          out.addPage(copied[k++]);
          continue;
        }
        T.busy(`Redacting page ${n} of ${pageCount}…`);
        await T.nextFrame();
        try {
          const { canvas, width, height } = await T.renderPage(pdf, n, dpi);
          const ctx = canvas.getContext("2d");
          const sx = canvas.width / width;
          const sy = canvas.height / height;
          ctx.fillStyle = "#000";
          (boxes.get(n) || []).forEach((b) => {
            ctx.fillRect(Math.floor(b.x * sx), Math.floor((height - b.y - b.h) * sy), Math.ceil(b.w * sx) + 1, Math.ceil(b.h * sy) + 1);
          });
          const jpg = await out.embedJpg(await T.canvasToBytes(canvas, "image/jpeg", 0.92));
          canvas.width = canvas.height = 0;
          const page = out.addPage([width, height]);
          page.drawImage(jpg, { x: 0, y: 0, width, height });
        } finally {
          T.idle();
        }
      }

      dropStrayPages(out);
      const bytes = await out.save();
      const count = everyPage ? pageCount : marked.size;
      const areas = [...marked].reduce((sum, n) => sum + boxes.get(n).length, 0);
      const rebuilt = `${count} page${count === 1 ? " was" : "s were"} rebuilt as image${count === 1 ? "" : "s"}`;
      T.finish(bytes, T.makeFilename(file.name, "redacted"), {
        note: `${areas ? `Blacked out ${areas} area${areas === 1 ? "" : "s"}; ` : ""}${rebuilt}. Open the file and check every page before you share it.`,
      });
    },
  });
})();
