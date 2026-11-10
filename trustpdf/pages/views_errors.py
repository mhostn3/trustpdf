from django.shortcuts import render

# status code -> (page title, heading, message, privacy note, robots)
ERRORS = {
    400: (
        "Bad Request", "Bad request",
        "The request could not be processed. Please go back, refresh the page, or return to the homepage.",
        "TrustPDF keeps PDF processing client-side. Your files are not uploaded because of this error.",
        "noindex, nofollow",
    ),
    403: (
        "Access Forbidden", "Access forbidden",
        "You do not have permission to access this page.",
        "If you reached this page while using a PDF tool, please refresh the page or return to the homepage.",
        "noindex, nofollow",
    ),
    404: (
        "Page Not Found", "Page not found",
        "The page you are looking for does not exist, may have been moved, or the link may be incorrect.",
        "TrustPDF processes PDF files directly in your browser. Your files are not uploaded to our server.",
        "noindex, follow",
    ),
    500: (
        "Server Error", "Something went wrong",
        "The server encountered an unexpected error. Please try again later.",
        "Your PDF files are processed in your browser and are not uploaded to our server.",
        "noindex, nofollow",
    ),
}


def _error_page(request, status):
    seo, title, message, privacy_note, robots = ERRORS[status]
    context = {
        "seo_title": f"{seo} - TrustPDF",
        "meta_description": f"{title}. Return to TrustPDF private client-side PDF tools.",
        "robots": robots,
        "error_code": str(status),
        "error_title": title,
        "error_message": message,
        "error_privacy_note": privacy_note,
    }
    return render(request, "errors/error.html", context, status=status)


def error_400(request, exception=None):
    return _error_page(request, 400)


def error_403(request, exception=None):
    return _error_page(request, 403)


def error_404(request, exception=None):
    return _error_page(request, 404)


def error_500(request):
    return _error_page(request, 500)
