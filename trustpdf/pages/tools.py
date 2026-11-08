"""The tools on the site and all the text search engines and AI assistants read.

Each tool entry drives: the route, the card on the home page, the menus, the
<title>/meta/Open Graph tags, the visible "How to" steps and FAQ under the
tool, the JSON-LD structured data, the sitemap, and llms.txt.

Keep `steps` and `faq` truthful and specific: they are shown on the page
and repeated word for word in the structured data.
"""

PRIVACY_ANSWER = (
    "No. TrustPDF runs entirely in your web browser using JavaScript. Your file is read and processed on your own "
    "device and is never sent to a server. The site's Content-Security-Policy does not even allow the page to "
    "upload it, and you can check the open-source code on GitHub."
)

GROUPS = [
    {"key": "organize", "label": "Organize", "heading": "Organize pages"},
    {"key": "edit", "label": "Edit", "heading": "Edit and optimize"},
    {"key": "convert", "label": "Convert", "heading": "Convert"},
    {"key": "metadata", "label": "Metadata", "heading": "Metadata and privacy"},
]

TOOLS = [
    {
        "name": "merge_pdf",
        "how_to_title": "How to merge PDF files",
        "path": "/tools/merge-pdf/",
        "group": "organize",
        "title": "Merge PDF",
        "short_title": "Merge PDF",
        "seo_title": "Merge PDF Files Free, No Upload - TrustPDF",
        "description": "Combine several PDF files into one, in the order you choose.",
        "meta_description": "Merge PDF files for free without uploading them. Combine multiple PDFs into one, in any order, right in your browser. No sign-up, no watermark, no file limits.",
        "og_description": "Combine multiple PDF files into one directly in your browser. Nothing is uploaded.",
        "keywords": "merge pdf, combine pdf, join pdf files, pdf merger, merge pdf without uploading, merge pdf offline",
        "icon": "img/icons/merge-pdf.webp",
        "og_image": "img/og/merge-pdf-og.jpg",
        "template_name": "merge_pdf.html",
        "intro": "Join contracts, scans, invoices or chapters into a single PDF. Add the files, drag them into the right order and save. Pages keep their original quality, text stays selectable, and the files never leave your computer or phone.",
        "steps": [
            "Drop your PDF files into the box, or click it to choose them.",
            "Drag the files in the list into the order you want.",
            "Click “Merge PDFs”, then “Save Merged PDF”.",
        ],
        "faq": [
            ("Are my PDF files uploaded when I merge them?", PRIVACY_ANSWER),
            ("Is there a limit on the number or size of files?", "There is no fixed limit and no daily quota. The only limit is your device's memory; a modern computer handles hundreds of pages easily. Very large files (hundreds of megabytes) can be slow on phones."),
            ("Will merging reduce the quality of my PDF?", "No. Pages are copied as they are, so text, vector graphics and images keep their original quality."),
            ("Can I merge password-protected PDFs?", "Not directly. Open the file in your PDF reader, save a copy without the password, and merge that copy."),
        ],
        "related": ["split_pdf", "reorder_pdf_pages", "compress_pdf"],
    },
    {
        "name": "split_pdf",
        "how_to_title": "How to split a PDF",
        "path": "/tools/split-pdf/",
        "group": "organize",
        "title": "Split PDF",
        "short_title": "Split PDF",
        "seo_title": "Split PDF Free, Extract Pages Without Upload - TrustPDF",
        "description": "Extract pages or page ranges into a new PDF, or one PDF per page.",
        "meta_description": "Split a PDF or extract pages for free without uploading. Click pages or type ranges like 1-3,5 and save a new PDF, or one PDF per page as a ZIP. Runs in your browser.",
        "og_description": "Extract pages from a PDF directly in your browser. No uploads, no sign-up.",
        "keywords": "split pdf, extract pdf pages, separate pdf pages, pdf splitter, split pdf into single pages, split pdf without uploading",
        "icon": "img/icons/split-pdf.webp",
        "og_image": "img/og/split-pdf-og.jpg",
        "template_name": "split_pdf.html",
        "intro": "Take just the pages you need out of a long PDF. Click page thumbnails or type page numbers and ranges, then save them as one new PDF, or as separate one-page PDFs bundled in a ZIP file.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Click the pages you want in the preview, or type ranges such as 1-3,5,8-10.",
            "Optionally tick “Save each selected page as a separate PDF”.",
            "Click “Split PDF”, then save the result.",
        ],
        "faq": [
            ("Is my PDF uploaded when I split it?", PRIVACY_ANSWER),
            ("How do I split a PDF into single pages?", "Select all pages (or the ones you want), tick “Save each selected page as a separate PDF”, and click Split PDF. You get a ZIP file with one PDF per page."),
            ("What page range formats can I type?", "Single pages and ranges separated by commas, for example 1-3,5,8-10. Pages are numbered from 1."),
            ("Does splitting keep the original quality?", "Yes. The selected pages are copied unchanged into the new file."),
        ],
        "related": ["merge_pdf", "remove_pdf_pages", "pdf_to_jpg"],
    },
    {
        "name": "compress_pdf",
        "how_to_title": "How to compress a PDF",
        "path": "/tools/compress-pdf/",
        "group": "edit",
        "title": "Compress PDF",
        "short_title": "Compress PDF",
        "seo_title": "Compress PDF Free, Reduce File Size Without Upload - TrustPDF",
        "description": "Make a PDF smaller for email and uploads, with lossless or strong compression.",
        "meta_description": "Compress a PDF and reduce its file size for free, without uploading it. Choose lossless or strong compression for scans, see the new size, then save. Private, in your browser.",
        "og_description": "Reduce PDF file size directly in your browser. Nothing is uploaded.",
        "keywords": "compress pdf, reduce pdf size, make pdf smaller, shrink pdf, pdf compressor, compress pdf without uploading, compress scanned pdf",
        "icon": "img/icons/compress-pdf.webp",
        "og_image": "img/og/compress-pdf-og.jpg",
        "template_name": "compress_pdf.html",
        "intro": "Shrink a PDF that is too big to email or upload. Lossless mode rewrites the file structure without touching what you see. Strong and Maximum modes turn each page into a compressed image, which makes scanned documents and photo-heavy PDFs much smaller.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Pick a compression level: Lossless keeps everything; Strong or Maximum shrink scans the most.",
            "Click “Compress PDF” and check the new size.",
            "Click “Save Compressed PDF”.",
        ],
        "faq": [
            ("Is my PDF uploaded to be compressed?", PRIVACY_ANSWER),
            ("Which compression level should I choose?", "Start with Lossless. If the file is a scan or full of photos and is still too big, use Strong (150 DPI). Maximum (100 DPI) gives the smallest file and is fine for reading on screen."),
            ("Why is my text not selectable after strong compression?", "Strong and Maximum turn each page into an image to save space. If you need selectable or searchable text, use Lossless."),
            ("Why did my PDF not get smaller?", "Some PDFs are already well optimized. TrustPDF tells you when compression would not help instead of giving you a bigger file."),
        ],
        "related": ["merge_pdf", "pdf_to_jpg", "pdf_metadata_editor"],
    },
    {
        "name": "rotate_pdf_pages",
        "how_to_title": "How to rotate PDF pages",
        "path": "/tools/rotate-pdf-pages/",
        "group": "organize",
        "title": "Rotate PDF Pages",
        "short_title": "Rotate Pages",
        "seo_title": "Rotate PDF Pages Free and Save, No Upload - TrustPDF",
        "description": "Rotate all pages or only selected ones, with a live preview.",
        "meta_description": "Rotate PDF pages and save them permanently, free and without uploading. Turn all pages or only selected ones 90° or 180°, with a live preview, right in your browser.",
        "og_description": "Rotate PDF pages directly in your browser. Your files stay on your device.",
        "keywords": "rotate pdf, rotate pdf pages, turn pdf pages, fix upside down pdf, rotate pdf and save, rotate single pdf page",
        "icon": "img/icons/rotate-pdf-pages.webp",
        "og_image": "img/og/rotate-pdf-pages-og.jpg",
        "template_name": "rotate_pdf_pages.html",
        "intro": "Fix scanned pages that came out sideways or upside down. Rotate every page at once or click only the pages that need it, check the preview, and save the corrected PDF.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Choose 90° clockwise, 180° or 90° counter-clockwise.",
            "Click the pages to rotate, or select none to rotate every page.",
            "Click “Rotate PDF”, then “Save Rotated PDF”.",
        ],
        "faq": [
            ("Is my PDF uploaded when I rotate it?", PRIVACY_ANSWER),
            ("Is the rotation saved permanently?", "Yes. The rotation is written into the new PDF, so it opens the right way up in every PDF reader."),
            ("Can I rotate only one page?", "Yes. Click just that page in the preview, or type its number, before you click Rotate PDF."),
        ],
        "related": ["reorder_pdf_pages", "remove_pdf_pages", "split_pdf"],
    },
    {
        "name": "remove_pdf_pages",
        "how_to_title": "How to delete pages from a PDF",
        "path": "/tools/remove-pdf-pages/",
        "group": "organize",
        "title": "Remove PDF Pages",
        "short_title": "Remove Pages",
        "seo_title": "Delete Pages from PDF Free, No Upload - TrustPDF",
        "description": "Delete blank, duplicate or unwanted pages from a PDF.",
        "meta_description": "Remove pages from a PDF for free without uploading. Click the blank, duplicate or unwanted pages, delete them and save the new PDF, right in your browser.",
        "og_description": "Delete unwanted pages from a PDF directly in your browser. Nothing is uploaded.",
        "keywords": "remove pdf pages, delete pages from pdf, delete pdf page, pdf page remover, remove blank pages pdf",
        "icon": "img/icons/remove-pdf-pages.webp",
        "og_image": "img/og/remove-pdf-pages-og.jpg",
        "template_name": "remove_pdf_pages.html",
        "intro": "Drop blank scans, duplicate pages or pages you should not share. Click them in the preview, or type their numbers, and save a copy of the PDF without them.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Click the pages you want to delete, or type numbers like 2,5-7.",
            "Click “Remove Pages”, then save the new PDF.",
        ],
        "faq": [
            ("Is my PDF uploaded when I delete pages?", PRIVACY_ANSWER),
            ("Is the original file changed?", "No. Your original stays as it is; you save a new copy without the removed pages."),
            ("Are removed pages really gone?", "Yes. The new file is built only from the pages you keep, so the removed pages are not hidden, they are not in the file at all."),
        ],
        "related": ["split_pdf", "reorder_pdf_pages", "pdf_metadata_editor"],
    },
    {
        "name": "reorder_pdf_pages",
        "how_to_title": "How to rearrange PDF pages",
        "path": "/tools/reorder-pdf-pages/",
        "group": "organize",
        "title": "Reorder PDF Pages",
        "short_title": "Reorder Pages",
        "seo_title": "Reorder PDF Pages Free, Rearrange Without Upload - TrustPDF",
        "description": "Drag page thumbnails into a new order and save the PDF.",
        "meta_description": "Rearrange PDF pages for free without uploading. Drag page thumbnails into a new order, reverse the order with one click, and save the PDF, right in your browser.",
        "og_description": "Rearrange PDF pages directly in your browser. Nothing is uploaded.",
        "keywords": "reorder pdf pages, rearrange pdf pages, sort pdf pages, move pdf pages, organize pdf, reverse pdf page order",
        "icon": "img/icons/reorder-pdf-pages.webp",
        "og_image": "img/og/reorder-pdf-pages-og.jpg",
        "template_name": "reorder_pdf_pages.html",
        "intro": "Put pages in the right order after scanning or merging. Drag thumbnails where they belong, or reverse the whole document with one click, then save.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Drag the page thumbnails into the order you want, or click “Reverse order”.",
            "Click “Reorder Pages”, then save the new PDF.",
        ],
        "faq": [
            ("Is my PDF uploaded when I reorder pages?", PRIVACY_ANSWER),
            ("Can I reverse the page order?", "Yes. Click “Reverse order” to flip the whole document, which is handy after scanning a stack upside down."),
            ("Can I reorder pages on a phone?", "Yes. Touch and hold a page thumbnail, then drag it to its new place."),
        ],
        "related": ["merge_pdf", "rotate_pdf_pages", "remove_pdf_pages"],
    },
    {
        "name": "add_page_numbers",
        "how_to_title": "How to add page numbers to a PDF",
        "path": "/tools/add-page-numbers/",
        "group": "edit",
        "title": "Add Page Numbers",
        "short_title": "Page Numbers",
        "seo_title": "Add Page Numbers to PDF Free, No Upload - TrustPDF",
        "description": "Number PDF pages, with your choice of position, format and start number.",
        "meta_description": "Add page numbers to a PDF for free without uploading. Choose the position, a format like “Page 1 of 10”, the start number and which pages to number. Runs in your browser.",
        "og_description": "Number the pages of a PDF directly in your browser. Nothing is uploaded.",
        "keywords": "add page numbers to pdf, number pdf pages, pdf page numbering, insert page numbers pdf, page x of y pdf",
        "icon": "img/icons/add-page-numbers.webp",
        "og_image": "img/og/add-page-numbers-og.jpg",
        "template_name": "add_page_numbers.html",
        "intro": "Add page numbers to reports, theses, contracts and merged documents. Put them at the top or bottom, left, centre or right, use formats such as “Page 3 of 12”, and skip a cover page by numbering only a range.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Choose the position, the format and the number to start from.",
            "Optionally type a page range, for example 2-20 to skip the cover.",
            "Click “Add Page Numbers”, then save the numbered PDF.",
        ],
        "faq": [
            ("Is my PDF uploaded to add page numbers?", PRIVACY_ANSWER),
            ("Can I skip the first page?", "Yes. Type a range such as 2-20 in “Pages to number”. With “Start at 1”, page 2 is then numbered 1."),
            ("Can I use the format “Page 1 of 10”?", "Yes. Choose it in the Format list; the total counts only the pages you number."),
            ("Do numbers appear correctly on rotated pages?", "Yes. TrustPDF places the number relative to the page as you see it, so landscape and rotated pages are numbered upright."),
        ],
        "related": ["watermark_pdf", "merge_pdf", "reorder_pdf_pages"],
    },
    {
        "name": "watermark_pdf",
        "how_to_title": "How to add a watermark to a PDF",
        "path": "/tools/watermark-pdf/",
        "group": "edit",
        "title": "Watermark PDF",
        "short_title": "Watermark",
        "seo_title": "Add Watermark to PDF Free, No Upload - TrustPDF",
        "description": "Stamp text such as CONFIDENTIAL or DRAFT across your PDF pages.",
        "meta_description": "Add a text watermark to a PDF for free without uploading it. Stamp CONFIDENTIAL, DRAFT or your name diagonally or horizontally, choose colour and opacity, in your browser.",
        "og_description": "Add a text watermark to a PDF directly in your browser. Nothing is uploaded.",
        "keywords": "watermark pdf, add watermark to pdf, pdf watermark, stamp pdf, confidential watermark pdf, draft watermark pdf",
        "icon": "img/icons/watermark-pdf.webp",
        "og_image": "img/og/watermark-pdf-og.jpg",
        "template_name": "watermark_pdf.html",
        "intro": "Mark a document as CONFIDENTIAL, DRAFT or COPY, or put your name on it before you share it. Place the text diagonally across the page or as a header or footer line, and set the colour and opacity so the content stays readable.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Type the watermark text and choose placement, size, colour and opacity.",
            "Optionally limit it to some pages, for example 1-3.",
            "Click “Add Watermark”, then save the watermarked PDF.",
        ],
        "faq": [
            ("Is my PDF uploaded to add a watermark?", PRIVACY_ANSWER),
            ("Can the watermark be removed?", "The text is drawn onto the pages, so it cannot simply be switched off, but someone with PDF editing software could still delete it. A watermark discourages sharing; it is not a security lock."),
            ("Which characters can I use?", "Latin letters, including most accented letters used in Western European languages, digits and common punctuation. Some characters (for example Cyrillic, Chinese, or č and ć) are not in the built-in PDF fonts yet."),
        ],
        "related": ["add_page_numbers", "pdf_metadata_editor", "compress_pdf"],
    },
    {
        "name": "pdf_to_jpg",
        "how_to_title": "How to convert PDF to JPG",
        "path": "/tools/pdf-to-jpg/",
        "group": "convert",
        "title": "PDF to JPG",
        "short_title": "PDF to JPG",
        "seo_title": "PDF to JPG / PNG Converter Free, No Upload - TrustPDF",
        "description": "Convert PDF pages into JPG or PNG images at up to 300 DPI.",
        "meta_description": "Convert PDF to JPG or PNG for free without uploading. Turn every page, or just the ones you pick, into high-quality images at 72, 150 or 300 DPI, right in your browser.",
        "og_description": "Convert PDF pages to JPG or PNG images directly in your browser. Nothing is uploaded.",
        "keywords": "pdf to jpg, pdf to png, pdf to image, convert pdf to jpg, save pdf page as image, pdf to jpg high quality",
        "icon": "img/icons/pdf-to-jpg.webp",
        "og_image": "img/og/pdf-to-jpg-og.jpg",
        "template_name": "pdf_to_jpg.html",
        "intro": "Save PDF pages as pictures for slides, social media, chat apps or image editors. Choose JPG for small files or PNG for lossless quality, and 300 DPI when you need print resolution.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Choose JPG or PNG and a resolution (150 DPI suits most uses).",
            "Leave the page field empty for all pages, or type the pages you want.",
            "Click “Convert to Images”, then save the image or the ZIP of images.",
        ],
        "faq": [
            ("Is my PDF uploaded to convert it to JPG?", PRIVACY_ANSWER),
            ("JPG or PNG: which should I choose?", "JPG makes smaller files and is best for photos and scans. PNG is lossless and keeps text and line drawings perfectly sharp, but files are larger."),
            ("What resolution should I use?", "72 DPI is enough for screens and previews, 150 DPI for documents and slides, 300 DPI for printing."),
            ("How do I get all pages at once?", "Leave the page field empty. Several pages download together as one ZIP file."),
        ],
        "related": ["images_to_pdf", "pdf_to_text", "split_pdf"],
    },
    {
        "name": "images_to_pdf",
        "how_to_title": "How to convert JPG or PNG to PDF",
        "path": "/tools/images-to-pdf/",
        "group": "convert",
        "title": "Images to PDF",
        "short_title": "Images to PDF",
        "seo_title": "JPG to PDF Converter Free (PNG too), No Upload - TrustPDF",
        "description": "Turn JPG and PNG images into one PDF, one image per page.",
        "meta_description": "Convert JPG and PNG images to PDF for free without uploading. Combine photos or scans into one PDF, in any order, at original size, A4 or Letter, right in your browser.",
        "og_description": "Convert JPG and PNG images into a PDF directly in your browser. Nothing is uploaded.",
        "keywords": "jpg to pdf, png to pdf, images to pdf, photo to pdf, convert image to pdf, combine images into pdf",
        "icon": "img/icons/images-to-pdf.webp",
        "og_image": "img/og/images-to-pdf-og.jpg",
        "template_name": "images_to_pdf.html",
        "intro": "Combine photos of receipts, ID documents, whiteboards or scanned pages into a single PDF. Drag the images into order, choose original size, A4 or US Letter, add a margin if you like, and save.",
        "steps": [
            "Drop your JPG or PNG images into the box, or click it to choose them.",
            "Drag the images into the order you want.",
            "Choose the page size and margin.",
            "Click “Create PDF”, then “Save PDF”.",
        ],
        "faq": [
            ("Are my images uploaded?", PRIVACY_ANSWER.replace("Your file is", "Your images are").replace("upload it", "upload them")),
            ("Which image formats are supported?", "JPG/JPEG and PNG. Photos from iPhones in HEIC format must be exported as JPG first."),
            ("Are the images compressed?", "No. Images are placed in the PDF as they are, so quality is unchanged. Use Compress PDF afterwards if you need a smaller file."),
        ],
        "related": ["pdf_to_jpg", "merge_pdf", "compress_pdf"],
    },
    {
        "name": "pdf_to_text",
        "how_to_title": "How to extract text from a PDF",
        "path": "/tools/pdf-to-text/",
        "group": "convert",
        "title": "PDF to Text",
        "short_title": "PDF to Text",
        "seo_title": "PDF to Text Converter, Extract Text Free, No Upload - TrustPDF",
        "description": "Extract the text of a PDF into a .txt file you can copy and search.",
        "meta_description": "Extract text from a PDF for free without uploading. Convert PDF to a plain .txt file or copy the text to the clipboard, page by page, right in your browser.",
        "og_description": "Extract text from a PDF directly in your browser. Nothing is uploaded.",
        "keywords": "pdf to text, extract text from pdf, pdf to txt, copy text from pdf, pdf text extractor",
        "icon": "img/icons/pdf-to-text.webp",
        "og_image": "img/og/pdf-to-text-og.jpg",
        "template_name": "pdf_to_text.html",
        "intro": "Get the words out of a PDF to quote, translate, search, or paste into another app or an AI assistant, without sending a confidential document to anyone. Preview the text, copy it, or save it as a .txt file.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Leave the page field empty for the whole document, or type the pages you want.",
            "Click “Extract Text”.",
            "Copy the text from the preview or click “Save .txt File”.",
        ],
        "faq": [
            ("Is my PDF uploaded to extract the text?", PRIVACY_ANSWER),
            ("Why is no text found in my PDF?", "The PDF is probably a scan, which contains pictures of pages rather than text. Scans need OCR (optical character recognition) to become text."),
            ("Is the layout kept?", "The text is extracted line by line in reading order. Tables and columns become plain lines of text, without formatting."),
        ],
        "related": ["pdf_to_jpg", "pdf_metadata_viewer", "split_pdf"],
    },
    {
        "name": "pdf_metadata_viewer",
        "how_to_title": "How to view PDF metadata",
        "path": "/tools/pdf-metadata-viewer/",
        "group": "metadata",
        "title": "PDF Metadata Viewer",
        "short_title": "Metadata Viewer",
        "seo_title": "PDF Metadata Viewer, Check PDF Properties Free - TrustPDF",
        "description": "See the title, author, dates, software and hidden XMP data in a PDF.",
        "meta_description": "View PDF metadata for free without uploading. See the title, author, creator software, creation and modification dates, and whether hidden XMP metadata is present.",
        "og_description": "Inspect PDF metadata and document properties directly in your browser. Nothing is uploaded.",
        "keywords": "pdf metadata viewer, view pdf properties, check pdf author, pdf creation date, inspect pdf metadata, xmp metadata",
        "icon": "img/icons/pdf-metadata-viewer.webp",
        "og_image": "img/og/pdf-metadata-viewer-og.jpg",
        "template_name": "pdf_metadata_viewer.html",
        "intro": "Before you send a PDF, see what it says about you. Documents often carry the author's name, the company, the software used and exact dates, plus a hidden XMP block that can hold even more.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one.",
            "Click “View Metadata”.",
            "Read the properties, and open the Metadata Editor if you want to change or remove them.",
        ],
        "faq": [
            ("Is my PDF uploaded to read its metadata?", PRIVACY_ANSWER),
            ("What is PDF metadata?", "Information stored inside the file about the document: title, author, subject, keywords, the program that created it, and creation and modification dates."),
            ("What is XMP metadata?", "A second, XML-based metadata block that many programs add. It can repeat or extend the normal fields, including edit history, and is easy to forget when cleaning a file."),
        ],
        "related": ["pdf_metadata_editor", "pdf_to_text", "remove_pdf_pages"],
    },
    {
        "name": "pdf_metadata_editor",
        "how_to_title": "How to edit or remove PDF metadata",
        "path": "/tools/pdf-metadata-editor/",
        "group": "metadata",
        "title": "PDF Metadata Editor",
        "short_title": "Metadata Editor",
        "seo_title": "Edit or Remove PDF Metadata Free, No Upload - TrustPDF",
        "description": "Edit the title, author and other fields, or strip all metadata.",
        "meta_description": "Edit or remove PDF metadata for free without uploading. Change title, author, subject and keywords, or strip all metadata including hidden XMP before sharing a PDF.",
        "og_description": "Edit or remove PDF metadata directly in your browser. Nothing is uploaded.",
        "keywords": "pdf metadata editor, remove pdf metadata, change pdf author, edit pdf title, strip pdf metadata, remove xmp metadata",
        "icon": "img/icons/pdf-metadata-editor.webp",
        "og_image": "img/og/pdf-metadata-editor-og.jpg",
        "template_name": "pdf_metadata_editor.html",
        "intro": "Give a PDF a proper title for search engines and readers, fix the author name, or remove every trace of metadata, including the hidden XMP block, before you share a file.",
        "steps": [
            "Drop a PDF into the box, or click it to choose one. The current values are filled in.",
            "Edit the fields, or click “Clear all fields” to remove everything.",
            "Click “Update Metadata”, then save the PDF.",
        ],
        "faq": [
            ("Is my PDF uploaded to edit its metadata?", PRIVACY_ANSWER),
            ("How do I remove all metadata from a PDF?", "Click “Clear all fields”, keep “Also remove the embedded XMP metadata stream” ticked, then click Update Metadata. The saved file has no title, author, software or XMP data."),
            ("Does the PDF title matter for SEO?", "Yes. Search engines can show the PDF's Title field as the result title, so a clear title helps people find and recognise your document."),
        ],
        "related": ["pdf_metadata_viewer", "watermark_pdf", "compress_pdf"],
    },
]

_BY_NAME = {tool["name"]: tool for tool in TOOLS}
_GROUP_LABELS = {g["key"]: g["label"] for g in GROUPS}

for _tool in TOOLS:
    # Namespaced URL name, used by {% url %} in templates.
    _tool["url_name"] = f"pages:{_tool['name']}"
    _tool["og_title"] = _tool["seo_title"]
    _tool["group_label"] = _GROUP_LABELS[_tool["group"]]
    _tool["faq_items"] = [{"q": q, "a": a} for q, a in _tool["faq"]]

for _tool in TOOLS:
    _tool["related_tools"] = [_BY_NAME[name] for name in _tool["related"]]


def tools_by_group():
    """[(group dict, [tools...]), ...] in GROUPS order, for the home page."""
    return [(group, [t for t in TOOLS if t["group"] == group["key"]]) for group in GROUPS]


HOME_FAQ = [
    ("Is TrustPDF really free?", "Yes. Every tool is free, with no sign-up, no watermarks, no daily limits and no premium tier. The project is open source and supported by donations and a few clearly marked affiliate links."),
    ("Are my files uploaded to a server?", "No. All processing happens in your browser with open-source JavaScript libraries (pdf-lib and PDF.js). Your files never leave your device, and the site's Content-Security-Policy blocks pages from sending them anywhere."),
    ("Does TrustPDF work offline?", "Once a tool page has loaded, the processing itself needs no internet connection, because it runs on your device."),
    ("Does it work on phones and tablets?", "Yes. TrustPDF works in any modern browser on Windows, macOS, Linux, Android and iOS. Very large files can be slow on older phones."),
    ("Can I use TrustPDF for confidential documents?", "That is what it is built for. Since files are never uploaded, nobody else can see or keep them. You can verify this in the source code on GitHub, or watch your browser's network tab while you use a tool."),
    ("What can't TrustPDF do yet?", "It cannot remove passwords, run OCR on scans, or convert PDFs to Word. These need heavier processing that is planned for the future."),
]
HOME_FAQ_ITEMS = [{"q": q, "a": a} for q, a in HOME_FAQ]


STATIC_PAGES = {
    "index": {
        "title": "TrustPDF",
        "seo_title": "TrustPDF - Free PDF Tools That Never Upload Your Files",
        "description": "Free, private PDF tools that run in your browser: merge, split, compress, rotate, number, watermark and convert PDFs without uploading them.",
        "meta_description": "Free online PDF tools that never upload your files. Merge, split, compress, rotate, add page numbers, watermark, and convert PDF to JPG or text, right in your browser. No sign-up.",
        "og_title": "TrustPDF - Free PDF Tools That Never Upload Your Files",
        "og_description": "Merge, split, compress, rotate, watermark and convert PDFs directly in your browser. Nothing is uploaded.",
        "og_image": "img/og/trustpdf-og.jpg",
    },

    "about": {
        "title": "About",
        "seo_title": "About TrustPDF - Private Open Source PDF Tools",
        "description": "Learn about TrustPDF, a privacy-first open source PDF tool created to process PDF files directly in your browser.",
        "meta_description": "Learn about TrustPDF, a privacy-first open source PDF tool for working with PDF files directly in your browser with no uploads, no accounts, and no cookies.",
        "og_title": "About TrustPDF",
        "og_description": "TrustPDF is a privacy-first open source PDF tool built for simple client-side PDF processing directly in your browser.",
        "og_image": "img/og/trustpdf-og.jpg",
    },

    "privacy_policy": {
        "title": "Privacy Policy",
        "seo_title": "Privacy Policy - TrustPDF",
        "description": "Read the TrustPDF privacy policy. Learn how TrustPDF protects your files by processing PDF documents directly in your browser.",
        "meta_description": "TrustPDF is a privacy-first PDF tool. Read our privacy policy and learn how files are processed directly in your browser with no uploads and no accounts.",
        "og_title": "Privacy Policy - TrustPDF",
        "og_description": "Learn how TrustPDF protects your privacy with client-side PDF processing, no uploads, no accounts, and no cookies.",
        "og_image": "img/og/trustpdf-og.jpg",
    },

    "cookie_policy": {
        "title": "Cookie Policy",
        "seo_title": "Cookie Policy - TrustPDF",
        "description": "Read the TrustPDF cookie policy. Learn how TrustPDF uses minimal, privacy-friendly analytics without third-party cookies.",
        "meta_description": "Read the TrustPDF cookie policy. TrustPDF uses no third-party cookies and keeps PDF processing private and client-side.",
        "og_title": "Cookie Policy - TrustPDF",
        "og_description": "Learn about TrustPDF's cookie policy and privacy-friendly approach to analytics, cookies, and client-side PDF processing.",
        "og_image": "img/og/trustpdf-og.jpg",
    },

    "terms": {
        "title": "Terms of Use",
        "seo_title": "Terms of Use - TrustPDF",
        "description": "Read the TrustPDF terms of use. TrustPDF is free, open source software provided as is, with all PDF processing done in your browser.",
        "meta_description": "Terms of use for TrustPDF, the free, open source, client-side PDF tool. Learn what you can expect from the service and what we ask of you.",
        "og_title": "Terms of Use - TrustPDF",
        "og_description": "Terms of use for TrustPDF, the free, open source, client-side PDF tool.",
        "og_image": "img/og/trustpdf-og.jpg",
    },

    "privacy_tools": {
        "title": "Privacy Tools",
        "seo_title": "Privacy Tools - TrustPDF",
        "description": "Explore privacy-focused tools and services, including Proton products for email, VPN, password management, cloud storage, and online privacy.",
        "meta_description": "Discover privacy-focused tools promoted by TrustPDF, including Proton products for private email, VPN, password management, cloud storage, and online privacy.",
        "og_title": "Privacy Tools - TrustPDF",
        "og_description": "Explore privacy-focused tools and Proton products for safer email, VPN, password management, cloud storage, and everyday online privacy.",
        "og_image": "img/og/privacy-tools-og.jpg",
    },
}
