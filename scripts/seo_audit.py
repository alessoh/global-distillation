#!/usr/bin/env python3
"""Offline SEO and GEO audit for the Global Distillation static site.

Run from anywhere:  python3 scripts/seo_audit.py
Exit status is 1 when any check fails, so it can gate a CI job.

Checks, per route: title and description length, canonical correctness, Open Graph
and Twitter consistency with the title, exactly one h1, images with alt text,
parseable JSON-LD, and render-blocking scripts. Site-wide: sitemap entries match
real pages, robots.txt points at the sitemap and welcomes the main AI crawlers,
and llms.txt, llms-full.txt and answers.json exist.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://global-distillation.com"
ROUTES = ["", "academic", "financial", "political", "company", "developer",
          "customer", "library", "timeline", "compare", "methodology"]
AI_AGENTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot",
             "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended"]
BLOCKING_OK = {"application/ld+json", "importmap", "module"}

failures = []
warnings = []


def fail(msg):
    failures.append(msg)
    print("  FAIL  " + msg)


def warn(msg):
    warnings.append(msg)
    print("  warn  " + msg)


def first(pattern, text):
    m = re.search(pattern, text, re.S)
    return m.group(1) if m else None


def audit_page(route):
    path = ROOT / (route + "/index.html" if route else "index.html")
    name = "/" + route
    print(name)
    if not path.exists():
        fail(name + ": file missing")
        return
    html = path.read_text(encoding="utf-8")

    title = first(r"<title>(.*?)</title>", html)
    desc = first(r'<meta name="description" content="(.*?)"', html)
    if not title:
        fail(name + ": no <title>")
    elif len(title) > 60:
        warn(name + ": title is %d characters (over 60 may be truncated)" % len(title))
    if not desc:
        fail(name + ": no meta description")
    elif not 70 <= len(desc) <= 160:
        warn(name + ": description is %d characters (aim for 70 to 160)" % len(desc))

    canonicals = re.findall(r'<link rel="canonical" href="([^"]*)"', html)
    expected = ORIGIN + "/" + route
    if canonicals != [expected]:
        fail(name + ": canonical %r, expected exactly [%r]" % (canonicals, expected))
    og_urls = re.findall(r'<meta property="og:url" content="([^"]*)"', html)
    if og_urls != [expected]:
        fail(name + ": og:url %r, expected exactly [%r]" % (og_urls, expected))

    og_title = first(r'<meta property="og:title" content="(.*?)"', html)
    og_desc = first(r'<meta property="og:description" content="(.*?)"', html)
    if og_title != title:
        fail(name + ": og:title %r differs from <title> %r" % (og_title, title))
    if og_desc != desc:
        fail(name + ": og:description differs from the meta description")
    for tag in ("og:image", "twitter:image", "twitter:card"):
        if not re.search(r'<meta (?:property|name)="%s"' % re.escape(tag), html):
            fail(name + ": missing " + tag)

    h1s = re.findall(r"<h1[\s>]", html)
    if len(h1s) != 1:
        fail(name + ": %d h1 elements, expected 1" % len(h1s))

    for tag in re.findall(r"<img\b[^>]*>", html):
        if "alt=" not in tag:
            fail(name + ": image without alt text: " + tag[:80])

    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    if not blocks:
        fail(name + ": no JSON-LD")
    for block in blocks:
        try:
            json.loads(block)
        except json.JSONDecodeError as exc:
            fail(name + ": JSON-LD does not parse: " + str(exc))

    for m in re.finditer(r"<script\b([^>]*)>", html):
        attrs = m.group(1)
        if "src=" not in attrs:
            continue
        type_match = re.search(r'type="([^"]*)"', attrs)
        kind = type_match.group(1) if type_match else ""
        if kind in BLOCKING_OK or "defer" in attrs or "async" in attrs:
            continue
        warn(name + ": render-blocking script: " + attrs.strip()[:70])


def audit_site():
    print("site-wide")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc>", sitemap)
    expected = {ORIGIN + "/" + r for r in ROUTES}
    if set(locs) != expected:
        fail("sitemap.xml differs from the route list: missing %s, extra %s" % (
            sorted(expected - set(locs)), sorted(set(locs) - expected)))
    if len(locs) != len(set(locs)):
        fail("sitemap.xml contains duplicate URLs")

    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if "Sitemap: " + ORIGIN + "/sitemap.xml" not in robots:
        fail("robots.txt does not reference the sitemap")
    for agent in AI_AGENTS:
        if "User-agent: " + agent not in robots:
            warn("robots.txt has no explicit entry for " + agent)
    if re.search(r"^Disallow:\s*/\s*$", robots, re.M):
        fail("robots.txt contains a blanket Disallow: /")

    for rel in ("llms.txt", "llms-full.txt", "data/answers.json", "data/live.json"):
        if not (ROOT / rel).exists():
            fail("missing " + rel)

    live = json.loads((ROOT / "data/live.json").read_text(encoding="utf-8"))
    print("  info  live.json last refreshed " + str(live.get("updated")))


def main():
    for route in ROUTES:
        audit_page(route)
    audit_site()
    print("\n%d failure(s), %d warning(s)" % (len(failures), len(warnings)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
