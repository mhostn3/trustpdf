/*
  TrustPDF worker: the heavy pdf-lib work of Merge, Split and Compress runs
  here, off the main thread, so a large file does not freeze the page.

  Like everything else on the site this runs in the visitor's browser; a
  worker has no more network access than the page (same Content-Security-Policy).

  Protocol:
    page   -> { op, pdflib: <url of pdf-lib.min.js>, ...payload }
    worker -> { progress: { index, total } }   (zero or more)
    worker -> { result: ... }  or  { error: { name, message, index } }
*/
"use strict";

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

async function createPdf() {
  const doc = await PDFLib.PDFDocument.create();
  doc.setProducer("TrustPDF (pdf-lib)");
  doc.setCreator("TrustPDF");
  return doc;
}

const load = (buffer) => PDFLib.PDFDocument.load(new Uint8Array(buffer), { updateMetadata: false });

const OPS = {
  /** buffers: ArrayBuffer[] in merge order -> { bytes, pages } */
  async merge({ buffers }) {
    const merged = await createPdf();
    for (let i = 0; i < buffers.length; i++) {
      self.postMessage({ progress: { index: i, total: buffers.length } });
      try {
        const source = await load(buffers[i]);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
        if (i === 0) copyMetadata(source, merged);
      } catch (error) {
        error.index = i;
        throw error;
      }
      buffers[i] = null; // free each input as soon as it is copied
    }
    const bytes = await merged.save();
    return { result: { bytes, pages: merged.getPageCount() }, transfer: [bytes.buffer] };
  },

  /** pages: 1-based page numbers; each=true gives one PDF per page -> { files: [bytes] } */
  async split({ buffer, pages, each }) {
    const source = await load(buffer);
    const groups = each ? pages.map((n) => [n]) : [pages];
    const files = [];
    for (let i = 0; i < groups.length; i++) {
      if (each) self.postMessage({ progress: { index: i, total: groups.length } });
      const doc = await createPdf();
      copyMetadata(source, doc);
      const copied = await doc.copyPages(source, groups[i].map((n) => n - 1));
      copied.forEach((page) => doc.addPage(page));
      files.push(await doc.save());
    }
    return { result: { files, total: source.getPageCount() }, transfer: files.map((f) => f.buffer) };
  },

  /** Rewrite the file structure compactly; nothing visible changes. */
  async compress({ buffer }) {
    const doc = await load(buffer);
    const bytes = await doc.save({ useObjectStreams: true });
    return { result: { bytes }, transfer: [bytes.buffer] };
  },

  /** Page count, to validate a page selection before the real work. */
  async count({ buffer }) {
    return { result: { pages: (await load(buffer)).getPageCount() }, transfer: [] };
  },
};

self.onmessage = async (event) => {
  const { op, pdflib, ...payload } = event.data;
  try {
    if (typeof PDFLib === "undefined") importScripts(pdflib);
    const { result, transfer } = await OPS[op](payload);
    self.postMessage({ result }, transfer);
  } catch (error) {
    self.postMessage({
      error: { name: (error && error.name) || "Error", message: String((error && error.message) || error), index: error && error.index },
    });
  }
};
