# TrustPDF

**TrustPDF** is a privacy-first, client-side PDF toolbox, released as open source under the AGPLv3 license.
Every tool runs entirely in your browser: **no uploads, no accounts, no cookies**.

🌐 Live: [https://www.trustpdf.net](https://www.trustpdf.net)

---

## 🚀 Tools

| Tool | What it does |
| --- | --- |
| **Merge PDF** | Combine several PDFs into one, in the order you choose |
| **Split PDF** | Extract pages by clicking thumbnails or typing ranges (`1-3,5,8-10`); optionally one PDF per page as a ZIP |
| **Rotate PDF Pages** | Rotate all pages or selected ones, with a live preview |
| **Remove PDF Pages** | Delete pages you don't need |
| **Reorder PDF Pages** | Drag page thumbnails into a new order |
| **PDF Metadata Viewer** | See title, author, producer, dates, and whether a hidden XMP stream exists |
| **PDF Metadata Editor** | Edit the fields, or strip all metadata (including XMP) before sharing |
| **Images to PDF** | Turn JPG/PNG images into a PDF (original size, A4 or Letter, optional margins) |

Features:

- 🔒 100% **client-side** processing with [pdf-lib](https://github.com/Hopding/pdf-lib) and [PDF.js](https://mozilla.github.io/pdf.js/); files never leave your device
- 🛡️ A strict `Content-Security-Policy` on every page makes that promise enforceable: scripts can only talk to the site itself and the analytics endpoint
- 🧭 No login, no storage, no cookies, no third-party CDNs; all CSS, fonts and JS are self-hosted
- 🌗 Light and dark mode following the OS setting (not stored)
- 📱 Works on mobile and desktop, keyboard accessible
- 🧩 Built with Django, Bootstrap 5, pdf-lib, PDF.js and SortableJS

---

## 🛠 Project layout

```
trustpdf/                  Django project (manage.py lives here)
  trustpdf/settings.py     settings, security headers, CSP directives
  pages/tools.py           the list of tools and SEO text for every page
  pages/urls.py            routes: /, /about/, /privacy/, /cookies/, /terms/, /tools/<tool>/
  pages/templates/tools/   one small template per tool, all extending tool_base.html
  static/js/trustpdf-core.js   shared behaviour: file handling, errors, page ranges, download
  static/js/trustpdf-pages.js  thumbnail page picker (PDF.js)
  static/js/tools/<tool>.js    the logic of each tool
deploy/deploy.sh           production deploy script
tests/e2e/                 browser smoke test (Playwright)
```

Adding a tool means: an entry in `pages/tools.py`, a template in `pages/templates/tools/`, a script in
`static/js/tools/`, an icon and an OG image.

---

## 💻 Local development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then set SECRET_KEY, DEBUG=True, ALLOWED_HOSTS=localhost,127.0.0.1
cd trustpdf
python manage.py runserver
```

Run the Django tests (routing, SEO tags, security headers):

```bash
python manage.py test
```

Run the browser smoke test, which exercises every tool with real files
(needs Node, Playwright with Chromium, and Pillow for the fixtures):

```bash
python tests/e2e/make_fixtures.py
cd trustpdf && DEBUG=False python manage.py collectstatic --noinput && python manage.py runserver 127.0.0.1:8765 &
BASE_URL=http://127.0.0.1:8765 node tests/e2e/smoke.js
```

---

## 🚢 Deployment

The site runs under gunicorn behind a TLS-terminating proxy, with static files served by WhiteNoise
(`collectstatic` is required, filenames are hashed and cached for a year).

Configuration comes from a `.env` file in the repository root; see [`.env.example`](.env.example) for
every variable. `check --deploy` should pass with no warnings.

[`deploy/deploy.sh`](deploy/deploy.sh) does a full deploy: pull, upgrade packages, run checks and tests,
collect static files, restart the systemd service, and verify the site answers 200. If the health check
fails it rolls back to the previous commit.

```bash
sudo ./deploy/deploy.sh
```

---

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

You may use, modify, share and self-host the code. If you run a modified version publicly you must
publish its source. See [`LICENSE`](LICENSE) and the
[full AGPLv3 text](https://www.gnu.org/licenses/agpl-3.0.html).

---

## 📈 Analytics

[Umami Cloud](https://umami.is) counts page views and tool usage anonymously, without cookies.
Nothing about your files is recorded. Details: [Privacy Policy](https://www.trustpdf.net/privacy/).
Set `UMAMI_WEBSITE_ID=` (empty) in `.env` to disable it on a self-hosted copy.

---

## 🙋‍♂️ Author and contributions

Created by [mhostn3](https://github.com/mhostn3). Pull requests are not accepted right now, but you are
welcome to [open an issue](https://github.com/mhostn3/trustpdf/issues) for bugs or suggestions, or fork
the repo for learning, self-hosting or private use.

Thanks for respecting the values of TrustPDF: **privacy, simplicity, and transparency**.
