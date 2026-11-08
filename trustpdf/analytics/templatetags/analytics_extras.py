from django import template

register = template.Library()


@register.filter
def dur(seconds):
    """Seconds as '42 s', '3 min 05 s' or '1 h 12 min'."""
    if seconds is None:
        return "–"
    s = int(round(float(seconds)))
    if s < 60:
        return f"{s} s"
    if s < 3600:
        return f"{s // 60} min {s % 60:02d} s"
    return f"{s // 3600} h {(s % 3600) // 60:02d} min"


@register.filter
def change(pct):
    if pct is None:
        return ""
    return f"+{pct}%" if pct > 0 else f"{pct}%"
