// Browser smoke test: every tool processes a fixture and produces a download.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const FIX = path.join(__dirname, "fixtures");
const OUT = path.join(__dirname, "output");
fs.mkdirSync(OUT, { recursive: true });

// Inspect the produced PDF inside the page with pdf-lib (output uses compressed object streams).
let page;
const inspect = () => page.evaluate(async () => {
  const d = await PDFLib.PDFDocument.load(TrustPDF.download.bytes, { updateMetadata: false });
  return { pages: d.getPageCount(), title: d.getTitle() || "", author: d.getAuthor() || "",
           producer: d.getProducer() || "", xmp: d.catalog.has(PDFLib.PDFName.of("Metadata")),
           rotations: d.getPages().map((p) => p.getRotation().angle) };
});

async function run(name, fn) {
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
  await context.route(/umami/, (r) => r.abort());
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
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
    await page.focus("#dropZone");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
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
    return "producer preserved, XMP detected";
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

  await run("static pages + dark mode", async () => {
    for (const p of ["/", "/about/", "/privacy/", "/cookies/", "/terms/", "/privacy-tools/"]) {
      const r = await page.goto(BASE + p);
      if (r.status() !== 200) throw new Error(`${p} -> ${r.status()}`);
    }
    
    await page.goto(BASE + "/tools/split-pdf/");
    
    
    await page.screenshot({ path: path.join(OUT, "split-dark.png") });
    
    await page.goto(BASE + "/");
    await page.screenshot({ path: path.join(OUT, "home-light.png"), fullPage: true });
  });

  const real = problems.filter((p) => !/favicon|umami|cloud\.umami|api-gateway|net::ERR/.test(p));
  console.log(`\nConsole problems: ${real.length}`);
  real.slice(0, 10).forEach((p) => console.log("  " + p));
  if (real.length) process.exitCode = 1;

  await browser.close();
})();
