import datetime

from django.conf import settings

from .tools import TOOLS, tools_by_group


def site(request):
    """Values every template needs: the tool list, analytics config, contact."""
    return {
        "tools": TOOLS,
        "nav_tool_groups": tools_by_group(),
        "site_url": settings.SITE_URL,
        "umami_website_id": settings.UMAMI_WEBSITE_ID,
        "umami_script_url": settings.UMAMI_SCRIPT_URL,
        "contact_email": settings.CONTACT_EMAIL,
        "current_year": datetime.date.today().year,
        "google_site_verification": settings.GOOGLE_SITE_VERIFICATION,
        "bing_site_verification": settings.BING_SITE_VERIFICATION,
    }
