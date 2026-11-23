from django.db import models


class GuideSchedule(models.Model):
    """When a guide goes live, as set in the admin.

    A guide without a row uses the "published" date in guides.py. A row with
    no date holds the guide back until a date is set.
    """

    slug = models.SlugField(max_length=120, unique=True)
    publish_on = models.DateField(
        "goes live on", null=True, blank=True,
        help_text="The guide appears on the site from this day. Leave empty to hold it back.",
    )

    class Meta:
        ordering = ["publish_on", "slug"]
        verbose_name = "guide"
        verbose_name_plural = "guides"

    def __str__(self):
        from .guides import GUIDES_BY_SLUG
        guide = GUIDES_BY_SLUG.get(self.slug)
        return guide["title"] if guide else self.slug
