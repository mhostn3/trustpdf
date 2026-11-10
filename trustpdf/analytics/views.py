import csv
import json

from django.contrib.admin.views.decorators import staff_member_required
from django.core.cache import cache
from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.urls import reverse
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import tracking
from .models import Event
from .report import build_report, period_from_request

BROWSER_KINDS = {"click": Event.CLICK, "input": Event.INPUT, "engage": Event.ENGAGE, "view": Event.PING}
MAX_EVENTS_PER_HOUR = 600


@csrf_exempt
@require_POST
def collect(request):
    """Browser events sent by static/js/trustpdf-analytics.js (navigator.sendBeacon)."""
    if tracking.skip_client(request):
        return HttpResponse(status=204)
    try:
        data = json.loads(request.body[:4000] or b"{}")
        kind = BROWSER_KINDS[data.get("k")]
        path = str(data.get("p") or "/")[:300]
        name = " ".join(str(data.get("n") or "").split())[:120]
        value = data.get("v")
        value = float(value) if value is not None else None
    except (ValueError, KeyError, TypeError):
        return HttpResponseBadRequest()
    if not path.startswith("/") or tracking.skip_path(path):
        return HttpResponse(status=204)
    if kind == Event.ENGAGE:
        if value is None or not (0 < value <= 4 * 3600):
            return HttpResponse(status=204)
    elif not name and kind != Event.PING:
        return HttpResponse(status=204)

    key = "tpan:rate:" + tracking.visitor_id(request)
    try:
        cache.add(key, 0, 3600)
        if cache.incr(key) > MAX_EVENTS_PER_HOUR:
            return HttpResponse(status=204)
    except Exception:
        pass
    tracking.record(request, kind, name=name if kind not in (Event.ENGAGE, Event.PING) else "",
                    path=path, value=value if kind == Event.ENGAGE else None)
    return HttpResponse(status=204)


def ignore_me(request):
    """Public page: stop (or resume) counting this browser, e.g. the owner's phone and PC.
    Sets a first-party cookie only when the visitor asks for it."""
    state = request.COOKIES.get(tracking.IGNORE_COOKIE) == "1"
    action = request.GET.get("set")
    if action in ("on", "off"):
        state = action == "on"
    resp = render(request, "analytics/ignore.html", {
        "ignored": state, "seo_title": "Analytics opt-out - TrustPDF", "robots": "noindex, nofollow"})
    if action == "on":
        resp.set_cookie(tracking.IGNORE_COOKIE, "1", max_age=10 * 365 * 86400, samesite="Lax",
                        secure=not settings.DEBUG, httponly=True)
    elif action == "off":
        resp.delete_cookie(tracking.IGNORE_COOKIE)
    resp["X-Robots-Tag"] = "noindex, nofollow"
    return resp


@staff_member_required
def dashboard(request):
    period = period_from_request(request)
    if request.GET.get("format") == "csv":
        return export_csv(period, everything=request.GET.get("all") == "1")
    ctx = build_report(period)
    ctx["diag"] = tracking.diagnostics(request)
    ctx["ignored"] = request.COOKIES.get(tracking.IGNORE_COOKIE) == "1"
    ctx.update(seo_title="Analytics - TrustPDF", robots="noindex, nofollow")
    return render(request, "analytics/dashboard.html", ctx)


def export_csv(period, everything=False):
    """Raw events of the period, or of all time with everything=True."""
    resp = HttpResponse(content_type="text/csv")
    span = "all" if everything else f"{period.start:%Y%m%d}-{period.end:%Y%m%d}"
    resp["Content-Disposition"] = f'attachment; filename="trustpdf-analytics-{span}.csv"'
    fields = ["ts", "kind", "name", "path", "tool", "visitor", "session", "referrer", "country",
              "country_name", "city", "browser", "os", "device", "status", "value"]
    w = csv.writer(resp)
    w.writerow(fields)
    qs = Event.objects.all() if everything else \
        Event.objects.filter(ts__gte=period.start_dt, ts__lt=period.end_dt)
    for row in qs.order_by("ts").values_list(*fields).iterator():
        w.writerow(row)
    return resp


def manifest(request):
    """Web app manifest for the dashboard, so "Add to Home screen" opens the dashboard, not the home page.
    Served only under the secret admin path and linked only from the dashboard, so it never reveals the path.
    Not staff-only: browsers fetch manifests without cookies."""
    start = reverse("analytics:dashboard")
    data = {
        "id": start,
        "name": "TrustPDF Analytics",
        "short_name": "Analytics",
        "start_url": start,
        "scope": reverse("admin:index"),  # login and admin pages stay inside the app window
        "display": "standalone",
        "background_color": "#f6f8fc",
        "theme_color": "#ffffff",
        "icons": [
            {"src": static("img/icon-192.png"), "sizes": "192x192", "type": "image/png"},
            {"src": static("img/icon-512.png"), "sizes": "512x512", "type": "image/png"},
        ],
    }
    response = JsonResponse(data, content_type="application/manifest+json")
    response["Cache-Control"] = "private, max-age=3600"
    response["X-Robots-Tag"] = "noindex"
    return response
