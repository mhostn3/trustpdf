(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const MM = 72 / 25.4;
  const SIZES = {
    a4: [210 * MM, 297 * MM],
    letter: [8.5 * 72, 11 * 72],
  };

  function isPng(file) {
    return file.type === "image/png" || /\.png$/i.test(file.name);
  }

  /* ---------------- JPEG: hidden data and orientation ---------------- */

  /** The Orientation tag (1-8) of an EXIF block ("Exif\0\0" + TIFF); 1 when absent or unreadable. */
  function exifOrientation(seg) {
    try {
      if (seg.length < 14 || String.fromCharCode(...seg.subarray(0, 4)) !== "Exif") return 1;
      const view = new DataView(seg.buffer, seg.byteOffset + 6, seg.length - 6);
      const little = view.getUint16(0) === 0x4949;
      const ifd = view.getUint32(4, little);
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
    } catch (_) { /* a damaged EXIF block: treat the photo as upright */ }
    return 1;
  }

  /**
   * A JPEG is written into the PDF as it is, so everything in the file would
   * travel with it: EXIF (camera, date, often the GPS position), XMP, IPTC,
   * comments, the preview picture, and whatever a phone appends after the
   * image (a depth map, the video of a "motion photo"). This returns the same
   * picture, bit for bit, without those parts, and the orientation the EXIF
   * block asked for, which PDF readers do not apply by themselves.
   * Returns null when the bytes are not a JPEG this reads with confidence;
   * the caller then uses the file unchanged.
   */
  function cleanJpeg(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const parts = [bytes.subarray(0, 2)];
    let orientation = 1;
    let at = 2;
    for (;;) {
      if (at + 4 > bytes.length || bytes[at] !== 0xff) return null;
      while (bytes[at + 1] === 0xff) at += 1; // fill bytes before a marker
      const marker = bytes[at + 1];
      if (marker === 0xda) break; // start of scan: the picture data follows
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker <= 0x01) return null;
      const length = (bytes[at + 2] << 8) | bytes[at + 3];
      if (length < 2 || at + 2 + length > bytes.length) return null;
      const data = bytes.subarray(at + 4, at + 2 + length);
      const tag = String.fromCharCode(...data.subarray(0, 12));
      if (marker === 0xe1 && tag.startsWith("Exif")) orientation = exifOrientation(data);
      // Kept: everything needed to decode the picture and show its colours right
      // (JFIF header, ICC colour profile, Adobe colour marker). Dropped: the other
      // application blocks (E1 EXIF/XMP, ED IPTC, maker notes...) and comments.
      const app = marker >= 0xe0 && marker <= 0xef;
      const keep = !(app || marker === 0xfe) || marker === 0xe0 || marker === 0xee || (marker === 0xe2 && tag.startsWith("ICC_PROFILE"));
      if (keep) parts.push(bytes.subarray(at, at + 2 + length));
      at += 2 + length;
    }
    // Picture data: up to the end-of-image marker; what a phone appends after it is left out.
    const scan = at;
    let end = -1;
    for (let i = scan + 2; i + 1 < bytes.length; i++) {
      if (bytes[i] !== 0xff) continue;
      const m = bytes[i + 1];
      if (m === 0xd9) { end = i + 2; break; }
      if (m === 0x00 || m === 0xff || (m >= 0xd0 && m <= 0xd7)) continue; // data, fill, restart
      // A segment between scans of a progressive JPEG (tables, the next scan header).
      if (i + 3 >= bytes.length) break;
      i += 1 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    parts.push(bytes.subarray(scan, end > 0 ? end : bytes.length));
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return { bytes: out, orientation };
  }

  /** Embed one file; returns { image, orientation } (orientation is the EXIF value, 1 = upright). */
  async function embed(doc, file) {
    const original = new Uint8Array(await file.arrayBuffer());
    const jpeg = cleanJpeg(original);
    const bytes = jpeg ? jpeg.bytes : original;
    const orientation = jpeg ? jpeg.orientation : 1;
    const asJpg = jpeg !== null || !isPng(file);
    try {
      return { image: asJpg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes), orientation };
    } catch (error) {
      // Extension and content may disagree, or the cleaned copy is not readable:
      // try the file as it is with both decoders before giving up.
      for (const read of [() => doc.embedJpg(original), () => doc.embedPng(original)]) {
        try {
          return { image: await read(), orientation: 1 };
        } catch (_) { /* try the next one */ }
      }
      throw new T.ToolError(`${file.name} could not be read as a JPG or PNG image.`);
    }
  }

  /**
   * Draw `image` into the box (x, y, w, h) the way its EXIF orientation says it
   * should be seen. A phone held upright stores the picture lying on its side
   * plus a note to turn it; browsers follow the note, PDF readers need it done.
   */
  function drawOriented(page, image, orientation, { x, y, w, h }) {
    // [a b c d e f] maps the image's unit square into the box.
    const matrix = {
      1: [w, 0, 0, h, x, y],
      2: [-w, 0, 0, h, x + w, y],
      3: [-w, 0, 0, -h, x + w, y + h],
      4: [w, 0, 0, -h, x, y + h],
      5: [0, -h, -w, 0, x + w, y + h],
      6: [0, -h, w, 0, x, y + h],
      7: [0, h, w, 0, x, y],
      8: [0, h, -w, 0, x + w, y],
    }[orientation];
    const name = page.node.newXObject("Image", image.ref);
    page.pushOperators(
      PDFLib.pushGraphicsState(),
      PDFLib.concatTransformationMatrix(...matrix),
      PDFLib.drawObject(name),
      PDFLib.popGraphicsState(),
    );
  }

  const handler = T.initTool({
    files: { multiple: true, sortable: true, accept: "image", fileListId: "fileList", totalSizeId: "totalSize" },
    busyText: "Creating PDF…",
    reset() {
      $("pageSize").value = "image";
      $("pageMargin").value = "0";
    },

    async process() {
      const files = handler.getFiles();
      if (!files.length) throw new T.ToolError("Please add at least one JPG or PNG image.");

      handler.lock();

      const sizeMode = $("pageSize").value;
      const margin = Number($("pageMargin").value) * MM;
      const doc = await T.createPdf();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        T.busy(`Adding image ${i + 1} of ${files.length}: ${file.name}`);
        await T.nextFrame();
        try {
          const { image, orientation } = await embed(doc, file);
          // Width and height as the picture is seen: orientations 5-8 lie on their side.
          const turned = orientation >= 5;
          const iw = turned ? image.height : image.width;
          const ih = turned ? image.width : image.height;

          if (sizeMode === "image") {
            const page = doc.addPage([iw + 2 * margin, ih + 2 * margin]);
            drawOriented(page, image, orientation, { x: margin, y: margin, w: iw, h: ih });
          } else {
            let [w, h] = SIZES[sizeMode];
            if (iw > ih && w < h) [w, h] = [h, w];
            const page = doc.addPage([w, h]);
            const scale = Math.min((w - 2 * margin) / iw, (h - 2 * margin) / ih);
            const dw = iw * scale;
            const dh = ih * scale;
            drawOriented(page, image, orientation, { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh });
          }
        } finally {
          T.idle();
        }
      }

      const bytes = await doc.save();
      T.finish(bytes, T.makeFilename(files.length === 1 ? files[0].name : "images", files.length === 1 ? "" : `${files.length}-images`), {
        note: `Created a PDF with ${files.length} page${files.length === 1 ? "" : "s"}.`,
      });
    },
  });
})();
