"""
URL configuration for the TrustPDF project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
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