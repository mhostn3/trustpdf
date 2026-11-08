(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  /* ================= text analysis ================= */

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      // Control characters are not allowed in XML.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  }

  /** Group PDF.js text items into lines, then lines into paragraphs. */
  function analysePage(content) {
    const styles = content.styles || {};
    const runs = [];
    for (const item of content.items) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const [a, b, c, d, x, y] = item.transform;
      const size = Math.hypot(b, d) || item.height || 10;
      const family = (styles[item.fontName] && styles[item.fontName].fontFamily) || item.fontName || "";
      const name = `${item.fontName} ${family}`.toLowerCase();
      runs.push({
        text: item.str,
        x, y, size,
        width: item.width || 0,
        bold: /bold|black|heavy|semibold|demi/.test(name),
        italic: /italic|oblique/.test(name),
        vertical: Math.abs(a) < Math.abs(b), // rotated text
      });
    }
    if (!runs.length) return [];

    // Lines: runs sharing a baseline.
    runs.sort((p, q) => q.y - p.y || p.x - q.x);
    const lines = [];
    for (const run of runs) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line.y - run.y) <= Math.max(2, run.size * 0.35)) {
        line.runs.push(run);
      } else {
        lines.push({ y: run.y, runs: [run] });
      }
    }
    for (const line of lines) {
      line.runs.sort((p, q) => p.x - q.x);
      line.size = Math.max(...line.runs.map((r) => r.size));
      line.x = line.runs[0].x;
      line.right = Math.max(...line.runs.map((r) => r.x + r.width));
      // Insert spaces between runs that are visibly apart.
      let text = "";
      let lastEnd = null;
      for (const r of line.runs) {
        if (lastEnd !== null && r.x - lastEnd > r.size * 0.2 && !text.endsWith(" ") && !r.text.startsWith(" ")) text += " ";
        text += r.text;
        lastEnd = r.x + r.width;
      }
      line.text = text.replace(/\s+/g, " ").trim();
    }

    // Body size = size of most characters; headings are clearly larger.
    const sizeChars = new Map();
    for (const line of lines) sizeChars.set(Math.round(line.size), (sizeChars.get(Math.round(line.size)) || 0) + line.text.length);
    const bodySize = [...sizeChars.entries()].sort((p, q) => q[1] - p[1])[0][0];

    // Paragraphs: a bigger gap, a size change, or a new indent starts a new one.
    const paragraphs = [];
    let prev = null;
    for (const line of lines) {
      const gap = prev ? prev.y - line.y : 0;
      const sameSize = prev && Math.abs(prev.size - line.size) < 1;
      const prevEndsSentence = prev && /[.!?:]["”')]?$/.test(prev.text);
      const prevShort = prev && prev.right < line.right - line.size * 4; // previous line stopped early
      const newPara = !prev || gap > line.size * 1.6 || !sameSize || line.x > prev.x + line.size * 1.2 || (prevShort && prevEndsSentence);
      if (newPara) {
        const level = line.size >= bodySize * 1.6 ? 1 : line.size >= bodySize * 1.25 ? 2 : 0;
        paragraphs.push({ lines: [line], size: line.size, level, bold: line.runs.every((r) => r.bold), italic: line.runs.every((r) => r.italic) });
      } else {
        paragraphs[paragraphs.length - 1].lines.push(line);
      }
      prev = line;
    }
    for (const p of paragraphs) {
      let text = "";
      for (const line of p.lines) {
        if (text.endsWith("-") && /^[a-z]/.test(line.text)) text = text.slice(0, -1) + line.text; // de-hyphenate
        else text += (text ? " " : "") + line.text;
      }
      p.text = text;
    }
    return paragraphs;
  }

  /* ================= docx writing ================= */

  function paragraphXml(p) {
    const pPr = p.level ? `<w:pPr><w:pStyle w:val="Heading${p.level}"/></w:pPr>` : "";
    const rPr = [];
    if (p.bold && !p.level) rPr.push("<w:b/>");
    if (p.italic) rPr.push("<w:i/>");
    if (!p.level) rPr.push(`<w:sz w:val="${Math.round(Math.max(8, Math.min(p.size, 72)) * 2)}"/>`);
    const rp = rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : "";
    return `<w:p>${pPr}<w:r>${rp}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
  }

  function imageXml(relId, index, widthEmu, heightEmu) {
    return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="${index}" name="Page ${index}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index}" name="page${index}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  function buildDocx({ bodyParts, pageWidthPt, pageHeightPt, images, title }) {
    const twips = (pt) => Math.round(pt * 20);
    const margin = twips(56.7); // 2 cm
    const landscape = pageWidthPt > pageHeightPt;
    const sectPr = `<w:sectPr><w:pgSz w:w="${twips(pageWidthPt)}" w:h="${twips(pageHeightPt)}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${bodyParts.join("")}${sectPr}</w:body></w:document>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;

    const imageRels = images.map((img, i) => `<Relationship Id="${img.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${i + 1}.jpg"/>`).join("");
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRels}</Relationships>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator></dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

    const enc = (s) => new TextEncoder().encode(s);
    const zip = new T.Zip();
    zip.add("[Content_Types].xml", enc(contentTypes));
    zip.add("_rels/.rels", enc(rels));
    zip.add("word/document.xml", enc(document));
    zip.add("word/styles.xml", enc(styles));
    zip.add("word/_rels/document.xml.rels", enc(docRels));
    zip.add("docProps/core.xml", enc(core));
    images.forEach((img, i) => zip.add(`word/media/page${i + 1}.jpg`, img.bytes));
    return zip.build();
  }

  /* ================= tool ================= */

  const handler = T.initTool({
    files: { multiple: false, accept: "pdf" },
    busyText: "Converting…",
    reset() {
      $("wordMode").value = "text";
      $("pageBreaks").checked = true;
      $("pages").value = "";
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");

      const pdf = await T.openWithPdfjs(file);
      try {
        const total = pdf.numPages;
        const input = $("pages").value.trim();
        const targets = input ? T.parsePageRanges(input, total) : Array.from({ length: total }, (_, i) => i + 1);
        if (!targets.length) throw new T.ToolError("Please choose the pages to convert, or leave the field empty for all pages.");

        handler.lock();
        const mode = $("wordMode").value;
        const breaks = $("pageBreaks").checked;
        const first = await pdf.getPage(targets[0]);
        const vp = first.getViewport({ scale: 1 });
        first.cleanup();

        const bodyParts = [];
        const images = [];
        let chars = 0;
        let paragraphCount = 0;

        for (let i = 0; i < targets.length; i++) {
          const n = targets[i];
          T.busy(`Converting page ${n} (${i + 1} of ${targets.length})…`);
          await T.nextFrame();
          try {
            if (i > 0 && (breaks || mode === "images")) bodyParts.push(PAGE_BREAK);
            if (mode === "images") {
              const { canvas, width, height } = await T.renderPage(pdf, n, 150);
              const bytes = await T.canvasToBytes(canvas, "image/jpeg", 0.85);
              canvas.width = canvas.height = 0;
              const relId = `rIdImg${i + 1}`;
              images.push({ relId, bytes });
              const usable = (vp.width - 2 * 56.7);
              const scale = Math.min(1, usable / width, (vp.height - 2 * 56.7) / height);
              const emu = (pt) => Math.round(pt * scale * 12700);
              bodyParts.push(imageXml(relId, i + 1, emu(width), emu(height)));
              chars += 1;
            } else {
              const page = await pdf.getPage(n);
              const content = await page.getTextContent();
              page.cleanup();
              const paragraphs = analysePage(content);
              for (const p of paragraphs) {
                bodyParts.push(paragraphXml(p));
                chars += p.text.length;
                paragraphCount += 1;
              }
            }
          } finally {
            T.idle();
          }
        }

        if (!chars) {
          throw new T.ToolError("No text was found. This PDF is probably a scan; run it through OCR PDF first, or choose “Page images” to keep the pages as pictures.");
        }

        const bytes = buildDocx({ bodyParts, pageWidthPt: vp.width, pageHeightPt: vp.height, images, title: T.makeFilename(file.name, "", "docx").replace(/\.docx$/, "") });
        T.finish(bytes, T.makeFilename(file.name, "", "docx"), {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          note: mode === "images"
            ? `Created a Word document with ${targets.length} page image${targets.length === 1 ? "" : "s"}.`
            : `Converted ${targets.length} page${targets.length === 1 ? "" : "s"} into ${paragraphCount} paragraph${paragraphCount === 1 ? "" : "s"} (${chars.toLocaleString()} characters).`,
        });
      } finally {
        pdf.release();
      }
    },
  });
})();
