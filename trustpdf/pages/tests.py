import re

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from django.urls import reverse

from .tools import TOOLS, STATIC_PAGES


@override_settings(
    SECURE_SSL_REDIRECT=False,
    # Tests must not depend on `collectstatic` having been run.
    STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}},
)
class PageTests(SimpleTestCase):
    """Every public page renders, and the SEO tags point to pages that exist."""

    def test_static_pages_render(self):
        for name in ["index", "about", "privacy", "cookies", "terms", "privacy_tools"]:
            with self.subTest(page=name):
                response = self.client.get(reverse(f"pages:{name}"))
                self.assertEqual(response.status_code, 200)

    def test_tool_pages_render_with_seo_title(self):
        for tool in TOOLS:
            with self.subTest(tool=tool["name"]):
                response = self.client.get(reverse(f"pages:{tool['name']}"))
                self.assertEqual(response.status_code, 200)
                html = response.content.decode()
                self.assertIn(f"<title>{tool['og_title']}</title>", html)
                self.assertRegex(html, rf'js/tools/{tool["name"]}(\.[0-9a-f]+)?\.js')

    def test_canonical_urls_resolve(self):
        pages = [reverse(f"pages:{t['name']}") for t in TOOLS] + [reverse("pages:about")]
        for path in pages:
            with self.subTest(path=path):
                html = self.client.get(path).content.decode()
                canonical = re.search(r'<link rel="canonical" href="([^"]+)">', html).group(1)
                self.assertTrue(canonical.startswith(settings.SITE_URL))
                local_path = canonical[len(settings.SITE_URL):]
                self.assertEqual(self.client.get(local_path).status_code, 200, canonical)
                og_url = re.search(r'<meta property="og:url" content="([^"]+)">', html).group(1)
                self.assertEqual(og_url, canonical)

    def test_tool_paths_match_urlconf(self):
        for tool in TOOLS:
            self.assertEqual(reverse(f"pages:{tool['name']}"), tool["path"])

    def test_static_page_titles(self):
        html = self.client.get(reverse("pages:index")).content.decode()
        self.assertIn(f"<title>{STATIC_PAGES['index']['seo_title']}</title>", html)

    def test_old_urls_redirect_permanently(self):
        for old, new in [("/merge/", "pages:merge_pdf"), ("/split/", "pages:split_pdf")]:
            response = self.client.get(old)
            self.assertEqual(response.status_code, 301)
            self.assertEqual(response["Location"], reverse(new))

    def test_sitemap_lists_every_page(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, 200)
        xml = response.content.decode()
        for tool in TOOLS:
            self.assertIn(f"{settings.SITE_URL}{tool['path']}", xml)
        self.assertIn(f"{settings.SITE_URL}/terms/", xml)
        self.assertNotIn("lastmod", xml)

    def test_robots(self):
        response = self.client.get("/robots.txt")
        self.assertEqual(response["Content-Type"], "text/plain")
        self.assertIn(f"Sitemap: {settings.SITE_URL}/sitemap.xml", response.content.decode())

    def test_404_page(self):
        response = self.client.get("/does-not-exist/")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Page not found", response.content.decode())

    def test_security_headers(self):
        response = self.client.get(reverse("pages:index"))
        csp = response["Content-Security-Policy"]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("connect-src 'self' https://cloud.umami.is", csp)
        self.assertNotIn("unsafe-inline", csp.split("style-src")[0])
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    def test_no_inline_scripts_or_handlers(self):
        """Inline JS would be blocked by the CSP, so none may exist."""
        for tool in TOOLS:
            html = self.client.get(reverse(f"pages:{tool['name']}")).content.decode()
            self.assertNotRegex(html, r"<script(?![^>]*\ssrc=)[^>]*>", tool["name"])
            self.assertNotRegex(html, r"\son(click|change|load)=", tool["name"])

    def test_no_third_party_assets(self):
        html = self.client.get(reverse("pages:merge_pdf")).content.decode()
        for match in re.findall(r'(?:src|href)="(https?://[^"]+)"', html):
            if match.startswith(settings.UMAMI_SCRIPT_URL):
                continue  # the one documented third-party script
            self.assertFalse(re.search(r"\.(css|js|woff2?)(\?|$)", match), match)
