"""Cookie-free site analytics.

Every row is one event. A visitor is an anonymous hash of (secret salt, IP, user agent).
The salt is random and changes every quarter; the previous salt is deleted, so a returning
visitor is recognised within a quarter but hashes cannot be linked across quarters or traced
back to an IP address. IP addresses are never stored. No cookies are set.
"""
from django.db import models
from django.utils import timezone


class Event(models.Model):
    PAGEVIEW = "pageview"   # full HTML page load (server side)
    ACTION = "action"       # POST / htmx / file download handled by a view (server side)
    CLICK = "click"         # button, tab or export click in the browser
    INPUT = "input"         # select / checkbox / radio changed in the browser (never typed text)
    ENGAGE = "engage"       # seconds the page was visible (value)
    PING = "ping"           # the page's script ran: a real browser, not a script-less bot
    KINDS = [(k, k) for k in (PAGEVIEW, ACTION, CLICK, INPUT, ENGAGE, PING)]
    BROWSER_KINDS = (CLICK, INPUT, ENGAGE, PING)  # only sent by a browser that ran our script

    ts = models.DateTimeField(default=timezone.now, db_index=True)
    kind = models.CharField(max_length=10, choices=KINDS)
    name = models.CharField(max_length=120, blank=True)
    path = models.CharField(max_length=300)
    tool = models.CharField(max_length=120, blank=True, db_index=True)
    visitor = models.CharField(max_length=16, db_index=True)
    session = models.CharField(max_length=16, db_index=True)
    referrer = models.CharField(max_length=200, blank=True)
    country = models.CharField(max_length=2, blank=True)
    country_name = models.CharField(max_length=60, blank=True)
    city = models.CharField(max_length=80, blank=True)
    browser = models.CharField(max_length=30, blank=True)
    os = models.CharField(max_length=30, blank=True)
    device = models.CharField(max_length=10, blank=True)
    status = models.PositiveSmallIntegerField(null=True, blank=True)
    value = models.FloatField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["kind", "ts"])]
        ordering = ["-ts"]

    def __str__(self):
        return f"{self.ts:%Y-%m-%d %H:%M} {self.kind} {self.name or self.path}"


class VisitorSalt(models.Model):
    """Random salt of one period (quarter); the period's first day is the key."""
    period = models.DateField(unique=True)
    salt = models.CharField(max_length=64)
