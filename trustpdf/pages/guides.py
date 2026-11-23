"""How-to guides: articles that answer the questions people search for, each
pointing to the tool that does the job.

Each guide drives: the route /guides/<slug>/, the card on /guides/, the
<title>/meta/Open Graph tags, the Article and FAQ structured data, the
sitemap and llms.txt, and the "Guides" links under the tools it uses.
The article body is the template guides/<slug>.html.

A guide goes live on its "published" date: before that its page is a 404
and it is left out of every list, so a batch can be deployed at once and
released one a week. Link from one guide to another with
{% guide_link 'slug' 'text' %}, which prints plain text until the target
is live.

Keep the text truthful and specific to what the tools really do: the FAQ
is repeated word for word in the structured data.
"""
import datetime

from django.utils import timezone

from .tools import TOOLS

_TOOLS = {tool["name"]: tool for tool in TOOLS}

GUIDES = [
    {
        "slug": "merge-pdf-without-uploading",
        "title": "How to Merge PDF Files Without Uploading Them",
        "seo_title": "How to Merge PDF Files Without Uploading Them (Free) - TrustPDF",
        "description": "Combine PDFs into one file in your browser, in the order you choose, without sending them to a server.",
        "meta_description": "Merge PDF files for free without uploading them. Combine PDFs in your browser, set the order, and learn what a merged PDF keeps: titles, bookmarks, forms and passwords.",
        "tools": ["merge_pdf", "reorder_pdf_pages", "compress_pdf"],
        "published": datetime.date(2026, 11, 23),
        "updated": datetime.date(2026, 11, 23),
        "faq": [
            ("Is there a limit to how many PDFs I can merge?", "There is no set limit. The files are combined in your browser, so the practical limit is your device's memory. Hundreds of pages are fine on a normal computer; very large scans may be slow on an older phone."),
            ("Why can't I merge a password-protected PDF?", "An encrypted PDF cannot be read without its password. Remove the password with Unlock PDF first if you know it, merge, and protect the merged file again with Protect PDF if needed."),
            ("Does merging reduce the quality of my PDFs?", "No. Pages are copied as they are: text stays selectable and images are not recompressed. The merged file is about as big as the originals put together."),
        ],
    },
    {
        "slug": "change-pdf-title-and-author",
        "title": "How to Change the Title and Author of a PDF",
        "seo_title": "How to Change the Title and Author of a PDF (Free) - TrustPDF",
        "description": "Fix the title a browser tab or search result shows for your PDF, and replace someone else's name as author.",
        "meta_description": "Change a PDF's title, author, subject and keywords for free, without Acrobat and without uploading the file. Why the old title still shows up, and how to fix it for good.",
        "tools": ["pdf_metadata_editor", "pdf_metadata_viewer"],
        "published": datetime.date(2026, 11, 30),
        "updated": datetime.date(2026, 11, 30),
        "faq": [
            ("Why does my PDF show a different title from its file name?", "The title shown in a browser tab or a PDF reader's title bar comes from the Title field inside the PDF, not from the file name. Change that field with a metadata editor."),
            ("I changed the title but the old one still appears. Why?", "Many PDFs keep a second copy of the metadata in an XMP block, and some readers show that copy first. Remove the XMP block when you save, so only your new values remain."),
            ("Does changing the metadata change the pages?", "No. Only the information about the document changes; the pages, text and images stay exactly as they were."),
        ],
    },
    {
        "slug": "merge-pdf-on-mac-windows-iphone-android",
        "title": "How to Merge PDFs on Mac, Windows, iPhone and Android",
        "seo_title": "How to Merge PDFs on Mac, Windows, iPhone and Android - TrustPDF",
        "description": "What each device can do out of the box, and a free option that works on all of them.",
        "meta_description": "Merge PDF files for free on a Mac with Preview or Finder, on iPhone with the Files app, on Linux from the command line, and on Windows and Android in the browser, without uploading.",
        "tools": ["merge_pdf", "images_to_pdf", "unlock_pdf"],
        "published": datetime.date(2026, 12, 7),
        "updated": datetime.date(2026, 12, 7),
        "faq": [
            ("Can Windows merge PDFs without extra software?", "No. Windows has no built-in tool for combining PDF files. You can use a browser-based tool, which needs no installation, or install a free desktop program."),
            ("How do I merge PDFs on an iPhone?", "In the Files app, select the PDFs, tap More and choose Create PDF. To choose the order yourself, open a browser-based merger in Safari and drag the files into place."),
            ("Can I merge photos and PDFs together?", "Convert the photos to a PDF first with Images to PDF, then merge that PDF with the others."),
        ],
    },
    {
        "slug": "combine-documents-for-job-application",
        "title": "How to Combine Your CV and Certificates into One PDF",
        "seo_title": "How to Combine Your CV and Certificates into One PDF - TrustPDF",
        "description": "Put a cover letter, CV, diplomas and references into one small, tidy PDF for a job portal.",
        "meta_description": "Job portal wants one PDF? Combine your cover letter, CV, diplomas and certificates into one file, get under the size limit and fix the title, free and without uploading.",
        "tools": ["merge_pdf", "compress_pdf", "pdf_metadata_editor"],
        "published": datetime.date(2026, 12, 14),
        "updated": datetime.date(2026, 12, 14),
        "faq": [
            ("In what order should application documents go?", "Unless the job ad says otherwise, a common order is cover letter, CV, then certificates and references from most to least relevant."),
            ("How do I make my application PDF smaller without making my CV blurry?", "Compress only the scanned certificates with a strong setting, then merge them with your CV and cover letter. The scans get smaller while the CV stays sharp, selectable text."),
            ("Should I password-protect my CV?", "No. Recruiters and application portals usually cannot open password-protected PDFs, and some reject them."),
        ],
    },
    {
        "slug": "pdf-documents-for-visa-or-rental-application",
        "title": "How to Prepare PDF Documents for a Visa or Rental Application",
        "seo_title": "How to Prepare PDFs for a Visa or Rental Application - TrustPDF",
        "description": "Scan, combine and shrink your passport, payslips and bank statements without handing them to a converter site.",
        "meta_description": "Prepare passport scans, payslips and bank statements for a visa or rental application: combine them, get under the size limit and share only what is needed, without uploading.",
        "tools": ["images_to_pdf", "merge_pdf", "compress_pdf"],
        "published": datetime.date(2026, 12, 28),
        "updated": datetime.date(2026, 12, 28),
        "faq": [
            ("Should I send one PDF or a separate file for each document?", "Follow the instructions of the office, agency or landlord. Without instructions, one PDF per category, such as all payslips together, is easy to read and check."),
            ("Can I black out information on documents for an application?", "For a private landlord, removing details they don't need, such as your full account number, is often reasonable. For a visa or government office, don't redact anything unless they say you may."),
            ("How do I get a scanned document under the upload size limit?", "Use Compress PDF. Lossless changes nothing visible; Strong, at 150 DPI, makes scans much smaller and is usually still clear. Check that small print is legible before sending."),
        ],
    },
    {
        "slug": "send-tax-return-or-payslip-safely",
        "title": "How to Send a Tax Return or Payslip PDF Safely",
        "seo_title": "How to Send a Tax Return or Payslip PDF Safely - TrustPDF",
        "description": "Send fewer pages, remove what isn't needed, and encrypt the file before it goes into anyone's inbox.",
        "meta_description": "Sending a tax return, payslip or bank statement by email? Send only the pages needed, redact details the recipient doesn't need, and password protect the PDF, free and offline.",
        "tools": ["protect_pdf", "redact_pdf", "extract_pdf_pages"],
        "published": datetime.date(2026, 12, 21),
        "updated": datetime.date(2026, 12, 21),
        "faq": [
            ("Is it safe to email a tax return?", "Ordinary email is not end-to-end encrypted, and attachments stay in mailboxes for years. Password-protect the PDF, send the password through another channel, or use the recipient's secure upload portal if they have one."),
            ("What should I remove before sending a payslip to a landlord?", "Details they don't need to check your income, such as your bank account number, tax or social security number, and other people's names. Use real redaction, not a black box drawn on top."),
            ("How do I send the password for a protected PDF?", "Through a different channel from the file: email the PDF, and send the password by text message or tell it by phone."),
        ],
    },
    {
        "slug": "watermark-id-copy",
        "title": "How to Watermark a Copy of Your ID or Passport",
        "seo_title": "How to Watermark a Copy of Your ID or Passport (Free) - TrustPDF",
        "description": "Stamp who a copy is for, and when, across your ID before you send it, so it is less useful to anyone else.",
        "meta_description": "Add a watermark to a copy of your passport or ID card before sending it to a landlord, hotel or employer. Free, and the image of your ID never leaves your device.",
        "tools": ["watermark_pdf", "images_to_pdf", "compress_pdf"],
        "published": datetime.date(2027, 1, 4),
        "updated": datetime.date(2027, 1, 4),
        "faq": [
            ("What should a watermark on an ID copy say?", "Who the copy is for, why, and the date, for example: Copy for ACME Lettings, rental application, 23/11/2026."),
            ("Can a watermark be removed?", "A text watermark can be deleted by someone with a PDF editor. Running the file through Compress PDF with the Strong setting redraws each page as an image, which bakes the watermark in and makes it much harder to remove."),
            ("Will a watermarked copy still be accepted?", "Usually, if the watermark does not cover the photo or the number so much that they become unreadable. If in doubt, ask the recipient first; some official processes require an unmarked copy."),
        ],
    },
    {
        "slug": "free-adobe-acrobat-alternatives",
        "title": "Free Alternatives to Adobe Acrobat for Everyday PDF Tasks",
        "seo_title": "Free Alternatives to Adobe Acrobat for Everyday PDF Tasks - TrustPDF",
        "description": "Free ways to merge, compress, sign, protect, redact and OCR PDFs, task by task, and when Acrobat is still worth it.",
        "meta_description": "Free alternatives to Adobe Acrobat, task by task: merge, split, compress, sign, password protect, redact and OCR PDFs with built-in apps, free programs or your browser.",
        "tools": ["merge_pdf", "protect_pdf", "redact_pdf"],
        "published": datetime.date(2027, 1, 18),
        "updated": datetime.date(2027, 1, 18),
        "faq": [
            ("Is Adobe Acrobat Reader free?", "Yes. Acrobat Reader is free for viewing, printing, filling in forms and adding a simple signature. Tasks such as merging, compressing, password protecting and redacting need a paid Acrobat plan or another tool."),
            ("What is the best free PDF editor?", "It depends on the task. For merging, signing, compressing or protecting a PDF, free browser and desktop tools do the job. Editing the existing text of a PDF is harder; LibreOffice Draw can do it, but layouts may shift."),
            ("Are free PDF tools safe?", "Desktop tools and in-browser tools keep the file on your device. Many free websites upload it to their servers, so check before using one for confidential documents."),
        ],
    },
    {
        "slug": "desktop-vs-online-vs-browser-pdf-tools",
        "title": "Desktop, Online or In-Browser PDF Tools: Which to Use?",
        "seo_title": "Desktop vs Online vs In-Browser PDF Tools: Which to Use? - TrustPDF",
        "description": "How the three kinds of PDF tools handle your file, compared on privacy, convenience and speed.",
        "meta_description": "Desktop programs, online PDF services and in-browser tools compared: where your file goes, offline use, phones, speed and privacy, and which kind to use for which document.",
        "tools": ["merge_pdf", "compress_pdf", "pdf_metadata_editor"],
        "published": datetime.date(2027, 1, 11),
        "updated": datetime.date(2027, 1, 11),
        "faq": [
            ("What is the difference between an online PDF tool and an in-browser PDF tool?", "Both are websites. An online, server-based tool uploads your file and processes it on the provider's server. An in-browser tool processes the file on your own device, so the file is not sent anywhere."),
            ("Are desktop PDF programs safer than websites?", "A desktop program keeps the file on your computer, like an in-browser tool. It is safer than a server-based website for confidential files, as long as you download it from its official source."),
            ("Which is fastest?", "For large files, desktop programs and in-browser tools avoid the upload and download. For heavy jobs like OCR on a slow device, a server can be faster."),
        ],
    },
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

_BY_SLUG = {g["slug"]: g for g in GUIDES}


def today():
    """The date that decides which guides are live (patched in tests)."""
    return timezone.localdate()


def is_live(guide):
    return guide["published"] <= today()


def live_guides():
    """Published guides, newest first."""
    return sorted((g for g in GUIDES if is_live(g)), key=lambda g: g["published"], reverse=True)


def live_guide(slug):
    """The guide with this slug if it is live, else None."""
    guide = _BY_SLUG[slug]  # a KeyError here means a typo in a guide_link
    return guide if is_live(guide) else None


def guides_for_tool(tool):
    """The live guides that use a tool, for the list on its page."""
    return [g for g in live_guides() if tool["name"] in g["tools"]]

GUIDES_PAGE = {
    "title": "Guides",
    "seo_title": "PDF Guides: Edit PDFs Privately, Without Uploading - TrustPDF",
    "description": "Step-by-step guides to merging, redacting, signing, compressing and protecting PDFs without uploading them.",
    "meta_description": "Free step-by-step guides to working with PDFs privately: merge, redact, sign, fill in, compress, password protect and OCR PDFs, and prepare documents for applications.",
    "og_title": "PDF Guides - TrustPDF",
    "og_description": "Step-by-step guides to working with PDFs privately, without uploading them.",
    "og_image": "img/og/trustpdf-og.jpg",
}
