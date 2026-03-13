#!/usr/bin/env python3
"""
Morning Digest — Automated Intelligence Brief v3.1

Fetches 16 premier analyst RSS feeds in parallel, deduplicates against a
7-day rolling cache, sends all articles through a single Claude Haiku API
call for scored strategic analysis, and outputs HTML email, Markdown, and
JSON formats.

Usage:
    python morning_digest.py                  # Generate + send email
    python morning_digest.py --preview        # Generate files only, no email

Environment variables (or .env file):
    ANTHROPIC_API_KEY   — Required. Claude API key.
    DIGEST_EMAIL        — Recipient (default: from DIGEST_EMAIL env var)
    SMTP_HOST           — SMTP server (default: smtp.gmail.com)
    SMTP_PORT           — SMTP port (default: 587)
    SMTP_USER           — SMTP username (Gmail address)
    SMTP_PASS           — SMTP app password
"""

import csv
import hashlib
import json
import os
import re
import smtplib
import stat
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape as html_escape
from pathlib import Path

import anthropic
import feedparser

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)
except ImportError:
    pass

__version__ = "3.1"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent
CACHE_DIR = ROOT / "cache"
OUTPUT_HTML = ROOT / "output" / "html"
OUTPUT_MD = ROOT / "output" / "markdown"
OUTPUT_JSON = ROOT / "output" / "json"
LOG_DIR = ROOT / "logs"

for d in [CACHE_DIR, OUTPUT_HTML, OUTPUT_MD, OUTPUT_JSON, LOG_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Warn if .env has loose permissions
_env_path = ROOT / ".env"
if _env_path.exists():
    _mode = _env_path.stat().st_mode
    if _mode & (stat.S_IRGRP | stat.S_IROTH):
        print(f"  [WARN] .env is readable by group/others. Run: chmod 600 {_env_path}")

# ---------------------------------------------------------------------------
# Feed Configuration
# ---------------------------------------------------------------------------
BLOCK_ORDER = [
    "Strategic Leadership & OD",
    "AI & Technology",
    "Federal Consulting & Market",
    "Consulting Industry",
]

BLOCK_CONFIG = {
    "Strategic Leadership & OD": {
        "color": "#1F3864",
        "icon": "&#9670;",
        "max_articles": 3,
        "feeds": [
            {"name": "HBR", "url": "https://feeds.hbr.org/harvardbusiness"},
            {"name": "MIT Sloan", "url": "https://sloanreview.mit.edu/feed/"},
            {"name": "McKinsey", "url": "https://www.mckinsey.com/insights/rss"},
            {"name": "TD.org", "url": "https://www.td.org/feeds/atd-blog"},
        ],
    },
    "AI & Technology": {
        "color": "#5B21B6",
        "icon": "&#9671;",
        "max_articles": 3,
        "feeds": [
            {"name": "Anthropic", "url": "https://www.anthropic.com/rss.xml"},
            {"name": "OpenAI Blog", "url": "https://openai.com/blog/rss.xml"},
            {"name": "MIT Tech Review", "url": "https://www.technologyreview.com/feed/"},
            {"name": "The Verge AI", "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"},
        ],
    },
    "Federal Consulting & Market": {
        "color": "#0369A1",
        "icon": "&#9672;",
        "max_articles": 3,
        "feeds": [
            {"name": "Federal News Network", "url": "https://federalnewsnetwork.com/feed/"},
            {"name": "GovExec", "url": "https://www.govexec.com/rss/all/"},
            {"name": "Defense.gov", "url": "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=10&ContentType=1&Site=945"},
            {"name": "NextGov/FCW", "url": "https://www.nextgov.com/rss/all/"},
        ],
    },
    "Consulting Industry": {
        "color": "#1E6B6B",
        "icon": "&#9673;",
        "max_articles": 2,
        "feeds": [
            {"name": "BCG", "url": "https://www.bcg.com/rss.xml"},
            {"name": "Bain", "url": "https://www.bain.com/insights/rss/"},
            {"name": "Gartner", "url": "https://www.gartner.com/en/newsroom/rss"},
            {"name": "Deloitte Insights", "url": "https://www2.deloitte.com/us/en/insights/rss-feeds.html"},
        ],
    },
}

MAX_ARTICLES_PER_FEED = 5
MAX_CACHE_ENTRIES = 10_000
RELEVANCE_THRESHOLD = 6
FEED_TIMEOUT = 15  # seconds per feed
FEED_WORKERS = 8
HAIKU_INPUT_COST_PER_M = 1.00   # $/million input tokens
HAIKU_OUTPUT_COST_PER_M = 5.00  # $/million output tokens

# Pre-compiled regex for stripping HTML tags from feed summaries
STRIP_HTML_RE = re.compile(r"<[^>]+>")

# Regex to extract a JSON array from an API response (with optional markdown fencing)
JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)


# ---------------------------------------------------------------------------
# RSS Fetch & Cache
# ---------------------------------------------------------------------------

def _load_cache() -> set[str]:
    """Load dedup hashes from seen.json, pruning entries older than 7 days."""
    f = CACHE_DIR / "seen.json"
    if f.exists():
        try:
            data = json.loads(f.read_text())
            if isinstance(data, dict):
                cutoff = (datetime.now() - timedelta(days=7)).isoformat()
                return {k for k, v in data.items() if v > cutoff}
            # Legacy format: plain list
            return set(data)
        except Exception:
            pass
    return set()


def _save_cache(seen: set[str]) -> None:
    """Persist dedup hashes with timestamps, capping at MAX_CACHE_ENTRIES."""
    now = datetime.now().isoformat()
    data = {h: now for h in seen}
    # Cap cache size — keep newest entries
    if len(data) > MAX_CACHE_ENTRIES:
        sorted_items = sorted(data.items(), key=lambda x: x[1], reverse=True)
        data = dict(sorted_items[:MAX_CACHE_ENTRIES])
    (CACHE_DIR / "seen.json").write_text(json.dumps(data))


def _fetch_single_feed(feed_info: dict) -> list[dict]:
    """Fetch and parse a single RSS feed. Called by ThreadPoolExecutor."""
    feed = feedparser.parse(feed_info["url"])
    results = []
    for entry in feed.entries[:MAX_ARTICLES_PER_FEED]:
        title = entry.get("title", "").strip()
        link = entry.get("link", "")
        summary = entry.get("summary", entry.get("description", ""))
        if summary:
            summary = STRIP_HTML_RE.sub("", summary).strip()[:800]
        results.append({
            "title": title,
            "link": link,
            "summary": summary,
            "source": feed_info["name"],
            "category": feed_info["_category"],
        })
    return results


def fetch_feeds() -> dict[str, list[dict]]:
    """Fetch RSS feeds in parallel, deduplicate against 7-day cache."""
    seen = _load_cache()
    all_articles: dict[str, list[dict]] = {cat: [] for cat in BLOCK_ORDER}

    # Build flat list of all feed jobs with category tag
    feed_jobs = []
    for category in BLOCK_ORDER:
        for feed_info in BLOCK_CONFIG[category]["feeds"]:
            feed_jobs.append({**feed_info, "_category": category})

    # Parallel fetch
    with ThreadPoolExecutor(max_workers=FEED_WORKERS) as pool:
        futures = {
            pool.submit(_fetch_single_feed, fj): fj
            for fj in feed_jobs
        }
        for future in as_completed(futures, timeout=FEED_TIMEOUT * 2):
            fj = futures[future]
            try:
                entries = future.result(timeout=FEED_TIMEOUT)
                for article in entries:
                    h = hashlib.sha256(
                        f"{article['title']}{article['link']}".encode()
                    ).hexdigest()
                    if h in seen:
                        continue
                    seen.add(h)
                    all_articles[article["category"]].append(article)
            except Exception as e:
                print(f"  [WARN] {fj['name']}: {e}")

    for category in BLOCK_ORDER:
        print(f"  [{category}] {len(all_articles[category])} new articles")

    _save_cache(seen)
    return all_articles


# ---------------------------------------------------------------------------
# Single Claude API Call — Analyze All Articles
# ---------------------------------------------------------------------------

def analyze_all(articles_by_category: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Send all articles to Claude in one API call, get scored/analyzed results."""
    all_articles = []
    for category in BLOCK_ORDER:
        all_articles.extend(articles_by_category.get(category, []))

    if not all_articles:
        print("  No articles to analyze.")
        return {cat: [] for cat in BLOCK_ORDER}

    articles_text = "\n".join(
        f"--- Article {i+1} [{a['category']}] ---\n"
        f"Title: {a['title']}\nSource: {a['source']}\n"
        f"Summary: {a['summary'][:500]}"
        for i, a in enumerate(all_articles)
    )

    prompt = (
        f"Analyze these {len(all_articles)} articles for an OD consulting "
        "practice owner focused on strategic leadership, AI-augmented "
        "consulting, Federal/Defense markets, and change management.\n\n"
        "For each article, return a JSON object with:\n"
        '- "index": the article number (1-based)\n'
        '- "relevance_score": 1-10 (relevance to OD consulting, '
        "strategic leadership, AI, Federal market)\n"
        '- "summary": 2-3 sentence strategic analysis\n'
        '- "key_insight": one actionable sentence\n'
        '- "strategic_implication": one sentence on practice impact\n\n'
        f"Return ONLY a JSON array. Skip articles scoring below "
        f"{RELEVANCE_THRESHOLD}.\n\n{articles_text}"
    )

    client = anthropic.Anthropic()
    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()

        # Extract JSON array — handles bare JSON or markdown-fenced responses
        match = JSON_ARRAY_RE.search(raw)
        if not match:
            raise ValueError("No JSON array found in API response")
        parsed = json.loads(match.group())

        # Log cost
        usage = resp.usage
        _log_cost(usage.input_tokens, usage.output_tokens,
                  len(all_articles), len(parsed))
        print(f"  API: {usage.input_tokens} in / {usage.output_tokens} out tokens")

        # Map results back to categories
        analyzed: dict[str, list[dict]] = {cat: [] for cat in BLOCK_ORDER}
        for item in parsed:
            idx = item.get("index", 0) - 1
            if 0 <= idx < len(all_articles):
                source_article = all_articles[idx]
                item["title"] = source_article["title"]
                item["link"] = source_article["link"]
                item["source"] = source_article["source"]
                cat = source_article["category"]
                if len(analyzed[cat]) < BLOCK_CONFIG[cat]["max_articles"]:
                    analyzed[cat].append(item)

        for cat in BLOCK_ORDER:
            analyzed[cat].sort(
                key=lambda x: x.get("relevance_score", 0), reverse=True
            )
            print(f"  [{cat}] {len(analyzed[cat])} articles passed threshold")

        return analyzed

    except json.JSONDecodeError as e:
        print(f"  [ERROR] JSON parse failed: {e}")
        return {cat: [] for cat in BLOCK_ORDER}
    except Exception as e:
        print(f"  [ERROR] API call failed: {e}")
        return {cat: [] for cat in BLOCK_ORDER}


# ---------------------------------------------------------------------------
# Cost Logging
# ---------------------------------------------------------------------------

def _log_cost(input_tokens: int, output_tokens: int,
              articles_sent: int, articles_passed: int) -> None:
    """Append token usage and estimated cost to the CSV log."""
    log_file = LOG_DIR / "cost_log.csv"
    write_header = not log_file.exists()

    cost = (input_tokens / 1_000_000 * HAIKU_INPUT_COST_PER_M
            + output_tokens / 1_000_000 * HAIKU_OUTPUT_COST_PER_M)

    with open(log_file, "a", newline="") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow([
                "date", "input_tokens", "output_tokens",
                "estimated_cost_usd", "articles_sent", "articles_passed",
            ])
        writer.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            input_tokens, output_tokens,
            f"{cost:.4f}",
            articles_sent, articles_passed,
        ])


# ---------------------------------------------------------------------------
# Output: HTML
# ---------------------------------------------------------------------------

def generate_html(analyzed: dict[str, list[dict]], now: datetime) -> str:
    """Build the full HTML email digest from analyzed articles."""
    date_str = now.strftime("%A, %B %d, %Y")
    day_num = now.timetuple().tm_yday

    blocks: list[str] = []
    total_articles = 0

    for category in BLOCK_ORDER:
        articles = analyzed.get(category, [])
        cfg = BLOCK_CONFIG[category]

        if not articles:
            articles_html = (
                '<tr><td style="padding:12px 16px;color:#888;'
                'font-size:14px;font-style:italic;">'
                "No items for this category today."
                "</td></tr>"
            )
        else:
            rows: list[str] = []
            for a in articles:
                total_articles += 1
                score = a.get("relevance_score", "")
                color = cfg["color"]

                score_badge = (
                    f'<span style="display:inline-block;background:{color};'
                    f'color:#fff;font-size:11px;font-weight:700;padding:2px 6px;'
                    f'border-radius:3px;margin-right:6px;">'
                    f'{html_escape(str(score))}/10</span>'
                    if score else ""
                )

                title = html_escape(a.get("title", ""))
                link = html_escape(a.get("link", ""))
                title_html = (
                    f'<a href="{link}" style="color:{color};'
                    f'text-decoration:none;font-weight:600;font-size:15px;'
                    f'line-height:1.4;">{title}</a>'
                    if link else
                    f'<span style="font-weight:600;font-size:15px;'
                    f'color:#333;">{title}</span>'
                )

                source = html_escape(a.get("source", ""))
                source_html = (
                    f'<span style="font-size:12px;color:#888;'
                    f'margin-left:4px;">&mdash; {source}</span>'
                    if source else ""
                )

                summary = html_escape(a.get("summary", ""))
                insight = html_escape(a.get("key_insight", ""))
                implication = html_escape(a.get("strategic_implication", ""))

                insight_html = (
                    f'<div style="font-size:13px;color:{color};'
                    f'font-weight:600;margin-top:6px;padding-top:6px;'
                    f'border-top:1px solid #eee;">'
                    f'&#8594; {insight}</div>'
                    if insight else ""
                )

                implication_html = (
                    f'<div style="font-size:12px;color:#666;'
                    f'margin-top:4px;font-style:italic;">'
                    f'{implication}</div>'
                    if implication else ""
                )

                rows.append(
                    f'<tr><td style="padding:12px 16px;'
                    f'border-bottom:1px solid #f0f0f0;">'
                    f'<div>{score_badge}{title_html}{source_html}</div>'
                    f'<div style="font-size:13px;color:#444;'
                    f'line-height:1.6;margin-top:6px;">{summary}</div>'
                    f'{insight_html}{implication_html}'
                    f'</td></tr>'
                )
            articles_html = "\n".join(rows)

        blocks.append(
            f'<table width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin-bottom:16px;border-radius:8px;overflow:hidden;'
            f'border:1px solid #e0e0e0;">'
            f'<tr><td style="background:{cfg["color"]};padding:10px 16px;">'
            f'<span style="color:#fff;font-size:12px;font-weight:700;'
            f'letter-spacing:1px;text-transform:uppercase;">'
            f'{cfg["icon"]} {category}</span>'
            f'</td></tr>{articles_html}</table>'
        )

    blocks_html = "\n".join(blocks)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Morning Digest &mdash; {date_str}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="background:linear-gradient(135deg,#1F3864 0%,#2A4A7F 100%);padding:24px 20px;text-align:center;">
    <div style="font-size:16px;font-weight:600;color:#fff;letter-spacing:1px;">MORNING DIGEST</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:4px;">{date_str}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">
        RSS + AI Analysis &middot; Day {day_num} &middot; {total_articles} items
    </div>
</td></tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
<tr><td>
{blocks_html}
</td></tr>
</table>
</td></tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="text-align:center;padding:16px;font-size:11px;color:#888;">
    Dr. Kurtis Hatcher &middot; Hatching Solutions &middot; Morning Digest v{__version__}<br>
    Generated {now.strftime("%Y-%m-%d %H:%M")} &middot; Powered by Claude Haiku
</td></tr>
</table>

</body>
</html>"""
    return html


# ---------------------------------------------------------------------------
# Output: Markdown
# ---------------------------------------------------------------------------

def generate_markdown(analyzed: dict[str, list[dict]], now: datetime) -> str:
    """Build Markdown digest from analyzed articles."""
    date_str = now.strftime("%A, %B %d, %Y")
    lines = [f"# Morning Digest — {date_str}\n"]

    for category in BLOCK_ORDER:
        articles = analyzed.get(category, [])
        lines.append(f"\n## {category}\n")

        if not articles:
            lines.append("_No items for this category today._\n")
            continue

        for a in articles:
            score = a.get("relevance_score", "")
            title = a.get("title", "")
            link = a.get("link", "")
            source = a.get("source", "")
            summary = a.get("summary", "")
            insight = a.get("key_insight", "")
            implication = a.get("strategic_implication", "")

            title_md = f"[{title}]({link})" if link else title
            lines.append(f"### {title_md}")
            lines.append(f"**{source}** | Score: {score}/10\n")
            lines.append(f"{summary}\n")
            if insight:
                lines.append(f"**Key Insight:** {insight}\n")
            if implication:
                lines.append(f"_Strategic Implication: {implication}_\n")

    lines.append(
        f"\n---\n_Generated {now.strftime('%Y-%m-%d %H:%M')} "
        f"| Morning Digest v{__version__} | Powered by Claude Haiku_\n"
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Output: JSON
# ---------------------------------------------------------------------------

def generate_json(analyzed: dict[str, list[dict]], now: datetime) -> str:
    """Export analyzed articles as JSON with metadata."""
    export = {
        "version": __version__,
        "date": now.strftime("%Y-%m-%d"),
        "generated_at": now.isoformat(),
        "categories": {},
    }
    for category in BLOCK_ORDER:
        export["categories"][category] = analyzed.get(category, [])
    return json.dumps(export, indent=2)


# ---------------------------------------------------------------------------
# Email Delivery
# ---------------------------------------------------------------------------

def send_email(html: str) -> bool:
    """Send the HTML digest via SMTP. Returns True on success."""
    recipient = os.environ.get("DIGEST_EMAIL", "")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        print("\n  [SKIP] Email not sent — SMTP credentials not configured.")
        print("  Set SMTP_USER and SMTP_PASS in .env file.")
        return False

    if not recipient:
        print("\n  [SKIP] Email not sent — DIGEST_EMAIL not set.")
        return False

    today_str = datetime.now().strftime("%A, %b %d")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Morning Digest — {today_str}"
    msg["From"] = smtp_user
    msg["To"] = recipient

    plain = (
        f"Morning Digest — {today_str}\n\n"
        "Your intelligence brief is ready. Open the HTML version "
        "for the full digest."
    )
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, recipient, msg.as_string())
        print(f"\n  [OK] Digest sent to {recipient}")
        return True
    except Exception as e:
        print(f"\n  [ERROR] Email failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    preview = "--preview" in sys.argv
    now = datetime.now()
    datestamp = now.strftime("%Y%m%d")

    print(f"\n{'='*55}")
    print(f"  MORNING DIGEST v{__version__} — {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*55}\n")

    # 1. Fetch (parallel)
    print("[1/4] Fetching RSS feeds...")
    articles = fetch_feeds()
    total = sum(len(v) for v in articles.values())
    print(f"  Total: {total} new articles\n")

    if total == 0:
        print("  No new articles found. Exiting.")
        return

    # 2. Analyze (single API call)
    print("[2/4] Analyzing with Claude API (single call)...")
    analyzed = analyze_all(articles)

    # 3. Generate all formats (pass single datetime for consistency)
    print("\n[3/4] Generating outputs...")
    html = generate_html(analyzed, now)
    md = generate_markdown(analyzed, now)
    js = generate_json(analyzed, now)

    (OUTPUT_HTML / f"digest_{datestamp}.html").write_text(html)
    (OUTPUT_HTML / "latest.html").write_text(html)
    (OUTPUT_MD / f"digest_{datestamp}.md").write_text(md)
    (OUTPUT_MD / "latest.md").write_text(md)
    (OUTPUT_JSON / f"digest_{datestamp}.json").write_text(js)
    (OUTPUT_JSON / "latest.json").write_text(js)
    print(f"  HTML:     output/html/digest_{datestamp}.html")
    print(f"  Markdown: output/markdown/digest_{datestamp}.md")
    print(f"  JSON:     output/json/digest_{datestamp}.json")

    if preview:
        print("\n[PREVIEW] Done. Email skipped.")
        return

    # 4. Send email
    print("\n[4/4] Sending email...")
    send_email(html)

    print(f"\n{'='*55}")
    print("  COMPLETE")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
