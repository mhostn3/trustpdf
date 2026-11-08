"""Generate the card icon (320x320 WebP) and Open Graph image (1200x630 JPG)
for a tool, in the same blueprint style as the hand-made ones.

    python scripts/make_tool_art.py compress-pdf "Compress PDF" "Make PDF files smaller directly in your browser." f149

The last argument is a Bootstrap Icons code point (see static/css/bootstrap-icons.min.css).
Requires Pillow and the Inter font (falls back to DejaVu Sans).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / "trustpdf" / "static"
ICON_FONT = ROOT / "fonts" / "bootstrap-icons.woff"
INK = (55, 65, 81)
LINE = (203, 208, 216)
FAINT = (229, 231, 235)
ACCENT = (220, 68, 55)


def font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


BOLD = ["/usr/share/fonts/opentype/inter/Inter-Bold.otf", "DejaVuSans-Bold.ttf"]
REGULAR = ["/usr/share/fonts/opentype/inter/Inter-Regular.otf", "DejaVuSans.ttf"]


def blueprint(draw, cx, cy, r):
    """Construction lines: circles, crosshair and a light grid."""
    for k in (1.0, 0.72):
        rr = r * k
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=LINE, width=2)
    step = r / 3
    for i in range(-3, 4):
        draw.line([cx + i * step, cy - r * 1.1, cx + i * step, cy + r * 1.1], fill=FAINT, width=1)
        draw.line([cx - r * 1.1, cy + i * step, cx + r * 1.1, cy + i * step], fill=FAINT, width=1)
    draw.line([cx, cy - r * 1.15, cx, cy + r * 1.15], fill=LINE, width=1)
    draw.line([cx - r * 1.15, cy, cx + r * 1.15, cy], fill=LINE, width=1)
    for dx, dy in ((0, -r), (0, r), (-r, 0), (r, 0)):
        draw.ellipse([cx + dx - 5, cy + dy - 5, cx + dx + 5, cy + dy + 5], outline=INK, width=2)


def glyph(draw, cx, cy, codepoint, size):
    f = ImageFont.truetype(str(ICON_FONT), size)
    ch = chr(int(codepoint, 16))
    # A second, offset pass in grey gives the pencil-sketch look of the other icons.
    draw.text((cx + 3, cy + 3), ch, font=f, fill=(150, 156, 166), anchor="mm")
    draw.text((cx, cy), ch, font=f, fill=INK, anchor="mm")


def make_icon(slug, codepoint):
    im = Image.new("RGB", (320, 320), "white")
    d = ImageDraw.Draw(im)
    blueprint(d, 160, 160, 128)
    glyph(d, 160, 160, codepoint, 128)
    out = ROOT / "img" / "icons" / f"{slug}.webp"
    im.save(out, "WEBP", quality=82, method=6)
    return out


def wrap(text, fnt, width, draw):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=fnt) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def make_og(slug, title, subtitle, codepoint):
    im = Image.new("RGB", (1200, 630), (250, 250, 250))
    d = ImageDraw.Draw(im)
    blueprint(d, 900, 315, 230)
    glyph(d, 900, 315, codepoint, 280)

    # Brand
    d.rounded_rectangle([46, 74, 106, 134], radius=14, outline=INK, width=5)
    d.rectangle([62, 92, 90, 98], fill=ACCENT)
    d.rectangle([73, 92, 79, 120], fill=INK)
    d.text((126, 104), "TrustPDF", font=font(BOLD, 44), fill=INK, anchor="lm")

    size = 104
    tfont = font(BOLD, size)
    while d.textlength(title, font=tfont) > 600 and size > 60:
        size -= 4
        tfont = font(BOLD, size)
    lines = wrap(title, tfont, 600, d)
    y = 170
    for line in lines:
        d.text((44, y), line, font=tfont, fill=INK)
        y += int(size * 1.1)
    y += 18
    d.rectangle([46, y, 132, y + 3], fill=ACCENT)
    y += 30
    sfont = font(REGULAR, 38)
    for line in wrap(subtitle, sfont, 560, d):
        d.text((46, y), line, font=sfont, fill=(55, 65, 81))
        y += 50
    out = ROOT / "img" / "og" / f"{slug}-og.jpg"
    im.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    return out


if __name__ == "__main__":
    slug, title, subtitle, codepoint = sys.argv[1:5]
    print(make_icon(slug, codepoint))
    print(make_og(slug, title, subtitle, codepoint))
