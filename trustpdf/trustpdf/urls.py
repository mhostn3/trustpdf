"""URL configuration for the TrustPDF project."""
from django.conf import settings
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Secret admin path from .env (ADMIN_PATH); the analytics dashboard sits under it.
    path('', include('analytics.urls')),
    path(f'{settings.ADMIN_PATH}/', admin.site.urls),
    path('', include(('pages.urls', 'pages'), namespace='pages')),
]

handler400 = "pages.views_errors.error_400"
handler403 = "pages.views_errors.error_403"
handler404 = "pages.views_errors.error_404"
handler500 = "pages.views_errors.error_500"