from django.shortcuts import render

from .tools import TOOLS

def error_400(request, exception=None):
    context = {
        "seo_title": "Bad Request - TrustPDF",
        "meta_description": "Bad request. Return to TrustPDF private client-side PDF tools.",
        "robots": "noindex, nofollow",
        "tools": TOOLS,

        "error_code": "400",
        "error_title": "Bad request",
        "error_message": "The request could not be processed. Please go back, refresh the page, or return to the homepage.",
        "error_privacy_note": "TrustPDF keeps PDF processing client-side. Your files are not uploaded because of this error.",
    }

    return render(request, "errors/error.html", context, status=400)


def error_403(request, exception=None):
    context = {
        "seo_title": "Access Forbidden - TrustPDF",
        "meta_description": "Access forbidden. Return to TrustPDF private client-side PDF tools.",
        "robots": "noindex, nofollow",
        "tools": TOOLS,

        "error_code": "403",
        "error_title": "Access forbidden",
        "error_message": "You do not have permission to access this page.",
        "error_privacy_note": "If you reached this page while using a PDF tool, please refresh the page or return to the homepage.",
    }

    return render(request, "errors/error.html", context, status=403)


def error_404(request, exception=None):
    context = {
        "seo_title": "Page Not Found - TrustPDF",
        "meta_description": "Page not found. Return to TrustPDF private client-side PDF tools.",
        "robots": "noindex, follow",
        "tools": TOOLS,

        "error_code": "404",
        "error_title": "Page not found",
        "error_message": "The page you are looking for does not exist, may have been moved, or the link may be incorrect.",
        "error_privacy_note": "TrustPDF processes PDF files directly in your browser. Your files are not uploaded to our server.",
    }

    return render(request, "errors/error.html", context, status=404)


def error_500(request):
    context = {
        "seo_title": "Server Error - TrustPDF",
        "meta_description": "Server error. Return to TrustPDF private client-side PDF tools.",
        "robots": "noindex, nofollow",
        "tools": TOOLS,

        "error_code": "500",
        "error_title": "Something went wrong",
        "error_message": "The server encountered an unexpected error. Please try again later.",
        "error_privacy_note": "Your PDF files are processed in your browser and are not uploaded to our server.",
    }

    return render(request, "errors/error.html", context, status=500)