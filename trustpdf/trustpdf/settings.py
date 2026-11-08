"""
Django settings for the TrustPDF project.

TrustPDF is a static, client-side site. Django only renders templates and
serves static files, so no database, sessions or auth are configured.

Configuration is read from a ``.env`` file next to the repository root
(see ``.env.example``) or from environment variables.
"""

from pathlib import Path
import os
import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
PRE_BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    SITE_URL=(str, "https://www.trustpdf.net"),
    STATIC_ROOT=(str, str(PRE_BASE_DIR / "staticfiles")),
    SECURE_SSL_REDIRECT=(bool, None),
    SECURE_HSTS_SECONDS=(int, 31536000),
    UMAMI_WEBSITE_ID=(str, "9ad1d916-d376-4371-b1b1-fafdf77ddaf4"),
    UMAMI_SCRIPT_URL=(str, "https://cloud.umami.is/script.js"),
    GOOGLE_SITE_VERIFICATION=(str, ""),
    BING_SITE_VERIFICATION=(str, ""),
    INDEXNOW_KEY=(str, ""),
)
environ.Env.read_env(os.path.join(PRE_BASE_DIR, ".env"))

# Public origin of the site, used for canonical URLs and the sitemap.
SITE_URL = env("SITE_URL").rstrip("/")

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env("SECRET_KEY")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env("DEBUG")

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

# Anonymous, cookie-free analytics (Umami). Set UMAMI_WEBSITE_ID="" to disable.
UMAMI_WEBSITE_ID = env("UMAMI_WEBSITE_ID")
UMAMI_SCRIPT_URL = env("UMAMI_SCRIPT_URL")
CONTACT_EMAIL = "info@koplemo.com"

# Search engine ownership checks (Google Search Console, Bing Webmaster Tools).
# Paste only the content="..." value of the meta tag they give you.
GOOGLE_SITE_VERIFICATION = env("GOOGLE_SITE_VERIFICATION")
BING_SITE_VERIFICATION = env("BING_SITE_VERIFICATION")

# IndexNow (Bing, Yandex, Seznam, Naver): a random hex key, served at /<key>.txt.
# `manage.py indexnow` then tells those engines about every page; the deploy script runs it.
INDEXNOW_KEY = env("INDEXNOW_KEY")


# Application definition
# Only staticfiles and the "pages" app are needed: there is no database,
# no admin, no sessions and no authentication on this site.

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "pages",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "pages.middleware.ContentSecurityPolicyMiddleware",
]

ROOT_URLCONF = "trustpdf.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "pages.context_processors.site",
            ],
        },
    },
]

WSGI_APPLICATION = "trustpdf.wsgi.application"


# Database: none. Every tool runs in the visitor's browser.
DATABASES = {}


# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = env("STATIC_ROOT")

STORAGES = {
    "staticfiles": {
        # Hashed filenames + gzip/brotli, served by WhiteNoise with long cache headers.
        # Run `python manage.py collectstatic` on deploy.
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
WHITENOISE_MAX_AGE = 60 * 60 * 24 * 365 if not DEBUG else 0

if DEBUG:
    # Avoid manifest lookups during development.
    STORAGES["staticfiles"]["BACKEND"] = "django.contrib.staticfiles.storage.StaticFilesStorage"


# Security headers
# https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# Gunicorn normally sits behind a TLS-terminating proxy (nginx, Caddy, ...).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
_ssl_redirect = env("SECURE_SSL_REDIRECT")
SECURE_SSL_REDIRECT = (not DEBUG) if _ssl_redirect is None else _ssl_redirect
SECURE_HSTS_SECONDS = 0 if DEBUG else env("SECURE_HSTS_SECONDS")
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# No cookies are set by this site, but if any ever are, keep them secure.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Content Security Policy (see pages/middleware.py).
# The guarantee that files never leave the browser is enforced here:
# scripts may only talk to this origin and the analytics endpoint.
CSP_DIRECTIVES = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://cloud.umami.is"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "https://cloud.umami.is", "https://api-gateway.umami.dev"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
}

# Default primary key field type (unused: no models)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
