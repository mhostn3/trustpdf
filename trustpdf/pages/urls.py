from django.urls import path, re_path
from django.views.generic import RedirectView

from . import views
from .guides import GUIDES
from .tools import TOOLS
from .views import PageView

app_name = "pages"


urlpatterns = [
    path("", PageView.as_view(template_name="index.html", page_key="index"), name="index"),
    path("about/", PageView.as_view(template_name="about.html", page_key="about", schema_type="AboutPage"), name="about"),
    path("cookies/", PageView.as_view(template_name="cookies.html", page_key="cookie_policy"), name="cookies"),
    path("privacy/", PageView.as_view(template_name="privacy.html", page_key="privacy_policy"), name="privacy"),
    path("terms/", PageView.as_view(template_name="terms.html", page_key="terms"), name="terms"),
    path("privacy-tools/", PageView.as_view(template_name="privacy_tools.html", page_key="privacy_tools"), name="privacy_tools"),

    path("sitemap.xml", views.sitemap_xml_view, name="sitemap_xml"),
    path("robots.txt", views.robots_txt_view, name="robots_txt"),
    path("llms.txt", views.llms_txt_view, name="llms_txt"),
    path("llms-full.txt", views.llms_full_txt_view, name="llms_full_txt"),
    path("manifest.webmanifest", views.manifest_view, name="manifest"),
    path("sw.js", views.service_worker_view, name="service_worker"),
    path(".well-known/security.txt", views.security_txt_view, name="security_txt"),
    re_path(r"^(?P<key>[0-9a-fA-F-]{8,128})\.txt$", views.indexnow_key_view, name="indexnow_key"),
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

urlpatterns.append(path("guides/", views.GuideIndexView.as_view(), name="guides"))
for guide in GUIDES:
    urlpatterns.append(path(guide["path"].lstrip("/"), views.GuideView.as_view(guide=guide), name=guide["url_name"].split(":")[1]))

# Old and alternative URLs, kept so existing links and search results keep working.
_REDIRECTS = {
    "merge/": "merge_pdf",
    "split/": "split_pdf",
    "compress/": "compress_pdf",
    "tools/pdf-to-image/": "pdf_to_jpg",
    "tools/": "index",
    # Tools lived at the site root before they moved under /tools/; Google still crawls these.
    "merge-pdf/": "merge_pdf",
    "split-pdf/": "split_pdf",
    "rotate-pdf-pages/": "rotate_pdf_pages",
    "remove-pdf-pages/": "remove_pdf_pages",
    "reorder-pdf-pages/": "reorder_pdf_pages",
    "images-to-pdf/": "images_to_pdf",
    "pdf-metadata-viewer/": "pdf_metadata_viewer",
    "pdf-metadata-editor/": "pdf_metadata_editor",
}
urlpatterns += [
    path(old, RedirectView.as_view(pattern_name=f"pages:{new}", permanent=True))
    for old, new in _REDIRECTS.items()
]
