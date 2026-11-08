"""Server-side analytics (page views, form/htmx actions, file downloads)."""
from . import tracking
from .models import Event


class AnalyticsMiddleware:
    """Must come after AuthenticationMiddleware (staff visits are not counted)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self.track(request, response)
        except Exception:  # analytics must never break a page
            tracking.log.exception("analytics middleware")
        return response

    @staticmethod
    def track(request, response):
        if request.method not in ("GET", "POST") or tracking.skip_request(request):
            return
        status = response.status_code
        if status >= 500 or status in (301, 302, 304, 404, 405):
            return
        is_htmx = request.headers.get("HX-Request") == "true"
        ctype = response.get("Content-Type", "")
        match = getattr(request, "resolver_match", None)
        url_name = (match.view_name if match else "") or ""

        if request.method == "GET" and not is_htmx and ctype.startswith("text/html"):
            if status != 200:
                return
            tracking.record(request, Event.PAGEVIEW, status=status,
                            referrer=tracking.referrer_host(request))
        elif "attachment" in response.get("Content-Disposition", ""):
            tracking.record(request, Event.ACTION, name="download " + (url_name or request.path), status=status)
        elif request.method == "POST" or is_htmx:
            # A calculation or upload done by a view of the site.
            tracking.record(request, Event.ACTION, name=url_name or request.path, status=status)
