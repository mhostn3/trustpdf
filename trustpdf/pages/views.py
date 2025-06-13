from django.shortcuts import render
from django.http import HttpResponse
from django.urls import reverse
from django.utils import timezone

def index_view(request):
    return render(request, 'index.html')

def cookies_view(request):
    return render(request, 'cookies.html')

def privacy_view(request):
    return render(request, 'privacy.html')

def merge_view(request):
    return render(request, 'merge.html')

def split_view(request):
    return render(request, 'split.html')




def sitemap_xml_view(request):
    urls = [
        reverse('index'),
        reverse('merge'),
        reverse('split'),
        reverse('privacy'),
        reverse('cookies'),
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
