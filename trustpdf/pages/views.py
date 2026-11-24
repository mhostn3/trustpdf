import datetime
import hashlib
import json
import re

from django.conf import settings
from django.http import Http404, HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.urls import reverse
from django.views.decorators.cache import cache_control
from django.views.generic import TemplateView

from . import seo
from .seo import absolute_static, absolute_url
from .guides import GUIDES_PAGE, guides_for_tool, is_live, live_guides, release_date
from .tools import TOOLS, STATIC_PAGES, HOME_FAQ_ITEMS, tools_by_group


class PageView(TemplateView):
    """Static page with SEO context taken from STATIC_PAGES."""

    page_key = None
    schema_type = "WebPage"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        page = STATIC_PAGES[self.page_key]
        url = absolute_url(self.request.path)
        context.update(page)
        context["canonical_url"] = url
        context["og_image"] = absolute_static(page["og_image"])
        if self.page_key == "index":
            context["json_ld"] = seo.home_graph()
            context["tool_groups"] = tools_by_group()
            context["home_faq"] = HOME_FAQ_ITEMS
            context["guides"] = live_guides()
        else:
            context["json_ld"] = seo.page_graph(url, page["seo_title"], page["meta_description"], self.schema_type)
        return context


class ToolView(TemplateView):
    tool = None

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        tool = self.tool
        context.update({
            "tool": tool,
            "tool_guides": guides_for_tool(tool),
            "seo_title": tool["seo_title"],
            "meta_description": tool["meta_description"],
            "meta_keywords": tool["keywords"],
            "canonical_url": absolute_url(tool["path"]),
            "og_title": tool["seo_title"],
            "og_description": tool["og_description"],
            "og_image": absolute_static(tool["og_image"]),
            "tool_script": f"js/tools/{tool['script']}.js",
            "json_ld": seo.tool_graph(tool),
        })
        return context


class GuideIndexView(TemplateView):
    template_name = "guides_index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        page = GUIDES_PAGE
        guides = live_guides()
        context.update(page)
        context.update({
            "guides": guides,
            "canonical_url": absolute_url("/guides/"),
            "og_image": absolute_static(page["og_image"]),
            "json_ld": seo.guides_index_graph(guides, page["seo_title"], page["meta_description"]),
        })
        return context


_READING_MINUTES = {}


def reading_minutes(guide):
    """Minutes to read a guide's article, at about 220 words a minute."""
    if guide["slug"] not in _READING_MINUTES:
        text = re.sub(r"<[^>]+>", " ", render_to_string(guide["template_name"], {"guide": guide}))
        _READING_MINUTES[guide["slug"]] = max(1, round(len(text.split()) / 220))
    return _READING_MINUTES[guide["slug"]]


class GuideView(TemplateView):
    template_name = "guide.html"
    guide = None

    def get(self, request, *args, **kwargs):
        if not is_live(self.guide):
            raise Http404("This guide is not published yet.")
        return super().get(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        guide = self.guide
        published = release_date(guide)
        if published != guide["published"]:
            # Released on another day from the admin: show that date.
            updated = published if guide["updated"] == guide["published"] else max(guide["updated"], published)
            guide = {**guide, "published": published, "updated": updated}
        context.update({
            "guide": guide,
            "seo_title": guide["seo_title"],
            "meta_description": guide["meta_description"],
            "canonical_url": absolute_url(guide["path"]),
            "og_title": guide["title"],
            "og_type": "article",
            "og_description": guide["description"],
            "og_image": absolute_static(guide["og_image"]),
            "json_ld": seo.guide_graph(guide),
            "reading_minutes": reading_minutes(guide),
            "other_guides": [g for g in live_guides() if g["slug"] != guide["slug"]][:4],
        })
        return context


# ------------------ #
#      Site Map      #
# ------------------ #

SITEMAP_PAGES = [
    # (url name, priority, changefreq)
    ("pages:index", "1.0", "weekly"),
    ("pages:about", "0.5", "yearly"),
    ("pages:privacy_tools", "0.4", "monthly"),
    ("pages:privacy", "0.3", "yearly"),
    ("pages:cookies", "0.3", "yearly"),
    ("pages:terms", "0.3", "yearly"),
]


def sitemap_urls():
    """Every public page as (absolute url, priority, changefreq, image or None)."""
    entries = [(absolute_url(reverse(name)), prio, freq, None) for name, prio, freq in SITEMAP_PAGES]
    entries += [(absolute_url(t["path"]), "0.9", "monthly", t) for t in TOOLS]
    entries.append((absolute_url(reverse("pages:guides")), "0.7", "weekly", None))
    entries += [(absolute_url(g["path"]), "0.7", "monthly", g) for g in live_guides()]
    return entries


@cache_control(max_age=3600, public=True)
def sitemap_xml_view(request):
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
        ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for url, priority, changefreq, item in sitemap_urls():
        lines += ["  <url>", f"    <loc>{url}</loc>", f"    <changefreq>{changefreq}</changefreq>", f"    <priority>{priority}</priority>"]
        if item:
            lines += ["    <image:image>", f"      <image:loc>{absolute_static(item['og_image'])}</image:loc>", "    </image:image>"]
        lines.append("  </url>")
    lines.append("</urlset>")
    return HttpResponse("\n".join(lines) + "\n", content_type="application/xml")


# Crawlers of search engines and AI assistants. Everything on the site is
# public, so all are allowed; they are named so it is explicit, and so a
# site owner who wants to opt one out later only has to change one line.
AI_AND_SEARCH_CRAWLERS = [
    "Googlebot", "Google-Extended", "Bingbot", "DuckDuckBot", "DuckAssistBot", "Applebot", "Applebot-Extended",
    "YandexBot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
    "PerplexityBot", "Perplexity-User", "MistralAI-User", "Amazonbot", "meta-externalagent", "CCBot", "cohere-ai",
]


@cache_control(max_age=86400, public=True)
def robots_txt_view(request):
    lines = [
        "# TrustPDF: free PDF tools that run in the browser. Everything here is public.",
        "# Search engines and AI assistants are welcome. Summary for LLMs: /llms.txt",
        "",
        "User-agent: *",
        "Allow: /",
        "",
    ]
    lines += [f"User-agent: {bot}" for bot in AI_AND_SEARCH_CRAWLERS]
    lines += ["Allow: /", "", f"Sitemap: {absolute_url(reverse('pages:sitemap_xml'))}", ""]
    return HttpResponse("\n".join(lines), content_type="text/plain")


def _text_response(template, context=None):
    body = render_to_string(template, {"tools": TOOLS, "guides": live_guides(), "site_url": settings.SITE_URL, **(context or {})})
    return HttpResponse(body, content_type="text/plain; charset=utf-8")


@cache_control(max_age=86400, public=True)
def llms_txt_view(request):
    """https://llmstxt.org: a short Markdown map of the site for AI assistants."""
    return _text_response("llms.txt", {"tool_groups": tools_by_group(include_variants=True)})


@cache_control(max_age=86400, public=True)
def llms_full_txt_view(request):
    """The same, with every tool's how-to steps and FAQ inlined."""
    return _text_response("llms-full.txt", {"tool_groups": tools_by_group(include_variants=True), "home_faq": HOME_FAQ_ITEMS})


@cache_control(max_age=86400, public=True)
def security_txt_view(request):
    expires = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=180)).replace(microsecond=0)
    body = (
        f"Contact: mailto:{settings.CONTACT_EMAIL}\n"
        f"Contact: https://github.com/mhostn3/trustpdf/issues\n"
        f"Expires: {expires.isoformat().replace('+00:00', 'Z')}\n"
        "Preferred-Languages: en, sl\n"
        f"Canonical: {absolute_url('/.well-known/security.txt')}\n"
    )
    return HttpResponse(body, content_type="text/plain; charset=utf-8")


@cache_control(max_age=86400, public=True)
def manifest_view(request):
    from django.templatetags.static import static

    data = {
        "name": "TrustPDF - Private PDF Tools",
        "short_name": "TrustPDF",
        "description": "Free PDF tools that run in your browser. Files are never uploaded.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#f6f8fc",
        "theme_color": "#ffffff",
        "icons": [
            {"src": static("img/icon-192.png"), "sizes": "192x192", "type": "image/png"},
            {"src": static("img/icon-512.png"), "sizes": "512x512", "type": "image/png"},
        ],
        "shortcuts": [
            {"name": t["title"], "url": t["path"]} for t in TOOLS[:4]
        ],
    }
    return JsonResponse(data, content_type="application/manifest+json", json_dumps_params={"ensure_ascii": False})


# Files every page needs, and the libraries of the tools: stored by the service worker
# on the first visit so the site works offline afterwards. The large on-demand libraries
# (OCR engine and language data, qpdf, the Unicode font) are cached when first used.
OFFLINE_STATIC = [
    "css/bootstrap.min.css", "css/bootstrap-icons.min.css", "css/custom.css",
    "fonts/bootstrap-icons.woff2",
    "js/bootstrap.bundle.min.js", "js/trustpdf-analytics.js", "js/trustpdf-offline.js", "js/trustpdf-home.js",
    "js/trustpdf-core.js", "js/trustpdf-pages.js", "js/trustpdf-preview.js", "js/trustpdf-zip.js",
    "js/trustpdf-qpdf.js", "js/trustpdf-worker.js", "js/trustpdf-pagecopy.js",
    "js/pdf-lib.min.js", "js/pdf.min.js", "js/pdf.worker.min.js", "js/Sortable.min.js",
    "img/brand/trustpdf-icon-black.webp", "img/favicon.ico", "img/icon-192.png", "img/icon-512.png",
    "img/apple-touch-icon.png",
]


def service_worker_view(request):
    """/sw.js: the offline cache. Served from the root so its scope is the whole site."""
    from django.templatetags.static import static

    scripts = dict.fromkeys(f"js/tools/{t['script']}.js" for t in TOOLS)
    files = OFFLINE_STATIC + list(scripts) + [t["icon"] for t in TOOLS]
    precache = [static(path) for path in files]
    pages = [reverse(name) for name, *_ in SITEMAP_PAGES] + [t["path"] for t in TOOLS]
    body = render_to_string("sw.js", {
        "static_prefix": json.dumps(settings.STATIC_URL),
        "immutable": json.dumps(not settings.DEBUG),
        "precache": json.dumps(precache, indent=1),
        "pages": json.dumps(pages, indent=1),
        "version": hashlib.sha256(json.dumps([precache, pages]).encode()).hexdigest()[:16],
    })
    response = HttpResponse(body, content_type="text/javascript; charset=utf-8")
    response["Cache-Control"] = "no-cache"  # browsers must always check for a new version
    return response


def indexnow_key_view(request, key):
    """IndexNow (Bing, Yandex, Seznam...) verifies site ownership with this file."""
    if not settings.INDEXNOW_KEY or key != settings.INDEXNOW_KEY:
        raise Http404
    return HttpResponse(settings.INDEXNOW_KEY, content_type="text/plain")
