from django.urls import path
from django.views.generic import TemplateView

from . import views

urlpatterns = [
    path('', views.index_view, name='index'),
    path('cookies/', views.cookies_view, name='cookies'),
    path('privacy/', views.privacy_view, name='privacy'),
    path('merge/', views.merge_view, name='merge'),
    path('split/', views.split_view, name='split'),
    
    path('sitemap.xml', views.sitemap_xml_view, name='sitemap_xml'),
    path('robots.txt', TemplateView.as_view(template_name="robots.txt", content_type="text/plain")),
]