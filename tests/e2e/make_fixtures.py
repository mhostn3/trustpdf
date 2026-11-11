"""Generate the small PDF and image fixtures used by smoke.js.

    python tests/e2e/make_fixtures.py

Writes into tests/e2e/fixtures/. Requires Pillow.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(exist_ok=True)


def make_pdf(path, n_pages, title):
    objs = []

    def add(obj):
        objs.append(obj)
        return len(objs)

    font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_ids, contents = [], []
    for i in range(n_pages):
        stream = f"BT /F1 48 Tf 72 700 Td (Page {i + 1}) Tj ET 0 0 1 rg 72 72 {100 * (i + 1)} 200 re f".encode()
        contents.append(add(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"))
        page_ids.append(add(None))
    pages = add("<< /Type /Pages /Kids [" + " ".join(f"{p} 0 R" for p in page_ids) + f"] /Count {n_pages} >>")
    for p, c in zip(page_ids, contents):
        objs[p - 1] = (f"<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 595 842] /Contents {c} 0 R "
                       f"/Resources << /Font << /F1 {font} 0 R >> >> >>")
    info = add(f"<< /Title ({title}) /Author (Fixture Author) /Producer (Fixture Producer) >>")
    xmp = (b"<?xpacket begin=''?><x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF "
           b"xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><rdf:Description "
           b"xmlns:dc='http://purl.org/dc/elements/1.1/'><dc:creator><rdf:Seq><rdf:li>Hidden XMP Author"
           b"</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end='w'?>")
    meta = add(f"<< /Type /Metadata /Subtype /XML /Length {len(xmp)} >>\nstream\n".encode() + xmp + b"\nendstream")
    catalog = add(f"<< /Type /Catalog /Pages {pages} 0 R /Metadata {meta} 0 R >>")

    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        body = obj if isinstance(obj, bytes) else obj.encode()
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objs) + 1} /Root {catalog} 0 R /Info {info} 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n").encode()
    path.write_bytes(out)


def make_redact_pdf(path):
    """Three pages; page 2 holds the secret and an email, and page 1 links to page 2,
    so a careless copy of page 1 would drag page 2 into the redacted file."""
    texts = ["Intro page with a link", "SECRET-ACCOUNT-12345 jane.doe@example.com", "Public page three"]
    objs = ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]  # 1
    contents = []
    for t in texts:
        stream = f"BT /F1 20 Tf 72 700 Td ({t}) Tj ET".encode()
        objs.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
        contents.append(len(objs))
    page_ids = [len(objs) + 1 + i for i in range(3)]
    pages_id = page_ids[-1] + 1
    link_id = pages_id + 1
    for i, c in enumerate(contents):
        annots = f" /Annots [{link_id} 0 R]" if i == 0 else ""
        objs.append(f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] /Contents {c} 0 R "
                    f"/Resources << /Font << /F1 1 0 R >> >>{annots} >>")
    objs.append("<< /Type /Pages /Kids [" + " ".join(f"{p} 0 R" for p in page_ids) + "] /Count 3 >>")
    objs.append(f"<< /Type /Annot /Subtype /Link /Rect [72 690 400 730] /Border [0 0 0] "
                f"/P {page_ids[0]} 0 R /Dest [{page_ids[1]} 0 R /XYZ 0 842 0] >>")
    objs.append(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        body = obj if isinstance(obj, bytes) else obj.encode()
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root {len(objs)} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.write_bytes(out)


make_pdf(OUT / "five pages.pdf", 5, "Five Pages")
make_redact_pdf(OUT / "redact.pdf")
make_pdf(OUT / "three.pdf", 3, "Three")
(OUT / "not-a-pdf.pdf").write_bytes(b"hello, this is not a pdf")
for name, fmt, size in [("photo.jpg", "JPEG", (640, 480)), ("tall.png", "PNG", (300, 900))]:
    im = Image.new("RGB", size, (200, 80, 80))
    ImageDraw.Draw(im).rectangle([20, 20, size[0] - 20, size[1] - 20], outline=(0, 0, 0), width=10)
    im.save(OUT / name, fmt)
# A "scanned" PDF made of two high-resolution photos, for Compress PDF.
pages = []
for shade in (180, 120):
    im = Image.effect_noise((1700, 2200), 40).convert("RGB")
    overlay = Image.new("RGB", im.size, (shade, 150, 220 - shade))
    pages.append(Image.blend(im, overlay, 0.5))
pages[0].save(OUT / "photo-heavy.pdf", "PDF", resolution=200, quality=95, save_all=True, append_images=pages[1:])
# A one-page "scan": rendered text as an image, for OCR.
from PIL import ImageFont
scan = Image.new("RGB", (1240, 1754), "white")
d = ImageDraw.Draw(scan)
try:
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 44)
except OSError:
    f = ImageFont.load_default()
for i, line in enumerate(["TrustPDF OCR fixture", "The quick brown fox jumps", "over the lazy dog 12345"]):
    d.text((120, 200 + i * 90), line, fill="black", font=f)
scan.save(OUT / "scan.pdf", "PDF", resolution=150)
print("fixtures written to", OUT)
