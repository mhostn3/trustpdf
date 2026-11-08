"""Structured data (schema.org JSON-LD) for search engines and AI assistants.

Everything here mirrors text that is visible on the page; structured data
that says more than the page does is ignored, or penalised, by Google.
"""
import json

from django.conf import settings
from django.templatetags.static import static
from django.utils.safestring import mark_safe

from .tools import TOOLS, HOME_FAQ

SITE_NAME = "TrustPDF"
AUTHOR_NAME = "Martin Hostnik"
SOURCE_URL = "https://github.com/mhostn3/trustpdf"


def absolute_url(path):
    """Absolute URL on the public site origin (not the request host)."""
    return f"{settings.SITE_URL}{path}"


def absolute_static(static_path):
    return absolute_url(static(static_path))


def _ids():
    root = absolute_url("/")
    return {"website": f"{root}#website", "org": f"{root}#organization", "author": f"{root}#author"}


def _organization():
    ids = _ids()
    return {
        "@type": "Organization",
        "@id": ids["org"],
        "name": SITE_NAME,
        "url": absolute_url("/"),
        "logo": absolute_static("img/apple-touch-icon.png"),
        "email": settings.CONTACT_EMAIL,
        "founder": {"@id": ids["author"]},
        "sameAs": [SOURCE_URL],
    }


def _author():
    return {
        "@type": "Person",
        "@id": _ids()["author"],
        "name": AUTHOR_NAME,
        "url": absolute_url("/about/"),
        "sameAs": ["https://github.com/mhostn3"],
    }


def _website():
    ids = _ids()
    return {
        "@type": "WebSite",
        "@id": ids["website"],
        "name": SITE_NAME,
        "alternateName": "TrustPDF.net",
        "url": absolute_url("/"),
        "description": "Free, open-source PDF tools that run entirely in the browser. Files are never uploaded.",
        "inLanguage": "en",
        "publisher": {"@id": ids["org"]},
    }


def _faq_page(items, url):
    return {
        "@type": "FAQPage",
        "@id": f"{url}#faq",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in items
        ],
    }


def _breadcrumbs(url, trail):
    return {
        "@type": "BreadcrumbList",
        "@id": f"{url}#breadcrumbs",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": item_url}
            for i, (name, item_url) in enumerate(trail)
        ],
    }


def _web_application(tool, url):
    ids = _ids()
    return {
        "@type": "WebApplication",
        "@id": f"{url}#app",
        "name": f"{tool['title']} - TrustPDF",
        "url": url,
        "description": tool["meta_description"],
        "applicationCategory": "UtilitiesApplication",
        "applicationSubCategory": "PDF tool",
        "operatingSystem": "Any (runs in a web browser)",
        "browserRequirements": "Requires JavaScript and a modern web browser.",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
        "image": absolute_static(tool["og_image"]),
        "screenshot": absolute_static(tool["og_image"]),
        "featureList": [
            "Runs entirely in the browser; files are never uploaded",
            "No sign-up, no watermark, no file limits",
            "Open source (AGPL-3.0)",
        ],
        "publisher": {"@id": ids["org"]},
        "author": {"@id": ids["author"]},
        "isPartOf": {"@id": ids["website"]},
    }


def _how_to(tool, url):
    return {
        "@type": "HowTo",
        "@id": f"{url}#howto",
        "name": tool["how_to_title"],
        "description": tool["intro"],
        "tool": {"@type": "HowToTool", "name": "A web browser"},
        "totalTime": "PT1M",
        "estimatedCost": {"@type": "MonetaryAmount", "currency": "EUR", "value": "0"},
        "step": [
            {"@type": "HowToStep", "position": i + 1, "name": f"Step {i + 1}", "text": text, "url": f"{url}#how-to"}
            for i, text in enumerate(tool["steps"])
        ],
    }


def _web_page(url, name, description, page_type="WebPage", extra=None):
    ids = _ids()
    page = {
        "@type": page_type,
        "@id": f"{url}#webpage",
        "url": url,
        "name": name,
        "description": description,
        "inLanguage": "en",
        "isPartOf": {"@id": ids["website"]},
    }
    page.update(extra or {})
    return page


def render(graph):
    """JSON-LD for a <script type="application/ld+json"> block, safe to embed in HTML."""
    data = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    # Neutralise anything that could close the <script> element early.
    data = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return mark_safe(data)


def home_graph():
    url = absolute_url("/")
    item_list = {
        "@type": "ItemList",
        "@id": f"{url}#tools",
        "name": "TrustPDF tools",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": t["title"], "url": absolute_url(t["path"])}
            for i, t in enumerate(TOOLS)
        ],
    }
    page = _web_page(
        url,
        "TrustPDF - Free PDF Tools That Never Upload Your Files",
        "Free, private PDF tools that run in your browser.",
        extra={"about": {"@id": _ids()["org"]}, "mainEntity": {"@id": f"{url}#tools"}},
    )
    return render([_website(), _organization(), _author(), page, item_list, _faq_page(HOME_FAQ, url)])


def tool_graph(tool):
    url = absolute_url(tool["path"])
    page = _web_page(
        url,
        tool["seo_title"],
        tool["meta_description"],
        extra={
            "mainEntity": {"@id": f"{url}#app"},
            "breadcrumb": {"@id": f"{url}#breadcrumbs"},
            "primaryImageOfPage": absolute_static(tool["og_image"]),
        },
    )
    crumbs = _breadcrumbs(url, [("Home", absolute_url("/")), (tool["title"], url)])
    return render([
        page, _web_application(tool, url), _how_to(tool, url), _faq_page(tool["faq"], url), crumbs,
        _website(), _organization(), _author(),
    ])


def page_graph(url, title, description, page_type="WebPage"):
    crumbs = _breadcrumbs(url, [("Home", absolute_url("/")), (title, url)])
    page = _web_page(url, title, description, page_type, extra={"breadcrumb": {"@id": f"{url}#breadcrumbs"}})
    graph = [page, crumbs, _website(), _organization()]
    if page_type == "AboutPage":
        page["mainEntity"] = {"@id": _ids()["author"]}
        graph.append(_author())
    return render(graph)
