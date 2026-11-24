// Browser smoke test: every tool processes a fixture and produces a download.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const FIX = path.join(__dirname, "fixtures");
const OUT = path.join(__dirname, "output");
fs.mkdirSync(OUT, { recursive: true });

// Inspect the produced PDF inside the page with pdf-lib (output uses compressed object streams).
let page;
// Merge and Split do their pdf-lib work in a worker, so those pages do not load pdf-lib themselves.
const needPdfLib = async () => {
  if (!(await page.evaluate(() => typeof PDFLib !== "undefined"))) await page.addScriptTag({ url: `${BASE}/static/js/pdf-lib.min.js` });
};
const inspect = async () => { await needPdfLib(); return page.evaluate(async () => {
  const d = await PDFLib.PDFDocument.load(TrustPDF.download.bytes, { updateMetadata: false });
  return { pages: d.getPageCount(), title: d.getTitle() || "", author: d.getAuthor() || "",
           producer: d.getProducer() || "", xmp: d.catalog.has(PDFLib.PDFName.of("Metadata")),
           rotations: d.getPages().map((p) => p.getRotation().angle) };
}); };

// Text of each page of a produced PDF, read with PDF.js in a page that has it loaded.
async function pageText(file) {
  const b64 = fs.readFileSync(file).toString("base64");
  const p = await page.context().newPage();
  await p.goto(`${BASE}/tools/pdf-to-text/`);
  const result = await p.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const pdf = await TrustPDF.openWithPdfjs(bytes);
    const out = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const c = await (await pdf.getPage(n)).getTextContent();
      out.push(c.items.map((i) => i.str).join(" "));
    }
    return out;
  }, b64);
  await p.close();
  return result;
}

// Every stream in a PDF, inflated where it is compressed, plus the raw bytes:
// what anyone could dig out of the file, referenced by a page or not.
function allPdfText(buf) {
  const parts = [buf.toString("latin1")];
  let at = 0;
  for (;;) {
    const start = buf.indexOf("stream", at);
    if (start < 0) break;
    let body = start + 6;
    if (buf[body] === 0x0d) body++;
    if (buf[body] === 0x0a) body++;
    const end = buf.indexOf("endstream", body);
    if (end < 0) break;
    try { parts.push(zlib.inflateSync(buf.subarray(body, end)).toString("latin1")); } catch (_) { /* not flate */ }
    at = end + 9;
  }
  return parts.join("\n");
}

// ONLY=redact node tests/e2e/smoke.js runs just the tests whose name contains "redact".
const ONLY = process.env.ONLY || "";

async function run(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  process.stdout.write(`${name.padEnd(40)}`);
  try {
    const result = await fn();
    console.log("OK", result || "");
  } catch (e) {
    console.log("FAIL", e.message.split("\n")[0]);
    process.exitCode = 1;
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 } });
  page = await context.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console (${page.url()}): ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

  async function open(tool) {
    await page.goto(`${BASE}/tools/${tool}/`, { waitUntil: "load" });
  }
  async function download() {
    await page.locator("#downloadArea").waitFor({ state: "visible", timeout: 30000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#downloadBtn")]);
    const file = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(file);
    return { file, buf: fs.readFileSync(file), name: dl.suggestedFilename() };
  }
  async function waitIdle() {
    await page.locator("#busyIndicator").waitFor({ state: "hidden" });
  }

  await run("keyboard: drop zone focus + enter", async () => {
    await open("merge-pdf");
    await page.waitForFunction(() => window.TrustPDF && TrustPDF.fileHandler);
    await page.waitForLoadState("load");
    await page.waitForTimeout(300);
    // Headless Chromium sometimes drops the first synthetic key press on a fresh page; a person would just press again.
    let chooser;
    for (let attempt = 0; attempt < 4 && !chooser; attempt++) {
      await page.focus("#dropZone");
      [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
        page.keyboard.press("Enter"),
      ]);
    }
    if (!chooser) throw new Error("Enter on the drop zone did not open the file chooser");
    return chooser.isMultiple() ? "file chooser opened (multiple)" : "opened";
  });

  await run("merge", async () => {
    await open("merge-pdf");
    await page.setInputFiles("#fileInput", [path.join(FIX, "five pages.pdf"), path.join(FIX, "three.pdf")]);
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 8) throw new Error(`expected 8 pages, got ${i.pages}`);
    return `${d.name} title=${i.title} producer=${i.producer}`;
  });

  await run("merge: start again + re-add same file", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", [path.join(FIX, "three.pdf")]);
    const items = await page.locator("#fileList li").count();
    if (items !== 1) throw new Error(`expected 1 item, got ${items}`);
  });

  await run("merge: not a pdf -> error, button back", async () => {
    await page.goto(`${BASE}/tools/merge-pdf/`);
    await page.setInputFiles("#fileInput", [path.join(FIX, "not-a-pdf.pdf")]);
    await page.click("#processBtn");
    await page.locator("#toolMessage .alert-danger").waitFor();
    const text = await page.locator("#toolMessage").innerText();
    const enabled = await page.locator("#processBtn").isEnabled();
    if (!enabled) throw new Error("process button not re-enabled");
    return text.slice(0, 60);
  });

  await run("merge: after an error the bad file can be removed and the run repeated", async () => {
    await page.locator("#fileList li button").click();  // Remove is back
    await page.setInputFiles("#fileInput", [path.join(FIX, "three.pdf")]);
    await page.click("#processBtn");
    await download();
    const i = await inspect(); if (i.pages !== 3) throw new Error(`expected 3 pages, got ${i.pages}`);
  });

  await run("split: click thumbnails", async () => {
    await open("split-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await waitIdle();
    await page.locator("#pageGrid li").nth(1).click();
    await page.locator("#pageGrid li").nth(3).click();
    const val = await page.inputValue("#pages");
    if (val !== "2,4") throw new Error(`pages field = ${val}`);
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 2) throw new Error(`expected 2 pages, got ${i.pages}`);
    return d.name;
  });

  await run("split: typed range + out of range", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.fill("#pages", "1-999999999");
    const selected = await page.locator("#pageGrid li.selected").count();
    if (selected !== 3) throw new Error(`expected 3 selected, got ${selected}`);
    await page.fill("#pages", "9-12");
    await page.click("#processBtn");
    await page.locator("#toolMessage .alert-danger").waitFor();
    return (await page.locator("#toolMessage").innerText()).slice(0, 70);
  });

  await run("split: each page to zip", async () => {
    await page.fill("#pages", "1,3");
    await page.check("#splitEach");
    await page.click("#processBtn");
    const d = await download();
    if (d.buf.slice(0, 2).toString() !== "PK") throw new Error("not a zip");
    return `${d.name} ${d.buf.length}B`;
  });

  await run("rotate: all pages", async () => {
    await open("rotate-pdf-pages");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.selectOption("#rotationAngle", "180");
    const cls = await page.locator("#pageGrid li").first().getAttribute("class");
    if (!cls.includes("rotate-180")) throw new Error("no rotation preview");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (String(i.rotations) !== "180,180,180") throw new Error("rotations " + i.rotations);
    return d.name;
  });

  await run("remove: pages 1-2", async () => {
    await open("remove-pdf-pages");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await waitIdle();
    await page.fill("#pages", "1-2");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 3) throw new Error(`expected 3 pages, got ${i.pages}`);
    return d.name;
  });

  await run("remove: all pages refused", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.click("#selectAllBtn");
    await page.click("#processBtn");
    await page.locator("#toolMessage .alert-danger").waitFor();
    return (await page.locator("#toolMessage").innerText()).slice(0, 50);
  });

  await run("reorder: reverse", async () => {
    await open("reorder-pdf-pages");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.locator("#pageGrid canvas").first().waitFor();
    await page.click("#reverseBtn");
    const first = await page.locator("#pageGrid li").first().getAttribute("data-page-number");
    if (first !== "3") throw new Error("reverse failed");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 3) throw new Error("page count");
    return d.name;
  });

  await run("metadata viewer", async () => {
    await open("pdf-metadata-viewer");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await page.click("#processBtn");
    await page.locator("#metadataResult").waitFor({ state: "visible" });
    const text = await page.locator("#metadataResult").innerText();
    if (!text.includes("Fixture Producer")) throw new Error("producer overwritten: " + text.slice(0, 200));
    if (!text.includes("Present")) throw new Error("XMP not detected");
    if (!text.includes("Fixture Company")) throw new Error("custom Info entry not shown");
    return "producer preserved, XMP detected, custom entry shown";
  });

  await run("metadata editor: strip all", async () => {
    await open("pdf-metadata-editor");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await waitIdle();
    const title = await page.inputValue("#pdfTitle");
    if (title !== "Five Pages") throw new Error("title not prefilled: " + title);
    await page.click("#clearAllBtn");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect();
    if (i.title || i.author || i.producer || i.xmp) throw new Error("metadata still present " + JSON.stringify(i));
    // Not only unlinked: the XMP stream and the non-standard entries must be gone from the bytes.
    const left = allPdfText(d.buf).match(/Hidden XMP Author|Fixture (Author|Producer|Company)|CreationDate|ModDate/);
    if (left) throw new Error(`"${left[0]}" is still in the file`);
    return d.name;
  });

  await run("metadata editor: changing the title keeps other entries and says so", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await waitIdle();
    await page.fill("#pdfTitle", "New Title");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect();
    if (i.title !== "New Title" || i.author !== "Fixture Author") throw new Error(JSON.stringify(i));
    const all = allPdfText(d.buf);
    if (/Hidden XMP Author/.test(all)) throw new Error("the XMP stream is still in the file");
    if (!/Fixture Company/.test(all)) throw new Error("the custom entry was removed without being asked");
    const note = await page.locator("#toolMessage").innerText();
    if (!/1 other entry was kept/.test(note)) throw new Error("note: " + note);
    return d.name;
  });

  await run("images to pdf (A4)", async () => {
    await open("images-to-pdf");
    await page.setInputFiles("#fileInput", [path.join(FIX, "photo.jpg"), path.join(FIX, "tall.png")]);
    await page.selectOption("#pageSize", "a4");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 2) throw new Error("page count " + i.pages);
    return d.name;
  });

  await run("images to pdf: phone photo is upright and carries no EXIF, comment or trailer", async () => {
    await open("images-to-pdf");
    await page.setInputFiles("#fileInput", [path.join(FIX, "phone-photo.jpg")]);
    await page.click("#processBtn");
    const d = await download();
    const left = allPdfText(d.buf).match(/SECRETCAM|SECRETCOMMENT|TRAILERSECRET|Exif/);
    if (left) throw new Error(`"${left[0]}" is still in the file`);
    const size = await page.evaluate(async () => (await PDFLib.PDFDocument.load(TrustPDF.download.bytes)).getPage(0).getSize());
    if (size.width !== 200 || size.height !== 400) throw new Error(`page is ${size.width} x ${size.height}, expected 200 x 400`);
    // The red block is at the top left of the stored pixels: top right once upright.
    const b64 = d.buf.toString("base64");
    const p = await page.context().newPage();
    await p.goto(`${BASE}/tools/pdf-to-jpg/`);
    const px = await p.evaluate(async (data) => {
      const pdf = await TrustPDF.openWithPdfjs(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      const { canvas } = await TrustPDF.renderPage(pdf, 1, 72);
      const at = (x, y) => Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3));
      return { topRight: at(150, 50), topLeft: at(50, 50), bottomRight: at(150, 350) };
    }, b64);
    await p.close();
    const red = ([r, g, b]) => r > 180 && g < 80 && b < 80;
    if (!red(px.topRight) || red(px.topLeft) || red(px.bottomRight)) throw new Error("orientation " + JSON.stringify(px));
    return `${d.name} ${size.width}x${size.height}`;
  });

  await run("jpg to pdf landing page", async () => {
    await open("jpg-to-pdf");
    if ((await page.locator("h1").innerText()) !== "JPG to PDF") throw new Error("heading");
    await page.setInputFiles("#fileInput", [path.join(FIX, "photo.jpg")]);
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 1) throw new Error("page count " + i.pages);
    return d.name;
  });

  await run("pdf to png landing page: PNG preselected", async () => {
    await open("pdf-to-png");
    if ((await page.inputValue("#imgFormat")) !== "png") throw new Error("format not preset");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.fill("#pages", "1");
    await page.click("#processBtn");
    const d = await download();
    if (d.buf.slice(1, 4).toString() !== "PNG") throw new Error("not a png");
    await page.click("#startAgainBtn");
    if ((await page.inputValue("#imgFormat")) !== "png") throw new Error("start again lost the preset");
    return d.name;
  });

  await run("redact: draw/remove box, find text, no leaks", async () => {
    await open("redact-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "redact.pdf"));
    await waitIdle();
    await page.locator("#previewCanvas").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const canvas = await page.locator("#previewCanvas").boundingBox();
    await page.mouse.move(canvas.x + 60, canvas.y + 200);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 200, canvas.y + 260, { steps: 5 });
    await page.mouse.up();
    if ((await page.locator(".redact-box").count()) !== 1) throw new Error("drawn box missing");
    await page.locator(".redact-remove").dispatchEvent("pointerdown");
    if ((await page.locator(".redact-box").count()) !== 0) throw new Error("box not removed");

    await page.fill("#findText", "secret-account");
    await page.click("#findBtn");
    await waitIdle();
    const info = await page.locator("#redactInfo").innerText();
    if (!/1 area marked on page 2/.test(info)) throw new Error("find: " + info);
    await page.click("#findEmailsBtn");
    await waitIdle();
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 3) throw new Error("pages " + i.pages);
    const text = await pageText(d.file);
    if (!/Intro/.test(text[0]) || text[1].trim() !== "" || !/Public/.test(text[2])) throw new Error("text " + JSON.stringify(text));
    const everything = allPdfText(d.buf);
    if (/SECRET|jane\.doe|Fixture/.test(everything)) throw new Error("redacted text is still in the file");
    const pageObjects = (everything.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    if (pageObjects !== 3) throw new Error(`${pageObjects} page objects in the file`);
    return `${d.name}; ${info}`;
  });

  await run("redact: shared resources do not carry a redacted page along", async () => {
    await open("redact-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "redact-shared.pdf"));
    await waitIdle();
    await page.fill("#findText", "shared-secret");
    await page.click("#findBtn");
    await waitIdle();
    const info = await page.locator("#redactInfo").innerText();
    if (!/1 area marked on page 2/.test(info)) throw new Error("find: " + info);
    await page.click("#processBtn");
    const d = await download();
    const text = await pageText(d.file);
    if (!/intro/i.test(text[0]) || text[1].trim() !== "" || !/public/i.test(text[2])) throw new Error("text " + JSON.stringify(text));
    if (/SHARED-SECRET|lee@example/.test(allPdfText(d.buf))) throw new Error("redacted text is still in the file");
    return d.name;
  });

  await run("redact: a button that lists a form field does not carry its value along", async () => {
    await open("redact-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "redact-form.pdf"));
    await waitIdle();
    await page.click("#nextPageBtn");
    await waitIdle();
    const box = await page.locator("#previewOverlay").boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 4 });
    await page.mouse.up();
    await page.click("#processBtn");
    const d = await download();
    if (/FORM-SECRET|kim@example/.test(allPdfText(d.buf))) throw new Error("the form value of the redacted page is still in the file");
    return d.name;
  });

  // A link to a left-out page, a resource dictionary shared by all pages, or a button
  // whose action lists a form field of a left-out page, must not carry that page's
  // content into the saved file.
  for (const [tool, pages, label] of [["remove-pdf-pages", "2", "remove"], ["extract-pdf-pages", "1,3", "extract"], ["split-pdf", "1,3", "split"]]) {
    await run(`${label}: left-out page not in the file`, async () => {
      const names = [];
      for (const fixture of ["redact.pdf", "redact-shared.pdf", "redact-form.pdf"]) {
        await open(tool);
        await page.setInputFiles("#fileInput", path.join(FIX, fixture));
        await waitIdle();
        await page.fill("#pages", pages);
        await page.click("#processBtn");
        const d = await download();
        const text = await pageText(d.file);
        if (text.length !== 2 || !/intro/i.test(text[0]) || !/public/i.test(text[1])) throw new Error(`${fixture}: text ${JSON.stringify(text)}`);
        if (/SECRET|example\.(com|org)/.test(allPdfText(d.buf))) throw new Error(`${fixture}: the left-out page is still in the file`);
        names.push(d.name);
      }
      return names.join(", ");
    });
  }

  await run("remove: a link to a kept page still leads to it", async () => {
    await open("remove-pdf-pages");
    await page.setInputFiles("#fileInput", path.join(FIX, "redact.pdf"));
    await waitIdle();
    await page.fill("#pages", "3");
    await page.click("#processBtn");
    await download();
    const r = await page.evaluate(async () => {
      const d = await PDFLib.PDFDocument.load(TrustPDF.download.bytes);
      const pages = d.getPages();
      const link = pages[0].node.lookup(PDFLib.PDFName.of("Annots")).lookup(0);
      const dest = link.lookup(PDFLib.PDFName.of("Dest"));
      return { target: dest ? dest.get(0).toString() : null, page2: pages[1].ref.toString() };
    });
    if (r.target !== r.page2) throw new Error(`link points to ${r.target}, page 2 is ${r.page2}`);
    return "link -> page 2";
  });

  await run("remove: an old-style form without resources keeps the font it borrows from the page", async () => {
    await open("remove-pdf-pages");
    await page.setInputFiles("#fileInput", path.join(FIX, "redact-form.pdf"));
    await waitIdle();
    await page.fill("#pages", "2");
    await page.click("#processBtn");
    const d = await download();
    const fonts = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.load(TrustPDF.download.bytes);
      const group = doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of("Font"));
      return group.entries().map(([name]) => name.decodeText()).sort().join(",");
    });
    if (fonts !== "F1,F2") throw new Error(`page 1 fonts: ${fonts}`);
    const text = await pageText(d.file);
    if (!/legacy form text/.test(text[0])) throw new Error("text " + JSON.stringify(text));
    return "fonts " + fonts;
  });

  await run("compress: lossless or 'already small' warning", async () => {
    await open("compress-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await page.click("#processBtn");
    await Promise.race([
      page.locator("#downloadArea").waitFor({ state: "visible" }),
      page.locator("#toolMessage .alert-warning").waitFor(),
    ]);
    return (await page.locator("#toolMessage").innerText()).slice(0, 70);
  });

  await run("compress: strong (rasterize)", async () => {
    await open("compress-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "photo-heavy.pdf"));
    await page.selectOption("#compressLevel", "strong");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 2) throw new Error(`expected 2 pages, got ${i.pages}`);
    const before = fs.statSync(path.join(FIX, "photo-heavy.pdf")).size;
    if (d.buf.length >= before) throw new Error(`not smaller: ${d.buf.length} >= ${before}`);
    return `${before}B -> ${d.buf.length}B`;
  });

  await run("pdf to jpg: two pages -> zip", async () => {
    await open("pdf-to-jpg");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.fill("#pages", "1,3");
    await page.click("#processBtn");
    const d = await download();
    if (d.buf.slice(0, 2).toString() !== "PK") throw new Error("not a zip");
    return `${d.name} ${d.buf.length}B`;
  });

  await run("pdf to png: one page -> png", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.selectOption("#imgFormat", "png");
    await page.fill("#pages", "2");
    await page.click("#processBtn");
    const d = await download();
    if (d.buf.slice(1, 4).toString() !== "PNG") throw new Error("not a png");
    return d.name;
  });

  await run("page numbers: page x of y, skip cover", async () => {
    await open("add-page-numbers");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await page.selectOption("#numberFormat", "pageOf");
    await page.fill("#pages", "2-5");
    await page.click("#processBtn");
    const d = await download();
    const text = await pageText(d.file);
    if (!text[1].includes("Page 1 of 4") || !text[4].includes("Page 4 of 4") || text[0].includes(" of ")) {
      throw new Error("numbers wrong: " + JSON.stringify(text));
    }
    return d.name;
  });

  await run("watermark: diagonal, unsupported char refused", async () => {
    await open("watermark-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await page.fill("#wmText", "草稿");
    await page.click("#processBtn");
    await page.locator("#toolMessage .alert-danger").waitFor();
    await page.fill("#wmText", "DRAFT copy");
    await page.click("#processBtn");
    const d = await download();
    const text = await pageText(d.file);
    if (!text.every((t) => t.includes("DRAFT copy"))) throw new Error("watermark missing");
    return d.name;
  });

  await run("watermark: č, š, ž and Cyrillic use the embedded font", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await page.fill("#wmText", "Osnutek čšž Тест");
    await page.click("#processBtn");
    const d = await download();
    const text = await pageText(d.file);
    if (!text.every((t) => t.includes("Osnutek čšž Тест"))) throw new Error("text missing: " + text[0].slice(0, 80));
    return `${d.name} ${d.buf.length}B`;
  });

  await run("pdf to text", async () => {
    await open("pdf-to-text");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await page.click("#processBtn");
    const d = await download();
    const text = d.buf.toString();
    if (!text.includes("Page 3") || !text.includes("--- Page 2 ---")) throw new Error(text.slice(0, 100));
    return `${d.name} ${text.length} chars`;
  });

  await run("protect: encrypt + unlock round trip", async () => {
    await open("protect-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.fill("#userPassword", "secret1");
    await page.fill("#userPassword2", "secret1");
    await page.uncheck("#allowPrint");
    await page.click("#processBtn");
    const d = await download();
    if (!d.buf.includes("/Encrypt")) throw new Error("not encrypted");
    // unlock with wrong password, then right one
    await open("unlock-pdf");
    await page.setInputFiles("#fileInput", d.file);
    await waitIdle();
    const info = await page.locator("#fileInfo").innerText();
    if (!/needs a password/.test(info)) throw new Error("password not detected: " + info);
    await page.fill("#pdfPassword", "nope");
    await page.click("#processBtn");
    await page.locator("#toolMessage .alert-danger").waitFor();
    const err = await page.locator("#toolMessage").innerText();
    await page.fill("#pdfPassword", "secret1");
    await page.click("#processBtn");
    const u = await download();
    if (u.buf.includes("/Encrypt")) throw new Error("still encrypted");
    const i = await inspect(); if (i.pages !== 3) throw new Error("pages " + i.pages);
    return `${d.name} -> ${u.name}; wrong pw: ${err.slice(0, 40)}`;
  });

  await run("crop: margins typed", async () => {
    await open("crop-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.locator("#cropBox").waitFor({ state: "visible" });
    await page.fill("#marginTop", "20");
    await page.fill("#marginLeft", "10");
    await page.click("#processBtn");
    const d = await download();
    const box = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.load(TrustPDF.download.bytes, { updateMetadata: false });
      const b = doc.getPage(0).getCropBox(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v));
    });
    // page is 595x842 pt; left 10mm = 28pt, top 20mm = 57pt
    if (Math.abs(box[0] - 28) > 2 || Math.abs(box[3] - (842 - 57)) > 2) throw new Error("cropbox " + box);
    return `${d.name} cropbox=${box}`;
  });

  await run("crop: auto-trim + drag", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.locator("#cropBox").waitFor({ state: "visible" });
    await page.click("#autoTrimBtn");
    const after = await page.inputValue("#marginBottom");
    if (!(Number(after) > 5)) throw new Error("auto-trim did nothing: " + after);
    await page.click("#resetCropBtn");
    await page.locator("#previewCanvas").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); // let the scroll settle before reading positions
    const canvas = await page.locator("#previewCanvas").boundingBox();
    // Start well below the top edge: after scrolling, the sticky site header can cover the first 70 px of the canvas.
    await page.mouse.move(canvas.x + 50, canvas.y + 150);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 250, canvas.y + 400, { steps: 5 });
    await page.mouse.up();
    const w = await page.locator("#cropBox").boundingBox();
    if (Math.abs(w.width - 200) > 3) throw new Error("drag width " + w.width);
    return `auto-trim bottom=${after}mm, drag ok`;
  });

  await run("sign: typed signature on last page + date", async () => {
    await open("sign-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.click('label[for="sigModeType"]');
    await page.fill("#typedName", "Martin Test");
    await page.locator("#signatureOverlay").waitFor({ state: "visible" });
    await page.locator("#previewCanvas").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); // let the scroll settle before reading positions
    const canvas = await page.locator("#previewCanvas").boundingBox();
    await page.mouse.move(canvas.x + 150, canvas.y + 400);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 300, canvas.y + 500, { steps: 5 });
    await page.mouse.up();
    await page.check("#addDate");
    await page.click("#processBtn");
    const d = await download();
    const info = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.load(TrustPDF.download.bytes, { updateMetadata: false });
      const p = doc.getPage(2);
      return { pages: doc.getPageCount(), hasXObject: p.node.Resources().has(PDFLib.PDFName.of("XObject")), p1: doc.getPage(0).node.Resources().has(PDFLib.PDFName.of("XObject")) };
    });
    if (info.pages !== 3 || !info.hasXObject || info.p1) throw new Error(JSON.stringify(info));
    const text = await pageText(d.file);
    if (!/\d{4}/.test(text[2])) throw new Error("date missing: " + text[2]);
    return `${d.name} date='${text[2].slice(0, 30)}'`;
  });

  await run("sign: drawn signature on every page", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await waitIdle();
    await page.click('label[for="sigModeDraw"]');
    await page.locator("#signaturePad").scrollIntoViewIfNeeded();
    const pad = await page.locator("#signaturePad").boundingBox();
    await page.mouse.move(pad.x + 30, pad.y + 90);
    await page.mouse.down();
    await page.mouse.move(pad.x + 200, pad.y + 40, { steps: 8 });
    await page.mouse.move(pad.x + 300, pad.y + 120, { steps: 8 });
    await page.mouse.up();
    await page.locator("#signatureOverlay").waitFor({ state: "visible" });
    await page.check("#allPages");
    await page.click("#processBtn");
    const d = await download();
    const n = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.load(TrustPDF.download.bytes, { updateMetadata: false });
      return doc.getPages().filter((p) => p.node.Resources().has(PDFLib.PDFName.of("XObject"))).length;
    });
    if (n !== 3) throw new Error("signed pages " + n);
    return d.name;
  });

  await run("ocr: scan -> searchable pdf", async () => {
    await open("ocr-pdf");
    await page.setInputFiles("#fileInput", path.join(FIX, "scan.pdf"));
    await waitIdle();
    await page.click("#processBtn");
    await page.locator("#downloadArea").waitFor({ state: "visible", timeout: 180000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#downloadBtn")]);
    const file = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(file);
    const preview = await page.inputValue("#textPreview");
    if (!/quick\s+brown\s+fox/i.test(preview)) throw new Error("preview: " + preview.slice(0, 80));
    const text = await pageText(file);
    if (!/quick\s+brown\s+fox/i.test(text[0])) throw new Error("no text layer: " + text[0].slice(0, 80));
    return `${dl.suggestedFilename()} text layer ok`;
  });

  await run("pdf to word: editable text", async () => {
    await open("pdf-to-word");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await page.click("#processBtn");
    const d = await download();
    if (d.buf.slice(0, 2).toString() !== "PK") throw new Error("not a zip/docx");
    const unz = require("child_process").execSync(`python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); z.testzip(); print(z.read('word/document.xml').decode()[:4000])" "${d.file}"`).toString();
    if (!unz.includes("Page 1") || !unz.includes("Page 5") || (unz.match(/w:type="page"/g) || []).length !== 4) throw new Error("docx content: " + unz.slice(0, 200));
    return `${d.name} ${d.buf.length}B`;
  });

  await run("pdf to word: page images", async () => {
    await page.click("#startAgainBtn");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await page.selectOption("#wordMode", "images");
    await page.click("#processBtn");
    const d = await download();
    const names = require("child_process").execSync(`python3 -c "import zipfile,sys; print(' '.join(zipfile.ZipFile(sys.argv[1]).namelist()))" "${d.file}"`).toString();
    if (!names.includes("word/media/page3.jpg")) throw new Error(names);
    return d.name;
  });

  await run("extract pages: 2-3 into a new PDF", async () => {
    await open("extract-pdf-pages");
    await page.setInputFiles("#fileInput", path.join(FIX, "five pages.pdf"));
    await waitIdle();
    await page.fill("#pages", "2-3");
    await page.click("#processBtn");
    const d = await download();
    const i = await inspect(); if (i.pages !== 2) throw new Error(`expected 2 pages, got ${i.pages}`);
    return d.name;
  });

  await run("fill form: text (č), checkbox, dropdown, radio", async () => {
    await open("fill-pdf-form");
    // Build a small fillable form with pdf-lib in the page and keep it as a fixture.
    const b64 = await page.evaluate(async () => {
      const d = await PDFLib.PDFDocument.create();
      const p1 = d.addPage([595, 842]);
      const p2 = d.addPage([595, 842]);
      const f = d.getForm();
      f.createTextField("applicant.full_name").addToPage(p1, { x: 72, y: 700, width: 300, height: 24 });
      const country = f.createDropdown("country");
      country.addOptions(["Slovenia", "Austria"]);
      country.addToPage(p1, { x: 72, y: 640, width: 200, height: 24 });
      f.createCheckBox("agree").addToPage(p2, { x: 72, y: 600, width: 16, height: 16 });
      const size = f.createRadioGroup("size");
      size.addOptionToPage("S", p2, { x: 72, y: 500, width: 16, height: 16 });
      size.addOptionToPage("M", p2, { x: 100, y: 500, width: 16, height: 16 });
      const bytes = await d.save();
      let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); });
      return btoa(s);
    });
    fs.writeFileSync(path.join(FIX, "form.pdf"), Buffer.from(b64, "base64"));
    await page.setInputFiles("#fileInput", path.join(FIX, "form.pdf"));
    await page.locator("#formFields:not(.d-none)").waitFor();
    const headings = await page.locator(".form-fields-page").allTextContents();
    if (headings.join(",") !== "Page 1,Page 2") throw new Error("page headings: " + headings);
    const labels = await page.locator("#formFieldList label").allInnerTexts();
    if (labels.join(",") !== "Full name,Country,Agree,Size") throw new Error("labels: " + labels);
    await page.fill("#formFieldList input[type=text]", "Žiga Čuk");
    await page.locator("#formFieldList select").nth(0).selectOption("Austria");
    await page.check("#formFieldList input[type=checkbox]");
    await page.locator("#formFieldList select").nth(1).selectOption("M");
    await page.click("#processBtn");
    const d = await download();
    const got = await page.evaluate(async () => {
      const f = (await PDFLib.PDFDocument.load(TrustPDF.download.bytes)).getForm();
      return [f.getTextField("applicant.full_name").getText(), f.getDropdown("country").getSelected()[0],
              f.getCheckBox("agree").isChecked(), f.getRadioGroup("size").getSelected()];
    });
    if (JSON.stringify(got) !== JSON.stringify(["Žiga Čuk", "Austria", true, "M"])) throw new Error(JSON.stringify(got));
    return `${d.name} ${JSON.stringify(got)}`;
  });

  await run("flatten pdf: fields become page content", async () => {
    await open("flatten-pdf");
    if (!(await page.isChecked("#flattenForm"))) throw new Error("flatten not preset");
    await page.setInputFiles("#fileInput", path.join(OUT, "form-filled.pdf"));
    await page.locator("#formFields:not(.d-none)").waitFor();
    const value = await page.inputValue("#formFieldList input[type=text]");
    if (value !== "Žiga Čuk") throw new Error("existing value not shown: " + value);
    await page.click("#processBtn");
    const d = await download();
    const fields = await page.evaluate(async () => (await PDFLib.PDFDocument.load(TrustPDF.download.bytes)).getForm().getFields().length);
    if (fields !== 0) throw new Error(`${fields} fields left`);
    const text = (await pageText(d.file)).join(" ");
    if (!text.includes("Žiga Čuk") || !text.includes("Austria")) throw new Error("text not on the page: " + text);
    return d.name;
  });

  await run("fill form: a PDF without fields says so", async () => {
    await open("fill-pdf-form");
    await page.setInputFiles("#fileInput", path.join(FIX, "three.pdf"));
    await page.locator("#toolMessage .alert-warning").waitFor();
    await page.click("#processBtn");
    await page.locator("#toolMessage .alert-danger").waitFor();
    if (!(await page.locator("#processBtn").isEnabled())) throw new Error("process button not re-enabled");
  });

  await run("crawler files", async () => {
    for (const p of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/manifest.webmanifest", "/.well-known/security.txt"]) {
      const r = await page.goto(BASE + p);
      if (r.status() !== 200) throw new Error(`${p} -> ${r.status()}`);
    }
  });

  await run("static pages", async () => {
    for (const p of ["/", "/about/", "/privacy/", "/cookies/", "/terms/", "/privacy-tools/", "/guides/", "/guides/redact-pdf-without-uploading/"]) {
      const r = await page.goto(BASE + p);
      if (r.status() !== 200) throw new Error(`${p} -> ${r.status()}`);
    }
    
    await page.goto(BASE + "/");
    await page.screenshot({ path: path.join(OUT, "home-light.png"), fullPage: true });
  });

  await run("home: search filters the tools, Enter opens the first match", async () => {
    await page.goto(BASE + "/");
    await page.fill("#toolSearch", "password");
    const shown = await page.locator("[data-tool-search]:not(.d-none) h3").allInnerTexts();
    if (!shown.includes("Protect PDF") || !shown.includes("Unlock PDF") || shown.includes("Merge PDF")) throw new Error(shown.join(", "));
    await page.fill("#toolSearch", "zzzz");
    if (!(await page.locator("#toolSearchEmpty").isVisible())) throw new Error("no 'no match' message");
    await page.fill("#toolSearch", "merg");
    await Promise.all([page.waitForURL("**/tools/merge-pdf/"), page.press("#toolSearch", "Enter")]);
    return shown.join(", ");
  });

  await run("offline: the service worker registers and controls the site", async () => {
    await page.goto(BASE + "/");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    if (!scope.endsWith("/")) throw new Error("scope " + scope);
    return scope;
  });

  const real = problems.filter((p) => !/favicon|net::ERR/.test(p));
  console.log(`\nConsole problems: ${real.length}`);
  real.slice(0, 10).forEach((p) => console.log("  " + p));
  if (real.length) process.exitCode = 1;

  await browser.close();
})();
