from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("ts", "kind", "tool", "name", "path", "country", "city", "device", "visitor")
    list_filter = ("kind", "device", "country", "tool")
    search_fields = ("path", "name", "tool", "city", "referrer")
    date_hierarchy = "ts"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
