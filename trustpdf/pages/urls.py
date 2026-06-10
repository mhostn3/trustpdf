from django.urls import path
from django.views.generic import TemplateView, RedirectView
from django.templatetags.static import static

from . import views
from .tools import TOOLS, STATIC_PAGES

app_name = "pages"



static_context = {'tools': TOOLS}
urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html", extra_context=static_context | STATIC_PAGES['index']), name="index"),
    path('about/', TemplateView.as_view(template_name="about.html", extra_context=static_context | STATIC_PAGES['about']), name='about'),
    path('cookies/', TemplateView.as_view(template_name="cookies.html", extra_context=static_context | STATIC_PAGES['cookie_policy']), name='cookies'),
    path('privacy/', TemplateView.as_view(template_name="privacy.html", extra_context=static_context | STATIC_PAGES['privacy_policy']), name='privacy'),

    path('privacy-tools/', TemplateView.as_view(template_name="privacy_tools.html", extra_context=static_context | STATIC_PAGES['privacy_tools']), name='privacy_tools'),
   
    path('sitemap.xml', views.sitemap_xml_view, name='sitemap_xml'),
    path('robots.txt', TemplateView.as_view(template_name="robots.txt", content_type="text/plain")),
]


TOOLS_BY_URL_NAME = {tool["url_name"]: tool for tool in TOOLS}
class ToolView(TemplateView):
    template_name = None
    url_name = None

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        tool = TOOLS_BY_URL_NAME[self.url_name]

        absolute_url = self.request.build_absolute_uri(tool["path"])
        og_image_url = self.request.build_absolute_uri(static(tool["og_image"]))

        context.update({
            "tool": tool,
            "tools": TOOLS,
            "seo_title": tool["og_title"],
            "meta_description": tool["meta_description"],
            "meta_keywords": tool["keywords"],
            "canonical_url": absolute_url,
            "og_title": tool["og_title"],
            "og_description": tool["og_description"],
            "og_url": absolute_url,
            "og_image": og_image_url,
            "twitter_title": tool["og_title"],
            "twitter_description": tool["og_description"],
            "twitter_image": og_image_url,
        })

        return context


for tool in TOOLS:
    urlpatterns.append(
        path(
            f"tools{tool['path']}",
            ToolView.as_view(
                template_name=f"tools/{tool['template_name']}",
                url_name=tool['url_name'],
            ),
            name=tool['url_name'].split(':')[1],
        ),
    )

urlpatterns.append(path("merge/", RedirectView.as_view(pattern_name="pages:merge_pdf", permanent=False)))
urlpatterns.append(path("split/", RedirectView.as_view(pattern_name="pages:split_pdf", permanent=False)))