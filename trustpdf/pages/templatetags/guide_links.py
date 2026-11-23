from django import template
from django.urls import reverse
from django.utils.html import format_html

from ..guides import live_guide

register = template.Library()


@register.simple_tag
def guide_link(slug, text):
    """A link to another guide, or just the text while that guide is not live yet."""
    guide = live_guide(slug)
    if guide is None:
        return text
    return format_html('<a href="{}">{}</a>', reverse(guide["url_name"]), text)
