from django.contrib import admin, messages
from django.utils.html import format_html

from .guides import GUIDES, GUIDES_BY_SLUG, today
from .models import GuideSchedule


@admin.register(GuideSchedule)
class GuideScheduleAdmin(admin.ModelAdmin):
    """The guides' release schedule. Every guide in guides.py is listed."""

    list_display = ("title", "publish_on", "status", "view")
    list_editable = ("publish_on",)
    list_display_links = None
    fields = ("title", "slug", "publish_on")
    readonly_fields = ("title", "slug")
    actions = ["publish_now", "hold"]

    def get_queryset(self, request):
        # A row for each guide, created with its date from guides.py.
        GuideSchedule.objects.bulk_create(
            [GuideSchedule(slug=g["slug"], publish_on=g["published"]) for g in GUIDES],
            ignore_conflicts=True,
        )
        return super().get_queryset(request).filter(slug__in=GUIDES_BY_SLUG)

    @admin.display(description="Guide")
    def title(self, obj):
        return str(obj)

    @admin.display(description="Status")
    def status(self, obj):
        if obj.publish_on is None:
            return "On hold"
        return "Live" if obj.publish_on <= today() else "Scheduled"

    @admin.display(description="Page")
    def view(self, obj):
        guide = GUIDES_BY_SLUG[obj.slug]
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', guide["path"], guide["path"])

    @admin.action(description="Publish now")
    def publish_now(self, request, queryset):
        count = queryset.update(publish_on=today())
        self.message_user(request, f"{count} guide(s) are live now.", messages.SUCCESS)

    @admin.action(description="Hold (take off the site)")
    def hold(self, request, queryset):
        count = queryset.update(publish_on=None)
        self.message_user(request, f"{count} guide(s) held back. Set a date to release them.", messages.SUCCESS)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
