"""Tell IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver...) about every page.

    python manage.py indexnow            # submit all sitemap URLs
    python manage.py indexnow --dry-run  # show what would be sent

Needs INDEXNOW_KEY in .env. Does nothing (and exits 0) when it is not set.
"""
import json
import urllib.error
import urllib.request
from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from pages.views import sitemap_urls

ENDPOINT = "https://api.indexnow.org/indexnow"


class Command(BaseCommand):
    help = "Submit all public URLs to IndexNow."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **options):
        key = settings.INDEXNOW_KEY
        if not key:
            self.stdout.write("INDEXNOW_KEY is not set; skipping IndexNow.")
            return

        urls = [url for url, *_ in sitemap_urls()]
        payload = {
            "host": urlparse(settings.SITE_URL).netloc,
            "key": key,
            "keyLocation": f"{settings.SITE_URL}/{key}.txt",
            "urlList": urls,
        }
        if dry_run:
            self.stdout.write(json.dumps(payload, indent=2))
            return

        request = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "TrustPDF-IndexNow/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            raise CommandError(f"IndexNow answered {error.code}: {error.read()[:200]!r}") from error
        except urllib.error.URLError as error:
            raise CommandError(f"Could not reach IndexNow: {error.reason}") from error
        self.stdout.write(self.style.SUCCESS(f"IndexNow accepted {len(urls)} URLs (HTTP {status})."))
