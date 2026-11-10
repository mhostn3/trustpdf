from django.conf import settings
from django.urls import path

from . import views

app_name = "analytics"

# Included at the site root: the dashboard sits under the secret admin path, the beacon stays public.
urlpatterns = [
    path(f"{settings.ADMIN_PATH}/analytics/", views.dashboard, name="dashboard"),
    path(f"{settings.ADMIN_PATH}/analytics/manifest.webmanifest", views.manifest, name="manifest"),
    path("analytics/e/", views.collect, name="collect"),
    path("analytics/ignore/", views.ignore_me, name="ignore"),
]
