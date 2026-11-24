import datetime
import json
import re
import warnings
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase, TestCase, override_settings
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

    databases = {"default"}  # guide release dates set in the admin

    def test_public_pages_set_no_cookies(self):
        for path in ["/", reverse("pages:merge_pdf"), reverse("pages:privacy")]:
            with self.subTest(path=path):
                self.assertEqual(dict(self.client.get(path).cookies), {})

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
                self.assertRegex(html, rf'js/tools/{tool["script"]}(\.[0-9a-f]+)?\.js')

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

    def test_static_files_carry_the_same_policy(self):
        """A web worker takes its policy from its own script's response, not from the
        page, so WhiteNoise must send the site's policy with the static files."""
        from whitenoise.middleware import WhiteNoiseMiddleware

        self.assertIn("whitenoise.middleware.WhiteNoiseMiddleware", settings.MIDDLEWARE)
        headers = {}
        settings.WHITENOISE_ADD_HEADERS_FUNCTION(headers, "/x/js/trustpdf-worker.js", "/static/js/trustpdf-worker.js")
        self.assertEqual(headers["Content-Security-Policy"], self.client.get("/")["Content-Security-Policy"])
        self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
        # ... and WhiteNoise is really given that function.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # "No directory at STATIC_ROOT" before the first collectstatic
            whitenoise = WhiteNoiseMiddleware(lambda request: None)
        self.assertIs(whitenoise.add_headers_function, settings.WHITENOISE_ADD_HEADERS_FUNCTION)

    def test_security_headers(self):
        response = self.client.get(reverse("pages:index"))
        csp = response["Content-Security-Policy"]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("connect-src 'self';", csp)  # scripts may talk to this site only
        self.assertNotIn("http", csp)  # no third-party origin anywhere
        self.assertNotIn("unsafe-inline", csp)  # no inline scripts and no inline styles
        self.assertIn("camera=()", response["Permissions-Policy"])
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    def test_no_inline_scripts_or_handlers(self):
        """Inline JS would be blocked by the CSP, so none may exist."""
        for tool in TOOLS:
            html = self.client.get(reverse(f"pages:{tool['name']}")).content.decode()
            self.assertNotRegex(html, r'<script(?![^>]*\ssrc=)(?![^>]*type="application/ld\+json")[^>]*>', tool["name"])
            self.assertNotRegex(html, r"\son(click|change|load)=", tool["name"])

    def test_no_inline_styles(self):
        """Inline CSS would be blocked by the CSP too."""
        paths = [reverse(f"pages:{t['name']}") for t in TOOLS]
        paths += [reverse(f"pages:{n}") for n in ("index", "about", "privacy", "cookies", "terms", "privacy_tools")]
        paths.append("/analytics/ignore/")
        for path in paths:
            html = self.client.get(path).content.decode()
            self.assertNotRegex(html, r"<style|\sstyle=", path)

    def test_no_third_party_assets(self):
        html = self.client.get(reverse("pages:merge_pdf")).content.decode()
        self.assertIn("js/trustpdf-analytics", html)  # first-party statistics script
        for match in re.findall(r'(?:src|href)="(https?://[^"]+)"', html):
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

    databases = {"default"}  # guide release dates set in the admin

    def test_every_tool_has_assets_and_content(self):
        static = Path(settings.BASE_DIR) / "static"
        for tool in TOOLS:
            with self.subTest(tool=tool["name"]):
                for key in ("icon", "og_image"):
                    self.assertTrue((static / tool[key]).is_file(), tool[key])
                self.assertTrue((static / "js" / "tools" / f"{tool['script']}.js").is_file())
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

    def test_service_worker_lists_every_page_and_tool_script(self):
        response = self.client.get("/sw.js")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/javascript"))
        self.assertEqual(response["Cache-Control"], "no-cache")
        body = response.content.decode()
        static = Path(settings.BASE_DIR) / "static"
        for path in re.findall(r'"/static/([^"]+)"', body):
            self.assertTrue((static / path).is_file(), path)
        for tool in TOOLS:
            self.assertIn(f'"{tool["path"]}"', body)
            self.assertIn(f'js/tools/{tool["script"]}.js"', body)
        self.assertNotIn(settings.ADMIN_PATH, body)  # the staff path is never mentioned
        self.assertIn('data-sw="/sw.js"', self.client.get("/").content.decode())

    def test_tool_pages_load_only_the_libraries_they_use(self):
        merge = self.client.get(reverse("pages:merge_pdf")).content.decode()
        self.assertNotIn('<script src="/static/js/pdf-lib.min.js"', merge)  # runs in the worker
        self.assertIn("js/Sortable.min.js", merge)
        text = self.client.get(reverse("pages:pdf_to_text")).content.decode()
        self.assertNotIn('<script src="/static/js/pdf-lib.min.js"', text)
        self.assertNotIn("Sortable", text)
        self.assertIn('<script src="/static/js/pdf-lib.min.js"', self.client.get(reverse("pages:rotate_pdf_pages")).content.decode())

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
        for old, new in [("/tools/pdf-to-image/", "/tools/pdf-to-jpg/"), ("/compress/", "/tools/compress-pdf/"), ("/tools/", "/")]:
            response = self.client.get(old)
            self.assertEqual((response.status_code, response["Location"]), (301, new))

    def test_old_root_tool_urls_redirect(self):
        for slug in ["merge-pdf", "split-pdf", "rotate-pdf-pages", "remove-pdf-pages", "reorder-pdf-pages",
                     "images-to-pdf", "pdf-metadata-viewer", "pdf-metadata-editor"]:
            response = self.client.get(f"/{slug}/")
            self.assertEqual((response.status_code, response["Location"]), (301, f"/tools/{slug}/"))

    def test_variant_pages_are_own_landing_pages(self):
        """JPG to PDF etc. are real pages (not redirects) that run the main tool's script."""
        variants = [t for t in TOOLS if t.get("variant_of")]
        self.assertTrue(variants)
        home = self.client.get("/").content.decode()
        for tool in variants:
            with self.subTest(tool=tool["name"]):
                response = self.client.get(tool["path"])
                self.assertEqual(response.status_code, 200)
                html = response.content.decode()
                self.assertIn(f"<h1>{tool['title']}</h1>", html)
                self.assertRegex(html, rf'js/tools/{tool["variant_of"]}(\.[0-9a-f]+)?\.js')
                self.assertNotIn(f'href="{tool["path"]}" class="tool-card"', home)
        png = self.client.get("/tools/pdf-to-png/").content.decode()
        self.assertIn('<option value="png" selected>', png)

    def test_sitemap_has_images(self):
        xml = self.client.get("/sitemap.xml").content.decode()
        self.assertIn("<image:loc>", xml)


@override_settings(
    SECURE_SSL_REDIRECT=False,
    STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}},
)
@mock.patch("pages.guides.today", new=lambda: datetime.date(2100, 1, 1))  # every guide is live
class GuideTests(SimpleTestCase):
    """The how-to guides: pages, SEO tags, structured data and links to tools."""

    databases = {"default"}  # release dates set in the admin

    def test_guide_pages_render_with_seo(self):
        from .guides import GUIDES
        self.assertGreaterEqual(len(GUIDES), 5)
        for guide in GUIDES:
            with self.subTest(guide=guide["slug"]):
                self.assertEqual(reverse(guide["url_name"]), guide["path"])
                response = self.client.get(guide["path"])
                self.assertEqual(response.status_code, 200)
                html = response.content.decode()
                self.assertIn(f"<title>{escape(guide['seo_title'])}</title>", html)
                self.assertIn(f"<h1>{escape(guide['title'])}</h1>", html)
                self.assertIn(f'<link rel="canonical" href="{settings.SITE_URL}{guide["path"]}">', html)
                self.assertIn('<meta property="og:type" content="article">', html)
                self.assertLessEqual(len(guide["seo_title"]), 70)
                self.assertLessEqual(len(guide["meta_description"]), 200)
                self.assertNotIn("&", guide["seo_title"])
                # The article links to the tool it is about.
                self.assertIn(f'href="{guide["main_tool"]["path"]}"', html)
                self.assertNotRegex(html, r"<style|\sstyle=")
                self.assertNotRegex(html, r'<script(?![^>]*\ssrc=)(?![^>]*type="application/ld\+json")[^>]*>')

    def test_guide_json_ld_matches_visible_content(self):
        from .guides import GUIDES
        for guide in GUIDES:
            with self.subTest(guide=guide["slug"]):
                html = self.client.get(guide["path"]).content.decode()
                graph = {node["@type"]: node for node in json_ld(html)["@graph"]}
                for kind in ("WebPage", "Article", "BreadcrumbList", "Organization", "WebSite", "Person"):
                    self.assertIn(kind, graph)
                self.assertEqual(graph["Article"]["headline"], guide["title"])
                self.assertEqual(len(graph["BreadcrumbList"]["itemListElement"]), 3)
                if guide["faq"]:
                    for question in graph["FAQPage"]["mainEntity"]:
                        self.assertIn(f"<summary>{escape(question['name'])}</summary>", html)

    def test_guide_links_resolve(self):
        """Every internal link in every guide points to a page that exists."""
        from .guides import GUIDES
        for guide in GUIDES:
            html = self.client.get(guide["path"]).content.decode()
            for href in set(re.findall(r'href="(/[^"#]*)', html)):
                if href.startswith("/static/"):
                    continue
                with self.subTest(guide=guide["slug"], href=href):
                    self.assertEqual(self.client.get(href).status_code, 200, href)

    def test_guides_index_sitemap_and_llms(self):
        from .guides import GUIDES
        html = self.client.get("/guides/").content.decode()
        self.assertIn("CollectionPage", html)
        xml = self.client.get("/sitemap.xml").content.decode()
        llms = self.client.get("/llms.txt").content.decode()
        home = self.client.get("/").content.decode()
        self.assertIn(f"{settings.SITE_URL}/guides/</loc>", xml)
        for guide in GUIDES:
            self.assertIn(f'href="{guide["path"]}"', html)
            self.assertIn(f'href="{guide["path"]}"', home)
            self.assertIn(f"{settings.SITE_URL}{guide['path']}</loc>", xml)
            self.assertIn(f"{settings.SITE_URL}{guide['path']}", llms)

    def test_unpublished_guides_are_hidden(self):
        """A guide is a 404 and missing from every list until its published date."""
        from .guides import GUIDES
        later = max(GUIDES, key=lambda g: g["published"])
        earlier = [g for g in GUIDES if g["published"] < later["published"]]
        self.assertTrue(earlier)
        before = later["published"] - datetime.timedelta(days=1)
        tool_path = later["main_tool"]["path"]
        with mock.patch("pages.guides.today", new=lambda: before):
            self.assertEqual(self.client.get(later["path"]).status_code, 404)
            for url in ("/", "/guides/", "/sitemap.xml", "/llms.txt", "/llms-full.txt", tool_path, earlier[0]["path"]):
                with self.subTest(url=url):
                    self.assertNotIn(later["path"], self.client.get(url).content.decode())
        with mock.patch("pages.guides.today", new=lambda: later["published"]):
            self.assertEqual(self.client.get(later["path"]).status_code, 200)
            self.assertIn(f'href="{later["path"]}"', self.client.get("/guides/").content.decode())
            self.assertIn(f'href="{later["path"]}"', self.client.get(tool_path).content.decode())

    def test_guide_link_waits_for_its_target(self):
        from django.template import Context, Template
        from .guides import GUIDES
        target = max(GUIDES, key=lambda g: g["published"])
        tpl = Template("{% load guide_links %}{% guide_link '" + target["slug"] + "' 'Read this' %}")
        with mock.patch("pages.guides.today", new=lambda: target["published"] - datetime.timedelta(days=1)):
            self.assertEqual(tpl.render(Context()), "Read this")
        with mock.patch("pages.guides.today", new=lambda: target["published"]):
            self.assertEqual(tpl.render(Context()), f'<a href="{target["path"]}">Read this</a>')

    def test_tool_pages_link_to_their_guides(self):
        html = self.client.get(reverse("pages:redact_pdf")).content.decode()
        self.assertIn('href="/guides/redact-pdf-without-uploading/"', html)
        self.assertIn('href="/guides/"', html)  # main navigation

    def test_flatten_variant_is_preset(self):
        html = self.client.get("/tools/flatten-pdf/").content.decode()
        self.assertIn('id="flattenForm" checked', html)
        self.assertIn("Flatten PDF", html)
        self.assertNotIn('id="flattenForm" checked', self.client.get("/tools/fill-pdf-form/").content.decode())


@override_settings(
    SECURE_SSL_REDIRECT=False,
    STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}},
)
class GuideScheduleTests(TestCase):
    """Release dates changed in the admin override the dates in guides.py."""

    def setUp(self):
        from .guides import GUIDES
        self.guides = sorted(GUIDES, key=lambda g: g["published"])
        self.old, self.new = self.guides[0], self.guides[-1]

    def test_hold_and_publish_early(self):
        from .models import GuideSchedule
        GuideSchedule.objects.create(slug=self.old["slug"], publish_on=None)
        GuideSchedule.objects.create(slug=self.new["slug"], publish_on=datetime.date(2000, 1, 1))
        self.assertEqual(self.client.get(self.old["path"]).status_code, 404)
        self.assertNotIn(self.old["path"], self.client.get("/guides/").content.decode())
        html = self.client.get(self.new["path"]).content.decode()
        self.assertEqual(self.client.get(self.new["path"]).status_code, 200)
        article = next(n for n in json_ld(html)["@graph"] if n["@type"] == "Article")
        self.assertEqual(article["datePublished"], "2000-01-01")
        self.assertEqual(article["dateModified"], "2000-01-01")
        self.assertIn(f'href="{self.new["path"]}"', self.client.get("/guides/").content.decode())

    def test_admin_lists_every_guide_and_publishes_now(self):
        from django.contrib.auth import get_user_model
        from .guides import GUIDES, today
        from .models import GuideSchedule
        admin = get_user_model().objects.create_superuser("boss", "boss@example.com", "pw-123-long-enough")
        self.client.force_login(admin)
        url = reverse("admin:pages_guideschedule_changelist")
        html = self.client.get(url).content.decode()
        for guide in GUIDES:
            self.assertIn(escape(guide["title"]), html)
        self.assertEqual(GuideSchedule.objects.count(), len(GUIDES))
        row = GuideSchedule.objects.get(slug=self.new["slug"])
        self.client.post(url, {"action": "publish_now", "_selected_action": [row.pk]})
        row.refresh_from_db()
        self.assertEqual(row.publish_on, today())
