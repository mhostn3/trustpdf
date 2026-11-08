"""
Django settings for the TrustPDF project.

TrustPDF is a client-side site: every PDF tool runs in the visitor's browser.
Django renders templates, serves static files and keeps first-party, cookie-free
usage statistics (the ``analytics`` app) in a small SQLite database. Sessions and
auth exist only for the staff login of the admin and the analytics dashboard.

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
    ANALYTICS_ENABLED=(bool, True),
    ANALYTICS_TRACK_STAFF=(bool, False),
    ADMIN_PATH=(str, "admin"),
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

CONTACT_EMAIL = "info@koplemo.com"

# Search engine ownership checks (Google Search Console, Bing Webmaster Tools).
# Paste only the content="..." value of the meta tag they give you.
GOOGLE_SITE_VERIFICATION = env("GOOGLE_SITE_VERIFICATION")
BING_SITE_VERIFICATION = env("BING_SITE_VERIFICATION")

# IndexNow (Bing, Yandex, Seznam, Naver): a random hex key, served at /<key>.txt.
# `manage.py indexnow` then tells those engines about every page; the deploy script runs it.
INDEXNOW_KEY = env("INDEXNOW_KEY")


# Application definition
# The admin, auth and sessions are only used by staff (the analytics dashboard).
# Visitors of the public pages get no session and no cookies.

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",
    "pages",
    "analytics.apps.AnalyticsConfig",
    "axes",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "analytics.middleware.AnalyticsMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "pages.middleware.ContentSecurityPolicyMiddleware",
    "axes.middleware.AxesMiddleware",
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
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "pages.context_processors.site",
            ],
        },
    },
]

WSGI_APPLICATION = "trustpdf.wsgi.application"


# Database: only the usage statistics and the staff login live here.
# Every PDF tool runs in the visitor's browser; no file ever reaches the server.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": env("DATABASE_PATH", default=str(PRE_BASE_DIR / "db.sqlite3")),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Admin login form posts from the public origin (behind nginx).
CSRF_TRUSTED_ORIGINS = [SITE_URL, SITE_URL.replace("://www.", "://")]


# Site analytics (analytics app): cookie-free, first-party, dashboard at /<ADMIN_PATH>/analytics/.
ANALYTICS_ENABLED = env("ANALYTICS_ENABLED")
ANALYTICS_TRACK_STAFF = env("ANALYTICS_TRACK_STAFF")
ANALYTICS_RETENTION_DAYS = 396  # 13 months
# DB-IP City Lite (python manage.py update_geoip); a MaxMind GeoLite2-City file works too.
ANALYTICS_GEOIP_PATH = env("ANALYTICS_GEOIP_PATH", default=str(PRE_BASE_DIR / ".geoip" / "dbip-city-lite.mmdb"))

# Admin and the analytics dashboard live under a secret path, set ADMIN_PATH in the server .env
# (e.g. a random UUID). The dashboard is at /<ADMIN_PATH>/analytics/.
ADMIN_PATH = env("ADMIN_PATH").strip("/") or "admin"

# Login lockout (django-axes): 3 failed logins from the same IP for the same username block
# that pair for 1 hour. Unlock early with: python manage.py axes_reset
AXES_FAILURE_LIMIT = 3
AXES_COOLOFF_TIME = 1  # hours
AXES_LOCKOUT_PARAMETERS = [["ip_address", "username"]]
AXES_RESET_ON_SUCCESS = True
AXES_CLIENT_IP_CALLABLE = "analytics.tracking.client_ip"  # X-Real-IP from nginx, not forgeable
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]


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

# Visitors get no cookies. Staff logins (session, CSRF) and the optional
# analytics opt-out cookie are secure-only.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Content Security Policy (see pages/middleware.py).
# The guarantee that files never leave the browser is enforced here:
# scripts may only talk to this origin (the analytics endpoint is on it too).
CSP_DIRECTIVES = {
    "default-src": ["'self'"],
    # 'wasm-unsafe-eval' lets qpdf (passwords) and Tesseract (OCR), compiled to
    # WebAssembly, run. It does not allow eval() or inline scripts.
    "script-src": ["'self'", "'wasm-unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
}

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
