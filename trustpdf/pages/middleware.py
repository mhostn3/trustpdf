from django.conf import settings


def _header(directives):
    return "; ".join(f"{name} {' '.join(values)}" for name, values in directives.items())


class ContentSecurityPolicyMiddleware:
    """Add the Content-Security-Policy (settings.CSP_DIRECTIVES) and Permissions-Policy headers.

    All JavaScript lives in static files (no inline scripts or onclick
    handlers) and all CSS in stylesheets, so 'unsafe-inline' is never needed
    on the public pages. The connect-src directive is what backs the "files
    never leave your browser" promise: a script cannot send data to any
    origin not listed there, and only this site is.

    Pages under the secret staff path get settings.CSP_STAFF_OVERRIDES on top
    (inline styles for the Django admin and the dashboard charts).
    """

    def __init__(self, get_response):
        self.get_response = get_response
        directives = dict(getattr(settings, "CSP_DIRECTIVES", {}))
        self.header_value = _header(directives)
        self.staff_value = _header({**directives, **getattr(settings, "CSP_STAFF_OVERRIDES", {})})
        self.staff_prefix = f"/{settings.ADMIN_PATH}/"
        self.permissions = getattr(settings, "PERMISSIONS_POLICY", "")

    def __call__(self, request):
        response = self.get_response(request)
        if self.header_value and "Content-Security-Policy" not in response:
            # Browsers show XML (the sitemap) with a built-in viewer that styles itself inline.
            relaxed = request.path.startswith(self.staff_prefix) or response.get("Content-Type", "").startswith("application/xml")
            response["Content-Security-Policy"] = self.staff_value if relaxed else self.header_value
        if self.permissions and "Permissions-Policy" not in response:
            response["Permissions-Policy"] = self.permissions
        return response
