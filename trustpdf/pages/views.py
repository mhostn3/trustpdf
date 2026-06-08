from django.shortcuts import render
from django.http import HttpResponse
from django.urls import reverse
from django.utils import timezone


# ------------------ #
#      Site Map      #
# ------------------ #
def sitemap_xml_view(request):
    urls = [
        reverse('index'),
        reverse('merge'),
        reverse('split'),
        reverse('privacy'),
        reverse('cookies'),
        reverse('about'),
        reverse('privacy_tools'),
    ]
    base_url = request.build_absolute_uri('/')[:-1]  # remove trailing slash

    now = timezone.now().date().isoformat()

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for url in urls:
        xml += '  <url>\n'
        xml += f'    <loc>{base_url}{url}</loc>\n'
        xml += f'    <lastmod>{now}</lastmod>\n'
        xml += '    <changefreq>monthly</changefreq>\n'
        xml += '    <priority>0.8</priority>\n'
        xml += '  </url>\n'
    xml += '</urlset>'

    return HttpResponse(xml, content_type='application/xml')


