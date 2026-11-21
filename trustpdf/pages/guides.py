"""How-to guides: articles that answer the questions people search for, each
pointing to the tool that does the job.

Each guide drives: the route /guides/<slug>/, the card on /guides/, the
<title>/meta/Open Graph tags, the Article and FAQ structured data, the
sitemap and llms.txt, and the "Guides" links under the tools it uses.
The article body is the template guides/<slug>.html.

Keep the text truthful and specific to what the tools really do: the FAQ
is repeated word for word in the structured data.
"""
import datetime

from .tools import TOOLS

_TOOLS = {tool["name"]: tool for tool in TOOLS}

GUIDES = [
    {
        "slug": "redact-pdf-without-uploading",
        "title": "How to Redact a PDF Without Uploading It",
        "seo_title": "How to Redact a PDF Without Uploading It (Free) - TrustPDF",
        "description": "Why black boxes often hide nothing, and how to remove text from a PDF for good, on your own device.",
        "meta_description": "Learn how to redact a PDF properly, for free and without uploading it. Why black boxes in most editors hide nothing, and how to remove names and numbers for good.",
        "tools": ["redact_pdf", "pdf_metadata_editor", "pdf_to_text"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("Is drawing a black rectangle on a PDF enough to redact it?", "Usually not. In most PDF editors a rectangle is a separate layer on top of the page. The text underneath is still in the file and can be selected, copied or extracted. Real redaction removes what is under the box."),
            ("How can I check that a redaction worked?", "Open the redacted PDF, press Ctrl+A (Cmd+A on a Mac) to select all text, and paste it into a text editor, or run the file through PDF to Text. If the hidden words appear, they are still in the file."),
            ("Is it safe to redact a document with an online tool?", "Only if the tool does not upload it. With a server-based tool the unredacted original, the very thing you want to protect, is sent to someone else's computer. TrustPDF redacts in your browser, so the original never leaves your device."),
        ],
    },
    {
        "slug": "are-online-pdf-tools-safe",
        "title": "Are Online PDF Tools Safe? What Happens to Your Files",
        "seo_title": "Are Online PDF Tools Safe? What Happens to Your Files - TrustPDF",
        "description": "Most free PDF websites upload your document to their servers. Here is what that means, and how to avoid it.",
        "meta_description": "Are online PDF converters safe for contracts, IDs and bank statements? What happens to uploaded files, what to look for, and how to edit PDFs without uploading them.",
        "tools": ["merge_pdf", "compress_pdf", "pdf_to_word"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("Do online PDF tools keep my files?", "Most server-based services say they delete uploaded files after a period, often one to a few hours. You cannot check this, and copies may remain in backups or logs. A tool that processes the file in your browser never receives it, so there is nothing to delete."),
            ("How do I know whether a PDF tool uploads my file?", "Look for a progress bar labelled uploading, a wait for a server, or a download link that points to another site. You can also open your browser's developer tools, watch the Network tab while you use the tool, or simply disconnect from the internet and see whether it still works."),
            ("Which documents should never be uploaded to a free PDF site?", "Anything you would not email to a stranger: passports and ID cards, tax returns, bank and payslip statements, medical records, contracts and anything covered by a confidentiality agreement or by GDPR."),
        ],
    },
    {
        "slug": "check-pdf-tool-does-not-upload-files",
        "title": "How to Check That a PDF Tool Doesn't Upload Your Files",
        "seo_title": "How to Check That a PDF Tool Doesn't Upload Your Files - TrustPDF",
        "description": "Three tests anyone can run in two minutes: the offline test, the Network tab, and the Content-Security-Policy.",
        "meta_description": "Don't take a website's word for it. Three simple tests show whether a PDF tool uploads your files: go offline, watch the browser's Network tab, and read its security policy.",
        "tools": ["merge_pdf", "redact_pdf", "sign_pdf"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("Can a website say it doesn't upload files and still do it?", "Yes. A privacy promise is only text. The tests in this guide check what the page actually does, so you do not have to trust the claim."),
            ("Does the offline test prove nothing is ever sent?", "It proves the tool does not need a server to process your file. A badly behaved page could still store data and send it later, which is why the Network tab and the Content-Security-Policy checks are worth doing too."),
            ("What are the small requests I see on TrustPDF?", "Requests to /analytics/e/ on trustpdf.net are cookie-free page statistics: the page address, the names of buttons that were clicked and how long the page was open. They never contain file names, file contents or anything you typed, and the code that sends them is public on GitHub."),
        ],
    },
    {
        "slug": "remove-metadata-from-pdf",
        "title": "How to Remove Metadata from a PDF (Including Hidden XMP)",
        "seo_title": "How to Remove Metadata from a PDF, Including XMP - TrustPDF",
        "description": "What a PDF says about you, where it hides it, and how to strip it before you share the file.",
        "meta_description": "PDFs can reveal your name, company, software and edit dates. See what metadata your PDF contains and remove all of it, including the hidden XMP block, free and without uploading.",
        "tools": ["pdf_metadata_viewer", "pdf_metadata_editor", "redact_pdf"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("What metadata does a PDF contain?", "Usually a title, author, subject, keywords, the program that created the file, the program that produced the PDF, and the creation and modification dates. Many files also contain an XMP block, which can repeat these fields and add more, such as edit history."),
            ("Does removing metadata change the content of the PDF?", "No. Pages, text and images stay exactly as they are; only the information about the document is removed."),
            ("Does “Save as PDF” or printing to PDF remove metadata?", "Not reliably. It usually replaces some fields with new ones, such as your name from the computer's user account and the printing software. Check the result with a metadata viewer."),
        ],
    },
    {
        "slug": "password-protect-pdf-free",
        "title": "How to Password Protect a PDF for Free",
        "seo_title": "How to Password Protect a PDF for Free, No Upload - TrustPDF",
        "description": "Encrypt a PDF with AES-256 so only people with the password can open it, without paying for Acrobat.",
        "meta_description": "Add a password to a PDF for free with AES-256 encryption, without Adobe Acrobat and without uploading the file. How open and owner passwords differ, and how to pick a strong one.",
        "tools": ["protect_pdf", "unlock_pdf", "pdf_metadata_editor"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("Can I password protect a PDF without Adobe Acrobat?", "Yes. Protect PDF on TrustPDF encrypts the file with AES-256, the same encryption Acrobat uses, for free and in your browser."),
            ("Is the title of a protected PDF encrypted too?", "The metadata (title, author and so on) is encrypted along with the content. The file name is not, so do not put confidential details in the file name."),
            ("How should I send the password?", "Through a different channel from the file: if you email the PDF, send the password by text message or tell it by phone. Anyone who gets both together can open the file."),
        ],
    },
    {
        "slug": "compress-pdf-for-email",
        "title": "How to Make a PDF Smaller for Email",
        "seo_title": "How to Make a PDF Smaller for Email (Free, No Upload) - TrustPDF",
        "description": "Email attachment limits, why scanned PDFs are so big, and which compression setting to use.",
        "meta_description": "PDF too big to email? Learn the attachment limits of Gmail and Outlook, why scans are so large, and how to shrink a PDF for free in your browser, without uploading it anywhere.",
        "tools": ["compress_pdf", "split_pdf", "pdf_to_jpg"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("What is the maximum attachment size for email?", "Gmail and Yahoo Mail accept about 25 MB per email, Outlook.com about 20 MB, and many company mail servers 10 MB or less. Encoding makes an attachment roughly a third bigger in transit, so aim well below the limit."),
            ("Why is my PDF so big?", "Almost always because of images: scanned pages, photos taken with a phone, or pictures pasted in at full camera resolution. A text-only PDF of a hundred pages is often under 1 MB."),
            ("Will compressing a PDF make it blurry?", "Lossless compression changes nothing you can see. Strong compression turns pages into JPEG images at 150 DPI, which looks sharp on screen and in normal printing; Maximum (100 DPI) is fine for reading on screen."),
        ],
    },
    {
        "slug": "sign-pdf-without-uploading",
        "title": "How to Sign a PDF Without Uploading It",
        "seo_title": "How to Sign a PDF Without Uploading It (Free) - TrustPDF",
        "description": "Sign a contract or form on your computer or phone, without printing, scanning or sending it to a signing service.",
        "meta_description": "Sign a PDF for free without printing, scanning or uploading it. Draw, type or upload your signature, place it on the page and save, on your computer or phone. Is it legally valid?",
        "tools": ["sign_pdf", "fill_pdf_form", "flatten_pdf"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("Is a signature added this way legally binding?", "It is a simple electronic signature. In the EU (eIDAS) and the US (ESIGN Act) simple electronic signatures are generally valid for most contracts. Some documents, such as certain property, court or notarial documents, require a qualified or certified signature from a trust service provider."),
            ("Can I sign a PDF on my phone?", "Yes. Open Sign PDF in your phone's browser, draw your signature with your finger, drag it into place and save the file."),
            ("Should I fill in the form before or after signing?", "Before. Fill in the fields first, flatten the form if you want the answers fixed, then add your signature as the last step."),
        ],
    },
    {
        "slug": "fill-pdf-form-without-uploading",
        "title": "How to Fill In a PDF Form Without Uploading It",
        "seo_title": "How to Fill In a PDF Form Without Uploading It - TrustPDF",
        "description": "Complete tax, visa, job and medical forms on your own device, then flatten and sign them.",
        "meta_description": "Fill in a PDF form for free without uploading it, printing it or installing anything. Type answers, tick boxes, flatten the form so it can't be changed, and sign it. Works on phones too.",
        "tools": ["fill_pdf_form", "flatten_pdf", "sign_pdf"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("How do I know if a PDF is fillable?", "Open it in TrustPDF's Fill PDF Form: if it lists fields, the form is fillable. In most PDF readers, fillable fields are also highlighted or show a cursor when you click them."),
            ("Can I fill in a PDF that is not fillable?", "Not with Fill PDF Form, which needs form fields. You can still sign a flat PDF with Sign PDF, or print it and fill it in by hand."),
            ("Why do my answers disappear when I open the PDF elsewhere?", "Some viewers, printers and upload portals do not show form fields correctly. Flattening the form turns the answers into normal page content, so they show up everywhere."),
        ],
    },
    {
        "slug": "make-scanned-pdf-searchable",
        "title": "How to Make a Scanned PDF Searchable (Free OCR, No Upload)",
        "seo_title": "How to Make a Scanned PDF Searchable, Free OCR - TrustPDF",
        "description": "Turn pictures of pages into text you can search, select and copy, with OCR that runs in your browser.",
        "meta_description": "Make a scanned PDF searchable for free with OCR that runs in your browser. Search, select and copy text in scans without uploading them. Tips for the best accuracy.",
        "tools": ["ocr_pdf", "pdf_to_text", "pdf_to_word"],
        "published": datetime.date(2026, 11, 21),
        "updated": datetime.date(2026, 11, 21),
        "faq": [
            ("How do I know if my PDF needs OCR?", "Try to select a word or press Ctrl+F (Cmd+F on a Mac) and search for one. If you cannot select or find text you can see, the page is an image and needs OCR."),
            ("Does OCR change how the PDF looks?", "No. TrustPDF keeps the original page images and adds an invisible text layer on top, so the document looks exactly the same."),
            ("Can OCR read handwriting?", "Not reliably. OCR engines like Tesseract are made for printed text; handwriting usually comes out wrong or not at all."),
        ],
    },
]

for _guide in GUIDES:
    _guide["path"] = f"/guides/{_guide['slug']}/"
    _guide["url_name"] = f"pages:guide_{_guide['slug'].replace('-', '_')}"
    _guide["template_name"] = f"guides/{_guide['slug']}.html"
    _guide["tool_list"] = [_TOOLS[name] for name in _guide["tools"]]
    _guide["main_tool"] = _guide["tool_list"][0]
    _guide["og_image"] = _guide["main_tool"]["og_image"]
    _guide["faq_items"] = [{"q": q, "a": a} for q, a in _guide["faq"]]

# Each tool page lists the guides that use it.
for _tool in TOOLS:
    _tool["guides"] = [g for g in GUIDES if _tool["name"] in g["tools"]]

GUIDES_PAGE = {
    "title": "Guides",
    "seo_title": "PDF Guides: Edit PDFs Privately, Without Uploading - TrustPDF",
    "description": "Step-by-step guides to redacting, signing, compressing and protecting PDFs without uploading them.",
    "meta_description": "Free step-by-step guides to working with PDFs privately: redact, sign, fill in, compress, password protect and OCR PDFs without uploading them to anyone's server.",
    "og_title": "PDF Guides - TrustPDF",
    "og_description": "Step-by-step guides to working with PDFs privately, without uploading them.",
    "og_image": "img/og/trustpdf-og.jpg",
}
