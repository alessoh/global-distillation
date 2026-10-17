#!/usr/bin/env python3
"""Explain a low click-through rate from a Google Search Console export.

In Search Console open Performance, set the date range, press EXPORT and choose
"Download .zip" (or "Download .csv" for the Queries and Pages tabs separately).
Then run:

    python3 scripts/gsc_report.py path/to/export.zip
    python3 scripts/gsc_report.py path/to/folder_with_csvs

Uses only the Python standard library. It reads Queries.csv and Pages.csv, and
reports where the impressions sit by rank, which searches were shown on page
one without earning a click, whether those searches are about the topic the
page answers, and how many clicks a typical page would have earned at the same
rank. The benchmark rates are rough industry-wide figures, not measurements of
this site, and results with AI answers above them usually earn less.
"""
import csv
import io
import re
import sys
import zipfile
from pathlib import Path

# Rough share of impressions that become clicks, by rank. An assumption, not data.
BENCHMARK_CTR = {1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06,
                 6: 0.05, 7: 0.04, 8: 0.03, 9: 0.025, 10: 0.02}
BENCHMARK_PAGE_TWO = 0.01
BENCHMARK_DEEP = 0.003

BRAND = re.compile(r"global[\s-]*distillation", re.I)
TOPIC = re.compile(r"distill", re.I)
QUESTION = re.compile(r"^(what|why|how|is|are|does|do|can|which|who|when)\b", re.I)


def read_tables(source: Path):
    """Return {'queries': rows, 'pages': rows} from a zip, a folder or one csv."""
    blobs = {}
    if source.is_dir():
        for f in source.iterdir():
            if f.suffix.lower() == ".csv":
                blobs[f.name.lower()] = f.read_bytes()
    elif source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as z:
            for name in z.namelist():
                if name.lower().endswith(".csv"):
                    blobs[Path(name).name.lower()] = z.read(name)
    elif source.suffix.lower() == ".csv":
        blobs[source.name.lower()] = source.read_bytes()
    else:
        raise SystemExit("Give me a .zip, a .csv or a folder of .csv files.")

    out = {}
    for key, wanted in (("queries", "queries"), ("pages", "pages")):
        match = next((b for n, b in blobs.items() if wanted in n), None)
        if match is not None:
            out[key] = parse(match)
    if not out:
        raise SystemExit("No Queries.csv or Pages.csv found in " + str(source))
    return out


def parse(raw: bytes):
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    rows = []
    for rec in reader:
        if len(rec) < 5 or not rec[0].strip():
            continue
        try:
            rows.append({
                "label": rec[0].strip(),
                "clicks": int(float(rec[1].replace(",", ""))),
                "impressions": int(float(rec[2].replace(",", ""))),
                "position": float(rec[4].replace(",", "")),
            })
        except ValueError:
            raise SystemExit("Unexpected row in %s: %r" % (header[0], rec))
    return rows


def count(n: int, singular: str, plural: str) -> str:
    return "%d %s" % (n, singular if n == 1 else plural)


def benchmark(position: float) -> float:
    rank = round(position)
    if rank < 1:
        rank = 1
    if rank in BENCHMARK_CTR:
        return BENCHMARK_CTR[rank]
    return BENCHMARK_PAGE_TWO if rank <= 20 else BENCHMARK_DEEP


def pct(part: float, whole: float) -> str:
    return "%.1f%%" % (100 * part / whole) if whole else "n/a"


def summarise(rows, noun):
    clicks = sum(r["clicks"] for r in rows)
    impressions = sum(r["impressions"] for r in rows)
    weighted = sum(r["position"] * r["impressions"] for r in rows) / impressions if impressions else 0
    expected = sum(benchmark(r["position"]) * r["impressions"] for r in rows)
    print("Across %d %s: %d impressions, %s (%s), impression-weighted position %.1f."
          % (len(rows), noun, impressions, count(clicks, "click", "clicks"), pct(clicks, impressions), weighted))
    print("At typical click rates for those ranks the same impressions would earn about %.0f clicks."
          % expected)
    return impressions


def rank_buckets(rows):
    buckets = [("positions 1 to 3", 0, 3.5), ("positions 4 to 10", 3.5, 10.5),
               ("positions 11 to 20", 10.5, 20.5), ("position 21 and below", 20.5, 1e9)]
    total = sum(r["impressions"] for r in rows) or 1
    print("\nWhere the impressions sit by rank:")
    for name, lo, hi in buckets:
        sel = [r for r in rows if lo <= r["position"] < hi]
        imp = sum(r["impressions"] for r in sel)
        clk = sum(r["clicks"] for r in sel)
        print("  %-24s %5d impressions (%5s of all), %s" % (name, imp, pct(imp, total), count(clk, "click", "clicks")))


def queries_report(rows):
    print("\n=== QUERIES ===")
    total = summarise(rows, "queries")
    rank_buckets(rows)

    brand = [r for r in rows if BRAND.search(r["label"])]
    off_topic = [r for r in rows if not TOPIC.search(r["label"])]
    questions = [r for r in rows if QUESTION.search(r["label"])]
    print("\nWhat people were searching for:")
    print("  Brand searches (the site's own name): %s, %d impressions"
          % (count(len(brand), "query", "queries"), sum(r["impressions"] for r in brand)))
    print("  Queries without the word 'distill':   %s, %d impressions (%s of all)"
          % (count(len(off_topic), "query", "queries"), sum(r["impressions"] for r in off_topic),
             pct(sum(r["impressions"] for r in off_topic), total)))
    print("  Phrased as a question:                %s, %d impressions"
          % (count(len(questions), "query", "queries"), sum(r["impressions"] for r in questions)))

    print("\nTop queries by impressions:")
    print("  %-52s %6s %6s %6s" % ("query", "impr.", "clicks", "pos."))
    for r in sorted(rows, key=lambda x: -x["impressions"])[:15]:
        print("  %-52s %6d %6d %6.1f" % (r["label"][:52], r["impressions"], r["clicks"], r["position"]))

    missed = [r for r in rows if r["position"] <= 10.5 and r["clicks"] == 0 and r["impressions"] >= 5]
    print("\nShown on page one, at least 5 times, never clicked (%s):" % count(len(missed), "query", "queries"))
    for r in sorted(missed, key=lambda x: -x["impressions"])[:15]:
        print("  %-52s %6d impr. at position %.1f" % (r["label"][:52], r["impressions"], r["position"]))

    near = [r for r in rows if 10.5 < r["position"] <= 20.5 and r["impressions"] >= 5]
    print("\nOn page two, close enough to be worth improving (%s):" % count(len(near), "query", "queries"))
    for r in sorted(near, key=lambda x: -x["impressions"])[:10]:
        print("  %-52s %6d impr. at position %.1f" % (r["label"][:52], r["impressions"], r["position"]))


def pages_report(rows):
    print("\n=== PAGES ===")
    summarise(rows, "pages")
    print("\n  %-58s %6s %6s %6s" % ("page", "impr.", "clicks", "pos."))
    for r in sorted(rows, key=lambda x: -x["impressions"]):
        print("  %-58s %6d %6d %6.1f" % (r["label"][-58:], r["impressions"], r["clicks"], r["position"]))
    print("\nA page that collects impressions but no clicks needs a better title and "
          "description. A page that is never shown needs better links or better targeting.")


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    tables = read_tables(Path(sys.argv[1]).expanduser())
    if "queries" in tables:
        queries_report(tables["queries"])
    else:
        print("No Queries.csv found, so I cannot say what people searched for.")
    if "pages" in tables:
        pages_report(tables["pages"])


if __name__ == "__main__":
    main()
