import datetime

from django.conf import settings
from django.http import Http404, HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.urls import reverse
from django.views.decorators.cache import cache_control
from django.views.generic import TemplateView

from . import seo
from .seo import absolute_static, absolute_url  # noqa: F401  (re-exported for urls.py)
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
            "seo_title": tool["seo_title"],
            "meta_description": tool["meta_description"],
            "meta_keywords": tool["keywords"],
            "canonical_url": absolute_url(tool["path"]),
            "og_title": tool["seo_title"],
            "og_description": tool["og_description"],
            "og_image": absolute_static(tool["og_image"]),
            "tool_script": f"js/tools/{tool['name']}.js",
            "json_ld": seo.tool_graph(tool),
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
    return entries


@cache_control(max_age=3600, public=True)
def sitemap_xml_view(request):
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
        ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for url, priority, changefreq, tool in sitemap_urls():
        lines += ["  <url>", f"    <loc>{url}</loc>", f"    <changefreq>{changefreq}</changefreq>", f"    <priority>{priority}</priority>"]
        if tool:
            lines += ["    <image:image>", f"      <image:loc>{absolute_static(tool['og_image'])}</image:loc>", "    </image:image>"]
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
    body = render_to_string(template, {"tools": TOOLS, "site_url": settings.SITE_URL, **(context or {})})
    return HttpResponse(body, content_type="text/plain; charset=utf-8")


@cache_control(max_age=86400, public=True)
def llms_txt_view(request):
    """https://llmstxt.org: a short Markdown map of the site for AI assistants."""
    return _text_response("llms.txt", {"tool_groups": tools_by_group()})


@cache_control(max_age=86400, public=True)
def llms_full_txt_view(request):
    """The same, with every tool's how-to steps and FAQ inlined."""
    return _text_response("llms-full.txt", {"tool_groups": tools_by_group(), "home_faq": HOME_FAQ_ITEMS})


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


def indexnow_key_view(request, key):
    """IndexNow (Bing, Yandex, Seznam...) verifies site ownership with this file."""
    if not settings.INDEXNOW_KEY or key != settings.INDEXNOW_KEY:
        raise Http404
    return HttpResponse(settings.INDEXNOW_KEY, content_type="text/plain")
