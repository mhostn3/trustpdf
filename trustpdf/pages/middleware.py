from django.conf import settings


class ContentSecurityPolicyMiddleware:
    """Add a Content-Security-Policy header built from settings.CSP_DIRECTIVES.

    All JavaScript lives in static files (no inline scripts or onclick
    handlers), so 'unsafe-inline' is never needed for script-src. The
    connect-src directive is what backs the "files never leave your
    browser" promise: a script cannot send data anywhere not listed here.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        directives = getattr(settings, "CSP_DIRECTIVES", {})
        self.header_value = "; ".join(
            f"{name} {' '.join(values)}" for name, values in directives.items()
        )

    def __call__(self, request):
        response = self.get_response(request)
        if self.header_value and "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = self.header_value
        return response
