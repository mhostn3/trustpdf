from django.conf import settings
from django.http import HttpResponse
from django.templatetags.static import static
from django.urls import reverse
from django.views.generic import TemplateView

from .tools import TOOLS, STATIC_PAGES


def absolute_url(path):
    """Absolute URL on the public site origin (not the request host)."""
    return f"{settings.SITE_URL}{path}"


def absolute_static(static_path):
    return absolute_url(static(static_path))


class ToolView(TemplateView):
    tool = None

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        tool = self.tool
        page_url = absolute_url(reverse(f"pages:{tool['name']}"))

        context.update({
            "tool": tool,
            "seo_title": tool["og_title"],
            "meta_description": tool["meta_description"],
            "meta_keywords": tool["keywords"],
            "canonical_url": page_url,
            "og_title": tool["og_title"],
            "og_description": tool["og_description"],
            "og_image": absolute_static(tool["og_image"]),
            "tool_script": f"js/tools/{tool['name']}.js",
        })
        return context


# ------------------ #
#      Site Map      #
# ------------------ #

SITEMAP_PAGES = [
    # (url name, priority, changefreq)
    ("pages:index", "1.0", "monthly"),
    ("pages:about", "0.5", "yearly"),
    ("pages:privacy_tools", "0.5", "monthly"),
    ("pages:privacy", "0.3", "yearly"),
    ("pages:cookies", "0.3", "yearly"),
    ("pages:terms", "0.3", "yearly"),
]


def sitemap_xml_view(request):
    entries = [(reverse(name), prio, freq) for name, prio, freq in SITEMAP_PAGES]
    entries += [(reverse(f"pages:{tool['name']}"), "0.8", "monthly") for tool in TOOLS]

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, priority, changefreq in entries:
        lines += [
            "  <url>",
            f"    <loc>{absolute_url(path)}</loc>",
            f"    <changefreq>{changefreq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")

    return HttpResponse("\n".join(lines) + "\n", content_type="application/xml")


def robots_txt_view(request):
    body = "User-agent: *\nDisallow:\n\n" f"Sitemap: {absolute_url(reverse('pages:sitemap_xml'))}\n"
    return HttpResponse(body, content_type="text/plain")
