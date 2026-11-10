"""Aggregations for the analytics dashboard."""
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from itertools import combinations

from django.db.models import Count, Min, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import Event

PERIODS = [(7, "7 days"), (28, "4 weeks"), (91, "3 months"), (365, "12 months")]
ACTION_KINDS = (Event.CLICK,)  # what visitors did themselves


@dataclass
class Period:
    start: date          # first day, inclusive
    end: date            # last day, inclusive
    days: int
    humans: bool = True  # only sessions whose browser ran the analytics script (no bots)

    @property
    def start_dt(self):
        return timezone.make_aware(datetime.combine(self.start, time.min), timezone.get_default_timezone())

    @property
    def end_dt(self):
        return timezone.make_aware(datetime.combine(self.end + timedelta(days=1), time.min),
                                   timezone.get_default_timezone())

    def previous(self):
        return Period(self.start - timedelta(days=self.days), self.start - timedelta(days=1), self.days, self.humans)

    def next(self):
        return Period(self.end + timedelta(days=1), self.end + timedelta(days=self.days), self.days, self.humans)

    def with_all_traffic(self):
        return Period(self.start, self.end, self.days, False)


def period_from_request(request):
    try:
        days = int(request.GET.get("days", 7))
    except ValueError:
        days = 7
    days = days if days in dict(PERIODS) else 7
    today = timezone.localdate()
    try:
        end = date.fromisoformat(request.GET.get("end", ""))
    except ValueError:
        end = today
    end = min(end, today)
    return Period(end - timedelta(days=days - 1), end, days, request.GET.get("traffic") != "all")


def _change(now, before):
    if not before:
        return None
    return round(100.0 * (now - before) / before)


def _qs(period):
    qs = Event.objects.filter(ts__gte=period.start_dt, ts__lt=period.end_dt)
    if period.humans:
        browser_sessions = qs.filter(kind__in=Event.BROWSER_KINDS).values("session")
        qs = qs.filter(session__in=browser_sessions)
    return qs


def summary(period):
    qs = _qs(period)
    pv = qs.filter(kind=Event.PAGEVIEW)
    n_visitors = qs.values("visitor").distinct().count()
    sessions = list(qs.values("session").annotate(
        views=Count("id", filter=_kind(Event.PAGEVIEW)),
        acts=Count("id", filter=_kinds(ACTION_KINDS + (Event.INPUT,))),
        engaged=Sum("value", filter=_kind(Event.ENGAGE))))
    n_sessions = len(sessions)
    bounces = sum(1 for s in sessions if s["views"] <= 1 and not s["acts"])
    engaged = sum(s["engaged"] or 0 for s in sessions)
    # A subquery, not a Python list of ids: SQLite refuses more than ~32,000 bound variables.
    returning = (Event.objects.filter(visitor__in=qs.values("visitor"), ts__lt=period.start_dt)
                 .values("visitor").distinct().count())
    return dict(
        visitors=n_visitors, returning=returning, new=n_visitors - returning,
        sessions=n_sessions, pageviews=pv.count(),
        actions=qs.filter(kind__in=ACTION_KINDS).count(),
        calls=qs.filter(kind=Event.ACTION).count(),
        inputs=qs.filter(kind=Event.INPUT).count(),
        bounce=round(100.0 * bounces / n_sessions) if n_sessions else None,
        engaged_per_session=engaged / n_sessions if n_sessions else None,
    )


def _kind(k):
    return Q(kind=k)


def _kinds(ks):
    return Q(kind__in=ks)


def daily(period):
    rows = {r["day"]: r for r in _qs(period).annotate(day=TruncDate("ts")).values("day").annotate(
        pageviews=Count("id", filter=_kind(Event.PAGEVIEW)),
        visitors=Count("visitor", distinct=True),
        actions=Count("id", filter=_kinds(ACTION_KINDS)))}
    out = []
    d = period.start
    while d <= period.end:
        r = rows.get(d, {})
        out.append(dict(day=d.isoformat(), pageviews=r.get("pageviews", 0),
                        visitors=r.get("visitors", 0), actions=r.get("actions", 0)))
        d += timedelta(days=1)
    return out


def tools(period):
    """One row per tool on the site, including tools nobody opened."""
    from pages.tools import tools_by_group
    cur = _tool_stats(period)
    prev = _tool_stats(period.previous())
    detail = _tool_detail(period)
    rows = []
    for g, group_tools in tools_by_group():
        for t in group_tools:
            s = cur.get(t["title"], {})
            p = prev.get(t["title"], {})
            views = s.get("pageviews", 0)
            rows.append(dict(
                title=t["title"], group=g["label"], url=t["path"], flag=g["label"],
                pageviews=views, visitors=s.get("visitors", 0), sessions=s.get("sessions", 0),
                actions=s.get("actions", 0), inputs=s.get("inputs", 0), calls=s.get("calls", 0),
                engaged=(s.get("engaged") or 0) / views if views else None,
                change=_change(views, p.get("pageviews", 0)), prev=p.get("pageviews", 0),
                detail=detail.get(t["title"], [])))
    rows.sort(key=lambda r: (-r["pageviews"], -r["actions"], r["title"]))
    top = max([r["pageviews"] for r in rows] + [1])
    for r in rows:
        r["bar"] = round(100 * r["pageviews"] / top)
    return rows


def _tool_stats(period):
    return {r["tool"]: r for r in _qs(period).exclude(tool="").values("tool").annotate(
        pageviews=Count("id", filter=_kind(Event.PAGEVIEW)),
        visitors=Count("visitor", distinct=True),
        sessions=Count("session", distinct=True),
        actions=Count("id", filter=_kinds(ACTION_KINDS)),
        inputs=Count("id", filter=_kind(Event.INPUT)),
        calls=Count("id", filter=_kind(Event.ACTION)),
        engaged=Sum("value", filter=_kind(Event.ENGAGE)))}


def _tool_detail(period, limit=15):
    """What people did inside each tool: buttons, server actions, changed options."""
    out = defaultdict(list)
    rows = (_qs(period).exclude(tool="").filter(kind__in=(Event.CLICK, Event.INPUT, Event.ACTION))
            .values("tool", "kind", "name").annotate(n=Count("id"), v=Count("visitor", distinct=True))
            .order_by("tool", "-n"))
    for r in rows:
        if len(out[r["tool"]]) < limit:
            out[r["tool"]].append(r)
    return out


def top(period, field, limit=15, kind=Event.PAGEVIEW, blank="(unknown)"):
    qs = _qs(period).filter(kind=kind)
    rows = list(qs.values(field).annotate(n=Count("id"), v=Count("visitor", distinct=True))
                .order_by("-v", "-n")[:limit])
    total = max([r["v"] for r in rows] + [1])
    return [dict(label=r[field] or blank, n=r["n"], v=r["v"], bar=round(100 * r["v"] / total)) for r in rows]


def countries(period, limit=20):
    rows = list(_qs(period).filter(kind=Event.PAGEVIEW).values("country", "country_name")
                .annotate(n=Count("id"), v=Count("visitor", distinct=True)).order_by("-v", "-n")[:limit])
    total = max([r["v"] for r in rows] + [1])
    return [dict(label=r["country_name"] or r["country"] or "(unknown)", code=r["country"],
                 flag=_flag(r["country"]), n=r["n"], v=r["v"], bar=round(100 * r["v"] / total))
            for r in rows]


def cities(period, limit=20):
    rows = list(_qs(period).filter(kind=Event.PAGEVIEW).exclude(city="")
                .values("city", "country").annotate(n=Count("id"), v=Count("visitor", distinct=True))
                .order_by("-v", "-n")[:limit])
    total = max([r["v"] for r in rows] + [1])
    return [dict(label=r["city"], flag=_flag(r["country"]), n=r["n"], v=r["v"],
                 bar=round(100 * r["v"] / total)) for r in rows]


def _flag(code):
    if not code or len(code) != 2 or not code.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


def journeys(period, limit=12):
    """Entry pages, and tools used together in one session."""
    by_session = defaultdict(list)
    for s, ts, path, tool in (_qs(period).filter(kind=Event.PAGEVIEW).order_by("ts")
                              .values_list("session", "ts", "path", "tool").iterator()):
        by_session[s].append((path, tool))
    entries, pairs = Counter(), Counter()
    for views in by_session.values():
        path, tool = views[0]
        entries[tool or ("Home" if path == "/" else path)] += 1
        used = sorted({t for _, t in views if t})
        for a, b in combinations(used, 2):
            pairs[(a, b)] += 1
    return dict(
        entries=[dict(label=k, n=v) for k, v in entries.most_common(limit)],
        pairs=[dict(a=a, b=b, n=v) for (a, b), v in pairs.most_common(limit)],
    )


def build_report(period):
    cur = summary(period)
    prev = summary(period.previous())
    kpis = []
    for key, label, fmt in [
        ("visitors", "Visitors", "int"), ("sessions", "Sessions", "int"),
        ("pageviews", "Page views", "int"), ("actions", "Clicks in tools", "int"),
        ("engaged_per_session", "Time per session", "dur"), ("bounce", "Bounce rate", "pct"),
    ]:
        kpis.append(dict(label=label, value=cur[key], fmt=fmt, change=_change(cur[key] or 0, prev[key] or 0)
                         if key not in ("bounce",) else None, prev=prev[key]))
    first = Event.objects.aggregate(first=Min("ts"))["first"]
    everything = _qs(period.with_all_traffic())
    filtered = dict(
        visitors=everything.values("visitor").distinct().count() - cur["visitors"],
        pageviews=everything.filter(kind=Event.PAGEVIEW).count() - cur["pageviews"],
    )
    return dict(
        period=period, periods=PERIODS, prev=period.previous(),
        next=period.next() if period.end < timezone.localdate() else None,
        summary=cur, prev_summary=prev, kpis=kpis,
        daily=daily(period), tool_rows=tools(period),  # "tools" is the site menu
        countries=countries(period), cities=cities(period),
        referrers=top(period, "referrer", blank="(direct / none)"),
        pages=top(period, "path"),
        devices=top(period, "device", limit=5), browsers=top(period, "browser", limit=8),
        oses=top(period, "os", limit=8), journeys=journeys(period), first_event=first,
        filtered=filtered,
    )
