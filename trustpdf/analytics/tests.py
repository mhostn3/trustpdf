import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.urls import reverse
from django.test import TestCase, override_settings
from django.utils import timezone

from . import tracking
from .models import Event, VisitorSalt
from .templatetags.analytics_extras import dur

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"


TEST_SETTINGS = dict(
    SECURE_SSL_REDIRECT=False,
    STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}},
)


def fake_geo(ip):
    return ("SI", "Slovenia", "Ljubljana") if ip.startswith("193.") else ("", "", "")


@override_settings(**TEST_SETTINGS)
@mock.patch.object(tracking, "locate", side_effect=fake_geo)
class TrackingTests(TestCase):
    def get(self, path, ua=UA, ip="193.2.1.10", **extra):
        return self.client.get(path, HTTP_USER_AGENT=ua, REMOTE_ADDR=ip, **extra)

    def beacon(self, data, ua=UA, ip="193.2.1.10"):
        return self.client.post("/analytics/e/", json.dumps(data), content_type="text/plain",
                                HTTP_USER_AGENT=ua, REMOTE_ADDR=ip)

    def test_pageview_recorded_with_tool_location_and_device(self, _):
        self.assertEqual(self.get("/tools/merge-pdf/", HTTP_REFERER="https://www.google.com/search").status_code, 200)
        e = Event.objects.get()
        self.assertEqual((e.kind, e.tool, e.country, e.city, e.device, e.browser, e.os, e.referrer),
                         ("pageview", "Merge PDF", "SI", "Ljubljana", "desktop", "Chrome",
                          "Windows", "google.com"))
        self.assertEqual(len(e.visitor), 16)
        self.assertNotIn("193.2.1.10", json.dumps(list(Event.objects.values()), default=str))

    def test_returning_visitor_same_ip_and_browser(self, _):
        self.get("/")
        Event.objects.update(ts=timezone.now() - timedelta(hours=3))
        self.get("/about/")
        self.get("/", ip="193.2.1.11")
        a, b, c = Event.objects.order_by("id")
        self.assertEqual(a.visitor, b.visitor)        # same IP + browser = same visitor
        self.assertNotEqual(a.session, b.session)     # 3 h gap = new session
        self.assertNotEqual(a.visitor, c.visitor)     # other IP = other visitor

    def test_session_continues_within_30_minutes(self, _):
        self.get("/")
        self.get("/about/")
        self.assertEqual(Event.objects.values("session").distinct().count(), 1)

    def test_salt_rotates_per_quarter_and_old_salts_are_deleted(self, _):
        from datetime import date
        tracking._salt_cache.clear()
        s1 = tracking.visitor_salt(date(2026, 2, 10))
        self.assertEqual(tracking.visitor_salt(date(2026, 3, 31)), s1)
        s2 = tracking.visitor_salt(date(2026, 4, 1))
        self.assertNotEqual(s1, s2)
        self.assertEqual(list(VisitorSalt.objects.values_list("period", flat=True)), [date(2026, 4, 1)])
        tracking._salt_cache.clear()

    def test_bots_staff_and_excluded_paths_are_not_counted(self, _):
        self.get("/", ua="Mozilla/5.0 (compatible; Googlebot/2.1)")
        self.get("/robots.txt")
        self.get("/does-not-exist/")
        staff = User.objects.create_user("m", password="x", is_staff=True)
        self.client.force_login(staff)
        self.get("/")
        self.assertEqual(Event.objects.count(), 0)

    def test_redirects_and_404_are_not_counted(self, _):
        self.get("/merge/")              # permanent redirect to /tools/merge-pdf/
        self.get("/tools/no-such-tool/")
        self.assertEqual(Event.objects.count(), 0)

    def test_text_files_are_not_counted(self, _):
        for path in ("/llms.txt", "/llms-full.txt", "/manifest.webmanifest", "/sitemap.xml"):
            self.get(path)
        self.assertEqual(Event.objects.count(), 0)

    def test_page_includes_script_and_sets_no_cookie(self, _):
        r = self.get("/tools/merge-pdf/")
        self.assertContains(r, "js/trustpdf-analytics.js")
        self.assertEqual(dict(r.cookies), {})

    def test_browser_events(self, _):
        self.assertEqual(self.beacon({"k": "click", "n": " Merge   PDFs ", "p": "/tools/merge-pdf/"}).status_code, 204)
        self.beacon({"k": "input", "n": "Page size: A4", "p": "/tools/merge-pdf/"})
        self.beacon({"k": "engage", "v": 42, "p": "/tools/merge-pdf/"}, ua=PHONE)
        self.beacon({"k": "engage", "v": -1, "p": "/"})
        self.beacon({"k": "bogus", "n": "x", "p": "/"})
        self.beacon({"k": "click", "n": "x", "p": "/admin/"})
        rows = list(Event.objects.order_by("id").values_list("kind", "name", "tool", "value", "device"))
        self.assertEqual(rows, [
            ("click", "Merge PDFs", "Merge PDF", None, "desktop"),
            ("input", "Page size: A4", "Merge PDF", None, "desktop"),
            ("engage", "", "Merge PDF", 42.0, "mobile"),
        ])

    def test_ignore_cookie(self, _):
        r = self.client.get("/analytics/ignore/?set=on", HTTP_USER_AGENT=UA, REMOTE_ADDR="193.2.1.10")
        self.assertEqual(r.cookies["tp_ignore"].value, "1")
        self.get("/")
        self.beacon({"k": "view", "p": "/"})
        self.assertEqual(Event.objects.count(), 0)
        r = self.client.get("/analytics/ignore/?set=off", HTTP_USER_AGENT=UA)
        self.get("/")
        self.assertEqual(Event.objects.count(), 1)

    def test_ping(self, _):
        self.assertEqual(self.beacon({"k": "view", "p": "/tools/merge-pdf/", "v": 5}).status_code, 204)
        e = Event.objects.get()
        self.assertEqual((e.kind, e.name, e.value, e.tool), ("ping", "", None, "Merge PDF"))

    @override_settings(ANALYTICS_ENABLED=False)
    def test_can_be_switched_off(self, _):
        self.get("/")
        self.beacon({"k": "click", "n": "x", "p": "/"})
        self.assertEqual(Event.objects.count(), 0)

    def test_dashboard_staff_only_and_renders(self, _):
        self.get("/")
        self.get("/tools/merge-pdf/")
        self.beacon({"k": "click", "n": "Merge PDFs", "p": "/tools/merge-pdf/"})
        self.beacon({"k": "engage", "v": 65, "p": "/tools/merge-pdf/"})
        self.get("/", ip="193.2.9.9")
        self.beacon({"k": "view", "p": "/"}, ip="193.2.9.9")
        self.get("/", ip="193.2.9.77")  # no script ran: a bot, left out by default
        self.assertEqual(self.client.get(reverse("analytics:dashboard")).status_code, 302)
        self.client.force_login(User.objects.create_user("m", password="x", is_staff=True))
        r = self.client.get(reverse("analytics:dashboard") + "?days=28")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Merge PDF")
        self.assertContains(r, "Merge PDFs")
        self.assertContains(r, "Ljubljana")
        self.assertContains(r, "Split PDF")  # tools nobody opened are listed too
        self.assertEqual(r.context["summary"]["visitors"], 2)
        self.assertEqual(r.context["summary"]["sessions"], 2)
        self.assertEqual(r.context["filtered"], {"visitors": 1, "pageviews": 1})
        self.assertContains(r, "Setup check")
        self.assertContains(r, reverse("analytics:manifest"))
        self.assertNotContains(r, 'href="%s"' % reverse("pages:manifest"))
        m = json.loads(self.client.get(reverse("analytics:manifest")).content)
        self.assertEqual(m["start_url"], reverse("analytics:dashboard"))
        self.assertTrue(m["start_url"].startswith(m["scope"]))
        r = self.client.get(reverse("analytics:dashboard") + "?days=28&traffic=all")
        self.assertEqual(r.context["summary"]["visitors"], 3)
        csv = self.client.get(reverse("analytics:dashboard") + "?format=csv")
        self.assertEqual(csv["Content-Type"], "text/csv")
        self.assertEqual(len(csv.content.decode().strip().splitlines()), 1 + Event.objects.count())

    def test_proxy_forwarded_ip(self, _):
        self.get("/", ip="127.0.0.1", HTTP_X_FORWARDED_FOR="10.9.9.9, 193.2.1.10")
        self.assertEqual(Event.objects.get().city, "Ljubljana")


@override_settings(**TEST_SETTINGS)
class HelperTests(TestCase):
    def test_parse_ua(self):
        self.assertEqual(tracking.parse_ua(PHONE), ("Safari", "iOS", "mobile"))
        self.assertEqual(tracking.parse_ua(UA), ("Chrome", "Windows", "desktop"))

    def test_dur(self):
        self.assertEqual(dur(42), "42 s")
        self.assertEqual(dur(185), "3 min 05 s")
        self.assertEqual(dur(None), "–")

    def test_client_ip_unix_socket(self):
        from django.test import RequestFactory
        rf = RequestFactory()
        # gunicorn on a unix socket: REMOTE_ADDR is empty, nginx sets X-Real-IP
        req = rf.get("/", REMOTE_ADDR="", HTTP_X_REAL_IP="193.2.1.10")
        self.assertEqual(tracking.client_ip(req), "193.2.1.10")
        # public peer address: forwarded headers are not trusted
        req = rf.get("/", REMOTE_ADDR="193.2.1.11", HTTP_X_REAL_IP="1.2.3.4")
        self.assertEqual(tracking.client_ip(req), "193.2.1.11")

    def test_locate_without_database(self):
        with override_settings(ANALYTICS_GEOIP_PATH="/nonexistent/x.mmdb"):
            self.assertEqual(tracking.locate("8.8.8.8"), ("", "", ""))


@override_settings(**TEST_SETTINGS)
class AdminPathTests(TestCase):
    """Admin and dashboard under the secret ADMIN_PATH; login locked after 3 failures."""

    def setUp(self):
        from django.conf import settings
        self.base = f"/{settings.ADMIN_PATH}/"
        self.user = User.objects.create_user("m", password="right-pass", is_staff=True, is_superuser=True)

    def get(self, path, **headers):
        return self.client.get(path, REMOTE_ADDR="127.0.0.1", HTTP_USER_AGENT=UA, **headers)

    @override_settings(ADMIN_PATH="s3cret-path")
    def test_secret_path_only(self):
        from django.urls import clear_url_caches
        import importlib, trustpdf.urls, analytics.urls
        importlib.reload(analytics.urls); importlib.reload(trustpdf.urls); clear_url_caches()
        try:
            self.assertEqual(self.get("/admin/").status_code, 404)
            self.assertEqual(self.get("/analytics/").status_code, 404)
            self.assertEqual(self.get("/s3cret-path/analytics/").status_code, 302)  # to the login
            self.client.force_login(self.user)
            self.assertEqual(self.get("/s3cret-path/").status_code, 200)
            self.assertEqual(self.get("/s3cret-path/analytics/").status_code, 200)
        finally:
            with override_settings(ADMIN_PATH="admin"):
                importlib.reload(analytics.urls); importlib.reload(trustpdf.urls); clear_url_caches()

    def test_beacon_stays_public(self):
        r = self.client.post("/analytics/e/", '{"k":"click","n":"x","p":"/"}', content_type="text/plain",
                             REMOTE_ADDR="127.0.0.1", HTTP_X_REAL_IP="193.2.1.10", HTTP_USER_AGENT=UA)
        self.assertEqual(r.status_code, 204)

    def login(self, password, ip="193.2.1.10"):
        return self.client.post(self.base + "login/", {"username": "m", "password": password},
                                REMOTE_ADDR="127.0.0.1", HTTP_X_REAL_IP=ip, HTTP_USER_AGENT=UA)

    def test_lockout_after_three_failures(self):
        for _ in range(3):
            self.login("wrong")
        self.assertEqual(self.login("right-pass").status_code, 429)        # locked, even with the password
        self.assertEqual(self.login("right-pass", ip="84.1.1.1").status_code, 302)  # other IP still works

    def test_export_all(self):
        self.client.force_login(self.user)
        Event.objects.create(ts=timezone.now() - timedelta(days=200), kind="pageview", path="/", visitor="a", session="b")
        Event.objects.create(kind="pageview", path="/", visitor="a", session="c")
        r = self.get(self.base + "analytics/?format=csv&all=1")
        self.assertIn("trustpdf-analytics-all.csv", r["Content-Disposition"])
        self.assertEqual(len(r.content.decode().strip().splitlines()), 3)
        r = self.get(self.base + "analytics/?format=csv")
        self.assertEqual(len(r.content.decode().strip().splitlines()), 2)
