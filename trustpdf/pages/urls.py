from django.urls import path
from django.views.generic import TemplateView, RedirectView

from . import views
from .tools import TOOLS, STATIC_PAGES

app_name = "pages"


class PageView(TemplateView):
    """Static page with SEO context taken from STATIC_PAGES."""

    page_key = None

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        page = STATIC_PAGES[self.page_key]
        context.update(page)
        context["canonical_url"] = views.absolute_url(self.request.path)
        context["og_image"] = views.absolute_static(page["og_image"])
        return context


urlpatterns = [
    path("", PageView.as_view(template_name="index.html", page_key="index"), name="index"),
    path("about/", PageView.as_view(template_name="about.html", page_key="about"), name="about"),
    path("cookies/", PageView.as_view(template_name="cookies.html", page_key="cookie_policy"), name="cookies"),
    path("privacy/", PageView.as_view(template_name="privacy.html", page_key="privacy_policy"), name="privacy"),
    path("terms/", PageView.as_view(template_name="terms.html", page_key="terms"), name="terms"),
    path("privacy-tools/", PageView.as_view(template_name="privacy_tools.html", page_key="privacy_tools"), name="privacy_tools"),

    path("sitemap.xml", views.sitemap_xml_view, name="sitemap_xml"),
    path("robots.txt", views.robots_txt_view, name="robots_txt"),
]


for tool in TOOLS:
    urlpatterns.append(
        path(
            tool["path"].lstrip("/"),
            views.ToolView.as_view(
                template_name=f"tools/{tool['template_name']}",
                tool=tool,
            ),
            name=tool["name"],
        ),
    )

# Old URLs, kept so existing links and search results keep working.
urlpatterns += [
    path("merge/", RedirectView.as_view(pattern_name="pages:merge_pdf", permanent=True)),
    path("split/", RedirectView.as_view(pattern_name="pages:split_pdf", permanent=True)),
]
