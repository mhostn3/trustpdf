import json
import re
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils.html import escape

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
                self.assertIn(f"<title>{escape(tool['seo_title'])}</title>", html)
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
            self.assertNotRegex(html, r'<script(?![^>]*\ssrc=)(?![^>]*type="application/ld\+json")[^>]*>', tool["name"])
            self.assertNotRegex(html, r"\son(click|change|load)=", tool["name"])

    def test_no_third_party_assets(self):
        html = self.client.get(reverse("pages:merge_pdf")).content.decode()
        for match in re.findall(r'(?:src|href)="(https?://[^"]+)"', html):
            if match.startswith(settings.UMAMI_SCRIPT_URL):
                continue  # the one documented third-party script
            self.assertFalse(re.search(r"\.(css|js|woff2?)(\?|$)", match), match)


def json_ld(html):
    match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    assert match, "no JSON-LD block"
    return json.loads(match.group(1))


@override_settings(
    SECURE_SSL_REDIRECT=False,
    STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}},
)
class SeoTests(SimpleTestCase):
    """Structured data, crawler files and per-tool content."""

    def test_every_tool_has_assets_and_content(self):
        static = Path(settings.BASE_DIR) / "static"
        for tool in TOOLS:
            with self.subTest(tool=tool["name"]):
                for key in ("icon", "og_image"):
                    self.assertTrue((static / tool[key]).is_file(), tool[key])
                self.assertTrue((static / "js" / "tools" / f"{tool['name']}.js").is_file())
                self.assertGreaterEqual(len(tool["steps"]), 3)
                self.assertGreaterEqual(len(tool["faq"]), 3)
                self.assertLessEqual(len(tool["seo_title"]), 70, "title gets cut off in results")
                self.assertLessEqual(len(tool["meta_description"]), 200)
                self.assertNotIn("&", tool["seo_title"])

    def test_tool_json_ld_matches_visible_content(self):
        for tool in TOOLS:
            with self.subTest(tool=tool["name"]):
                html = self.client.get(tool["path"]).content.decode()
                graph = {node["@type"]: node for node in json_ld(html)["@graph"]}
                for kind in ("WebPage", "WebApplication", "HowTo", "FAQPage", "BreadcrumbList", "Organization", "WebSite"):
                    self.assertIn(kind, graph)
                self.assertEqual(graph["WebApplication"]["offers"]["price"], "0")
                self.assertEqual(len(graph["HowTo"]["step"]), len(tool["steps"]))
                # Every FAQ question in the structured data is also on the page.
                for question in graph["FAQPage"]["mainEntity"]:
                    self.assertIn(f"<summary>{escape(question['name'])}</summary>", html)
                self.assertIn(escape(tool["how_to_title"]), html)

    def test_home_json_ld_and_faq(self):
        html = self.client.get("/").content.decode()
        types = {node["@type"] for node in json_ld(html)["@graph"]}
        self.assertTrue({"WebSite", "Organization", "ItemList", "FAQPage"} <= types)
        for tool in TOOLS:
            self.assertIn(f'href="{tool["path"]}"', html)

    def test_json_ld_cannot_break_out_of_script(self):
        from .seo import render
        out = str(render([{"name": "</script><script>alert(1)</script>"}]))
        self.assertNotIn("</script>", out)
        self.assertEqual(json.loads(out)["@graph"][0]["name"], "</script><script>alert(1)</script>")

    def test_robots_allows_ai_crawlers(self):
        body = self.client.get("/robots.txt").content.decode()
        for bot in ("GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot"):
            self.assertIn(f"User-agent: {bot}", body)
        self.assertNotRegex(body, r"Disallow: /\S")

    def test_llms_txt(self):
        for path in ("/llms.txt", "/llms-full.txt"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response["Content-Type"].startswith("text/plain"))
                body = response.content.decode()
                self.assertTrue(body.startswith("# TrustPDF"))
                self.assertNotIn("&#x27;", body)
                for tool in TOOLS:
                    self.assertIn(f"{settings.SITE_URL}{tool['path']}", body)
        self.assertIn(TOOLS[0]["faq"][1][0], self.client.get("/llms-full.txt").content.decode())

    def test_manifest_and_security_txt(self):
        manifest = json.loads(self.client.get("/manifest.webmanifest").content)
        self.assertEqual(manifest["short_name"], "TrustPDF")
        body = self.client.get("/.well-known/security.txt").content.decode()
        self.assertIn(f"Contact: mailto:{settings.CONTACT_EMAIL}", body)
        self.assertIn("Expires: ", body)

    def test_indexnow_key(self):
        self.assertEqual(self.client.get("/0123456789abcdef.txt").status_code, 404)
        with self.settings(INDEXNOW_KEY="0123456789abcdef"):
            response = self.client.get("/0123456789abcdef.txt")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content.decode(), "0123456789abcdef")

    def test_verification_meta_tags(self):
        html = self.client.get("/").content.decode()
        self.assertNotIn("google-site-verification", html)
        with self.settings(GOOGLE_SITE_VERIFICATION="g-abc", BING_SITE_VERIFICATION="b-xyz"):
            html = self.client.get("/").content.decode()
            self.assertIn('<meta name="google-site-verification" content="g-abc">', html)
            self.assertIn('<meta name="msvalidate.01" content="b-xyz">', html)

    def test_alternative_urls_redirect(self):
        for old, new in [("/tools/jpg-to-pdf/", "/tools/images-to-pdf/"), ("/compress/", "/tools/compress-pdf/"), ("/tools/", "/")]:
            response = self.client.get(old)
            self.assertEqual((response.status_code, response["Location"]), (301, new))

    def test_sitemap_has_images(self):
        xml = self.client.get("/sitemap.xml").content.decode()
        self.assertIn("<image:loc>", xml)
