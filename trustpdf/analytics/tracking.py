"""Recording of analytics events: visitor hash, session, location, browser and tool."""
import hashlib
import ipaddress
import logging
import re
import secrets
import threading
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.utils import timezone

from .models import Event, VisitorSalt

log = logging.getLogger(__name__)

SESSION_GAP = timedelta(minutes=30)
IGNORE_COOKIE = "tp_ignore"  # set on request at /analytics/ignore/ so the owner is not counted

# Paths that are never recorded.
EXCLUDED_PREFIXES = ("/admin/", "/analytics/", "/static/", "/media/", "/test/",
                     "/favicon", "/robots.txt", "/sitemap.xml", "/.well-known/",
                     "/llms.txt", "/llms-full.txt", "/manifest.webmanifest")

BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|scrape|curl|wget|python-requests|httpx|aiohttp|go-http|java/|"
    r"okhttp|headless|phantom|lighthouse|pingdom|uptime|monitor|facebookexternalhit|"
    r"preview|feedfetcher|semrush|ahrefs|mj12|bingpreview|petalbot|yandex|baidu|"
    r"duckduckgo|applebot|gptbot|claude|anthropic|perplexity|ccbot|bytespider",
    re.I)


# --------------------------------------------------------------------- settings

def enabled():
    return getattr(settings, "ANALYTICS_ENABLED", True)


def skip_path(path):
    return path.startswith(EXCLUDED_PREFIXES) or path.startswith(f"/{settings.ADMIN_PATH}/")


def skip_request(request):
    """True for requests that are never counted: bots, staff, excluded paths."""
    return skip_path(request.path) or skip_client(request)


def skip_client(request):
    """True when analytics is off, or the client is a bot or a staff user."""
    if not enabled():
        return True
    if request.COOKIES.get(IGNORE_COOKIE) == "1":  # the owner's own browsers
        return True
    ua = request.META.get("HTTP_USER_AGENT", "")
    if not ua or BOT_RE.search(ua):
        return True
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated and user.is_staff \
            and not getattr(settings, "ANALYTICS_TRACK_STAFF", False):
        return True
    return False


# --------------------------------------------------------------------- IP and visitor

def client_ip(request):
    """Client IP; behind a local reverse proxy (nginx) the forwarded address is used."""
    remote = request.META.get("REMOTE_ADDR", "")
    try:
        behind_proxy = ipaddress.ip_address(remote).is_private or ipaddress.ip_address(remote).is_loopback
    except ValueError:
        # gunicorn on a unix socket sets REMOTE_ADDR to "" (or the socket path). Only local
        # processes (nginx) can connect to that socket, so its headers are trusted.
        behind_proxy = not remote or "/" in remote
    if behind_proxy:
        # X-Real-IP is set (overwritten) by nginx. In X-Forwarded-For only the last entry
        # was added by our proxy; earlier entries come from the client and can be forged.
        real = request.META.get("HTTP_X_REAL_IP", "").strip()
        if real:
            return real
        fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if fwd:
            return fwd.split(",")[-1].strip()
    return remote


_salt_lock = threading.Lock()
_salt_cache = {}


def salt_period(day):
    """First day of the quarter that holds `day`."""
    return day.replace(month=3 * ((day.month - 1) // 3) + 1, day=1)


def visitor_salt(day=None):
    """Random salt of the current quarter, shared by all workers through the database.
    Older salts are deleted, which makes hashes of earlier quarters unlinkable."""
    period = salt_period(day or timezone.now().date())
    with _salt_lock:
        if period in _salt_cache:
            return _salt_cache[period]
        obj, created = VisitorSalt.objects.get_or_create(period=period, defaults={"salt": secrets.token_hex(32)})
        VisitorSalt.objects.filter(period__lt=period).delete()
        _salt_cache.clear()
        _salt_cache[period] = obj.salt
        return obj.salt


def visitor_id(request):
    ua = request.META.get("HTTP_USER_AGENT", "")
    raw = f"{visitor_salt()}|{client_ip(request)}|{ua}|{request.get_host()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def session_id(visitor, now):
    """A session is a run of events of one visitor with gaps under 30 minutes."""
    last = (Event.objects.filter(visitor=visitor, ts__gte=now - SESSION_GAP)
            .order_by("-ts").values_list("session", flat=True).first())
    if last:
        return last
    return hashlib.sha256(f"{visitor}|{now.isoformat()}".encode()).hexdigest()[:16]


# --------------------------------------------------------------------- GeoIP

_geo_lock = threading.Lock()
_geo = {"reader": None, "mtime": None, "path": None}


def geoip_path():
    p = getattr(settings, "ANALYTICS_GEOIP_PATH", None)
    return Path(p) if p else None


def _reader():
    path = geoip_path()
    if not path or not path.exists():
        return None
    mtime = path.stat().st_mtime
    with _geo_lock:
        if _geo["reader"] is None or _geo["mtime"] != mtime or _geo["path"] != path:
            import maxminddb
            if _geo["reader"] is not None:
                try:
                    _geo["reader"].close()
                except Exception:
                    pass
            _geo.update(reader=maxminddb.open_database(str(path)), mtime=mtime, path=path)
        return _geo["reader"]


def locate(ip):
    """(country code, country name, city) for an IP; blanks when unknown."""
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback:
            return "", "", ""
        reader = _reader()
        rec = reader.get(ip) if reader else None
    except Exception:
        log.exception("GeoIP lookup failed")
        return "", "", ""
    if not rec:
        return "", "", ""
    country = rec.get("country") or rec.get("registered_country") or {}
    city = rec.get("city") or {}
    return (country.get("iso_code", "")[:2],
            (country.get("names") or {}).get("en", "")[:60],
            (city.get("names") or {}).get("en", "")[:80])


# --------------------------------------------------------------------- user agent

def parse_ua(ua):
    """(browser, os, device) from a user agent string; coarse on purpose."""
    u = ua or ""
    if "Edg/" in u or "EdgA/" in u or "EdgiOS/" in u:
        browser = "Edge"
    elif "OPR/" in u or "Opera" in u:
        browser = "Opera"
    elif "SamsungBrowser" in u:
        browser = "Samsung Internet"
    elif "Firefox/" in u or "FxiOS/" in u:
        browser = "Firefox"
    elif "Chrome/" in u or "CriOS/" in u:
        browser = "Chrome"
    elif "Safari/" in u:
        browser = "Safari"
    else:
        browser = "Other"

    if "Windows" in u:
        os_ = "Windows"
    elif "Android" in u:
        os_ = "Android"
    elif "iPhone" in u or "iPad" in u or "iPod" in u:
        os_ = "iOS"
    elif "Mac OS X" in u or "Macintosh" in u:
        os_ = "macOS"
    elif "CrOS" in u:
        os_ = "ChromeOS"
    elif "Linux" in u:
        os_ = "Linux"
    else:
        os_ = "Other"

    if "iPad" in u or "Tablet" in u or ("Android" in u and "Mobile" not in u):
        device = "tablet"
    elif "Mobi" in u or "iPhone" in u:
        device = "mobile"
    else:
        device = "desktop"
    return browser, os_, device


# --------------------------------------------------------------------- tools

_tool_prefixes = None


def tool_prefixes():
    """[(url prefix, tool title)], longest first, from the site's tool list."""
    global _tool_prefixes
    if _tool_prefixes is None:
        from pages.tools import TOOLS
        pairs = [(t["path"], t["title"]) for t in TOOLS if t["path"] != "/"]
        _tool_prefixes = sorted(pairs, key=lambda p: len(p[0]), reverse=True)
    return _tool_prefixes


def tool_for_path(path):
    for prefix, title in tool_prefixes():
        if path.startswith(prefix):
            return title
    return ""


def referrer_host(request):
    ref = request.META.get("HTTP_REFERER", "")
    if not ref:
        return ""
    host = (urlsplit(ref).hostname or "").lower()
    own = request.get_host().split(":")[0].lower()
    if not host or host == own or host.removeprefix("www.") == own.removeprefix("www."):
        return ""
    return host.removeprefix("www.")[:200]


# --------------------------------------------------------------------- record

def record(request, kind, name="", path=None, status=None, value=None, referrer=""):
    """Store one event. Never raises: analytics must not break the site."""
    try:
        now = timezone.now()
        path = (path or request.path)[:300]
        visitor = visitor_id(request)
        browser, os_, device = parse_ua(request.META.get("HTTP_USER_AGENT", ""))
        cc, cname, city = locate(client_ip(request))
        return Event.objects.create(
            ts=now, kind=kind, name=(name or "")[:120], path=path, tool=tool_for_path(path),
            visitor=visitor, session=session_id(visitor, now), referrer=referrer,
            country=cc, country_name=cname, city=city,
            browser=browser, os=os_, device=device, status=status, value=value)
    except Exception:
        log.exception("analytics: could not record event")
        return None


# --------------------------------------------------------------------- diagnostics

def diagnostics(request):
    """What the server sees, shown on the dashboard: proxy headers and the GeoIP database."""
    ip = client_ip(request)
    try:
        addr = ipaddress.ip_address(ip)
        ip_kind = "private/loopback (the proxy does not pass the client address)" \
            if addr.is_private or addr.is_loopback else "public"
    except ValueError:
        ip_kind = "invalid"
    path = geoip_path()
    info = dict(remote_addr=request.META.get("REMOTE_ADDR", ""),
                x_real_ip=bool(request.META.get("HTTP_X_REAL_IP")),
                x_forwarded_for=bool(request.META.get("HTTP_X_FORWARDED_FOR")),
                ip_kind=ip_kind, ip_public=ip_kind == "public",
                geoip_path=str(path or ""), geoip_exists=bool(path and path.exists()),
                geoip_age_days=None, geoip_type="", geoip_error="", test_lookup=None, your_location=None)
    if info["geoip_exists"]:
        import time as _time
        info["geoip_age_days"] = round((_time.time() - path.stat().st_mtime) / 86400)
        try:
            reader = _reader()
            info["geoip_type"] = reader.metadata().database_type
            info["test_lookup"] = locate("8.8.8.8")
            if info["ip_public"]:
                info["your_location"] = locate(ip)
        except Exception as exc:
            info["geoip_error"] = f"{type(exc).__name__}: {exc}"
    return info
