"""Download the free DB-IP "IP to City Lite" database (CC BY 4.0) for the GeoIP lookup.

    python manage.py update_geoip               # always download
    python manage.py update_geoip --if-older 30 # only when the file is missing or older
"""
import gzip
import shutil
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

URL = "https://download.db-ip.com/free/dbip-city-lite-{:%Y-%m}.mmdb.gz"


def months_back(n):
    d = date.today().replace(day=1)
    for _ in range(n):
        yield d
        d = (d - timedelta(days=1)).replace(day=1)


class Command(BaseCommand):
    help = "Download the DB-IP City Lite GeoIP database used by the site analytics."

    def add_arguments(self, parser):
        parser.add_argument("--if-older", type=int, default=None, metavar="DAYS",
                            help="Skip when the database exists and is younger than DAYS.")

    def handle(self, *args, if_older=None, **opts):
        target = Path(settings.ANALYTICS_GEOIP_PATH)
        if if_older is not None and target.exists():
            age = (time.time() - target.stat().st_mtime) / 86400
            if age < if_older:
                self.stdout.write(f"GeoIP database is {age:.0f} days old, keeping it: {target}")
                return
        target.parent.mkdir(parents=True, exist_ok=True)
        last_error = None
        for month in months_back(3):
            url = URL.format(month)
            try:
                with requests.get(url, stream=True, timeout=120) as r:
                    if r.status_code == 404:
                        last_error = f"{url}: 404"
                        continue
                    r.raise_for_status()
                    r.raw.decode_content = False
                    with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".mmdb", delete=False) as tmp:
                        with gzip.GzipFile(fileobj=r.raw) as gz:
                            shutil.copyfileobj(gz, tmp)
                        tmp_path = Path(tmp.name)
            except requests.RequestException as exc:
                last_error = f"{url}: {exc}"
                continue
            try:
                import maxminddb
                with maxminddb.open_database(str(tmp_path)) as db:
                    kind = db.metadata().database_type
            except Exception as exc:
                tmp_path.unlink(missing_ok=True)
                raise CommandError(f"Downloaded file is not a valid database: {exc}")
            tmp_path.replace(target)
            self.stdout.write(self.style.SUCCESS(f"GeoIP database {month:%Y-%m} ({kind}) saved to {target}"))
            return
        raise CommandError(f"Could not download the GeoIP database. Last error: {last_error}")
