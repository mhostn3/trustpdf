import datetime

from django.conf import settings

from .tools import TOOLS


def site(request):
    """Values every template needs: the tool list, analytics config, contact."""
    return {
        "tools": TOOLS,
        "site_url": settings.SITE_URL,
        "umami_website_id": settings.UMAMI_WEBSITE_ID,
        "umami_script_url": settings.UMAMI_SCRIPT_URL,
        "contact_email": settings.CONTACT_EMAIL,
        "current_year": datetime.date.today().year,
    }
