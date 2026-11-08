"""Delete analytics events older than ANALYTICS_RETENTION_DAYS (default 13 months)."""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from analytics.models import Event


class Command(BaseCommand):
    help = "Delete old analytics events."

    def handle(self, *args, **opts):
        days = getattr(settings, "ANALYTICS_RETENTION_DAYS", 396)
        n, _ = Event.objects.filter(ts__lt=timezone.now() - timedelta(days=days)).delete()
        self.stdout.write(f"Analytics: deleted {n} events older than {days} days.")
