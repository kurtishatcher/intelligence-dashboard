#!/usr/bin/env python3
"""
Morning Digest — Automated Intelligence Brief
Fetches premier analyst RSS feeds → single Claude API call → multi-format output.

Usage:
    python morning_digest.py                  # Generate + send email
    python morning_digest.py --preview        # Generate files only, no email

Environment variables (or .env file):
    ANTHROPIC_API_KEY   — Required. Claude API key.
    DIGEST_EMAIL        — Recipient (default: kurtishatcher@hatchingsolutions.com)
    SMTP_HOST           — SMTP server (default: smtp.gmail.com)
    SMTP_PORT           — SMTP port (default: 587)
    SMTP_USER           — SMTP username (Gmail address)
    SMTP_PASS           — SMTP app password
"""

import os
import sys
import json
import re
import csv
import hashlib
import smtplib
import anthropic
import feedparser
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)
except ImportError:
    pass

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
RELEVANCE_THRESHOLD = 6
HAIKU_INPUT_COST_PER_M = 1.00   # $/million input tokens
HAIKU_OUTPUT_COST_PER_M = 5.00  # $/million output tokens


# ---------------------------------------------------------------------------
# RSS Fetch
# ---------------------------------------------------------------------------

def _load_cache() -> set:
    f = CACHE_DIR / "seen.json"
    if f.exists():
        try:
            data = json.loads(f.read_text())
            # Prune entries older than 7 days
            if isinstance(data, dict):
                cutoff = (datetime.now() - timedelta(days=7)).isoformat()
                return {k for k, v in data.items() if v > cutoff}
            # Legacy format: plain list
            return set(data)
        except Exception:
            pass
    return set()


def _save_cache(seen: set):
    now = datetime.now().isoformat()
    data = {h: now for h in seen}
    (CACHE_DIR / "seen.json").write_text(json.dumps(data))


def fetch_feeds() -> dict:
    """Fetch RSS feeds, deduplicate against 7-day cache, return articles by category."""
    seen = _load_cache()
    all_articles = {}

    for category in BLOCK_ORDER:
        cfg = BLOCK_CONFIG[category]
        articles = []
        for feed_info in cfg["feeds"]:
            try:
                feed = feedparser.parse(feed_info["url"])
                for entry in feed.entries[:MAX_ARTICLES_PER_FEED]:
                    title = entry.get("title", "").strip()
                    link = entry.get("link", "")
                    summary = entry.get("summary", entry.get("description", ""))
                    if summary:
                        summary = re.sub(r"<[^>]+>", "", summary).strip()[:800]

                    h = hashlib.md5(f"{title}{link}".encode()).hexdigest()
                    if h in seen:
                        continue
                    seen.add(h)

                    articles.append({
                        "title": title,
                        "link": link,
                        "summary": summary,
                        "source": feed_info["name"],
                        "category": category,
                    })
            except Exception as e:
                print(f"  [WARN] {feed_info['name']}: {e}")
        all_articles[category] = articles
        print(f"  [{category}] {len(articles)} new articles")

    _save_cache(seen)
    return all_articles


# ---------------------------------------------------------------------------
# Single Claude API Call — Analyze All Articles
# ---------------------------------------------------------------------------

def analyze_all(articles_by_category: dict) -> dict:
    """Send all articles to Claude in one API call, get scored/analyzed results."""
    # Flatten articles with category labels
    all_articles = []
    for category in BLOCK_ORDER:
        for a in articles_by_category.get(category, []):
            all_articles.append(a)

    if not all_articles:
        print("  No articles to analyze.")
        return {cat: [] for cat in BLOCK_ORDER}

    # Build article block for prompt
    articles_text = "\n".join(
        f"--- Article {i+1} [{a['category']}] ---\n"
        f"Title: {a['title']}\nSource: {a['source']}\n"
        f"Summary: {a['summary'][:500]}"
        for i, a in enumerate(all_articles)
    )

    prompt = f"""Analyze these {len(all_articles)} articles for an OD consulting practice owner focused on strategic leadership, AI-augmented consulting, Federal/Defense markets, and change management.

For each article, return a JSON object with:
- "index": the article number (1-based)
- "relevance_score": 1-10 (relevance to OD consulting, strategic leadership, AI, Federal market)
- "summary": 2-3 sentence strategic analysis
- "key_insight": one actionable sentence
- "strategic_implication": one sentence on practice impact

Return ONLY a JSON array. Skip articles scoring below {RELEVANCE_THRESHOLD}.

{articles_text}"""

    client = anthropic.Anthropic()
    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)

        # Log cost
        usage = resp.usage
        _log_cost(usage.input_tokens, usage.output_tokens, len(all_articles), len(parsed))
        print(f"  API: {usage.input_tokens} in / {usage.output_tokens} out tokens")

        # Map results back to categories
        analyzed = {cat: [] for cat in BLOCK_ORDER}
        for item in parsed:
            idx = item.get("index", 0) - 1
            if 0 <= idx < len(all_articles):
                source_article = all_articles[idx]
                item["title"] = source_article["title"]
                item["link"] = source_article["link"]
                item["source"] = source_article["source"]
                cat = source_article["category"]
                cfg = BLOCK_CONFIG[cat]
                if len(analyzed[cat]) < cfg["max_articles"]:
                    analyzed[cat].append(item)

        # Sort each category by score descending
        for cat in BLOCK_ORDER:
            analyzed[cat].sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
            print(f"  [{cat}] {len(analyzed[cat])} articles passed threshold")

        return analyzed

    except Exception as e:
        print(f"  [ERROR] API call failed: {e}")
        return {cat: [] for cat in BLOCK_ORDER}


# ---------------------------------------------------------------------------
# Cost Logging
# ---------------------------------------------------------------------------

def _log_cost(input_tokens: int, output_tokens: int, articles_sent: int, articles_passed: int):
    log_file = LOG_DIR / "cost_log.csv"
    write_header = not log_file.exists()

    cost = (input_tokens / 1_000_000 * HAIKU_INPUT_COST_PER_M +
            output_tokens / 1_000_000 * HAIKU_OUTPUT_COST_PER_M)

    with open(log_file, "a", newline="") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(["date", "input_tokens", "output_tokens",
                             "estimated_cost_usd", "articles_sent", "articles_passed"])
        writer.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            input_tokens, output_tokens,
            f"{cost:.4f}",
            articles_sent, articles_passed,
        ])


# ---------------------------------------------------------------------------
# Output: HTML
# ---------------------------------------------------------------------------

def generate_html(analyzed: dict) -> str:
    today = datetime.now()
    date_str = today.strftime("%A, %B %d, %Y")
    day_num = today.timetuple().tm_yday

    blocks_html = ""
    total_articles = 0

    for category in BLOCK_ORDER:
        articles = analyzed.get(category, [])
        cfg = BLOCK_CONFIG[category]

        if not articles:
            articles_html = """
            <tr><td style="padding:12px 16px;color:#888;font-size:14px;font-style:italic;">
                No items for this category today.
            </td></tr>"""
        else:
            articles_html = ""
            for a in articles:
                total_articles += 1
                score = a.get("relevance_score", "")
                color = cfg["color"]

                score_badge = (
                    f'<span style="display:inline-block;background:{color};color:#fff;'
                    f'font-size:11px;font-weight:700;padding:2px 6px;border-radius:3px;'
                    f'margin-right:6px;">{score}/10</span>'
                    if score else ""
                )

                title = a.get("title", "")
                link = a.get("link", "")
                title_html = (
                    f'<a href="{link}" style="color:{color};text-decoration:none;'
                    f'font-weight:600;font-size:15px;line-height:1.4;">{title}</a>'
                    if link else
                    f'<span style="font-weight:600;font-size:15px;color:#333;">{title}</span>'
                )

                source = a.get("source", "")
                source_html = (
                    f'<span style="font-size:12px;color:#888;margin-left:4px;">'
                    f'&mdash; {source}</span>'
                    if source else ""
                )

                summary = a.get("summary", "")
                insight = a.get("key_insight", "")
                implication = a.get("strategic_implication", "")

                insight_html = (
                    f'<div style="font-size:13px;color:{color};font-weight:600;'
                    f'margin-top:6px;padding-top:6px;border-top:1px solid #eee;">'
                    f'&#8594; {insight}</div>'
                    if insight else ""
                )

                implication_html = (
                    f'<div style="font-size:12px;color:#666;margin-top:4px;'
                    f'font-style:italic;">{implication}</div>'
                    if implication else ""
                )

                articles_html += f"""
                <tr><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
                    <div>{score_badge}{title_html}{source_html}</div>
                    <div style="font-size:13px;color:#444;line-height:1.6;margin-top:6px;">
                        {summary}
                    </div>
                    {insight_html}
                    {implication_html}
                </td></tr>"""

        blocks_html += f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
            <tr><td style="background:{cfg['color']};padding:10px 16px;">
                <span style="color:#fff;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
                    {cfg['icon']} {category}
                </span>
            </td></tr>
            {articles_html}
        </table>"""

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
    Dr. Kurtis Hatcher &middot; Hatching Solutions &middot; Morning Digest v3.0<br>
    Generated {today.strftime("%Y-%m-%d %H:%M")} &middot; Powered by Claude Haiku
</td></tr>
</table>

</body>
</html>"""
    return html


# ---------------------------------------------------------------------------
# Output: Markdown
# ---------------------------------------------------------------------------

def generate_markdown(analyzed: dict) -> str:
    today = datetime.now()
    date_str = today.strftime("%A, %B %d, %Y")
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

    lines.append(f"\n---\n_Generated {today.strftime('%Y-%m-%d %H:%M')} | Powered by Claude Haiku_\n")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Output: JSON
# ---------------------------------------------------------------------------

def generate_json(analyzed: dict) -> str:
    today = datetime.now()
    export = {
        "date": today.strftime("%Y-%m-%d"),
        "generated_at": today.isoformat(),
        "categories": {}
    }
    for category in BLOCK_ORDER:
        export["categories"][category] = analyzed.get(category, [])
    return json.dumps(export, indent=2)


# ---------------------------------------------------------------------------
# Email Delivery
# ---------------------------------------------------------------------------

def send_email(html: str):
    recipient = os.environ.get("DIGEST_EMAIL", "kurtishatcher@hatchingsolutions.com")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        print("\n  [SKIP] Email not sent — SMTP credentials not configured.")
        print("  Set SMTP_USER and SMTP_PASS in .env file.")
        return False

    today_str = datetime.now().strftime("%A, %b %d")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Morning Digest — {today_str}"
    msg["From"] = smtp_user
    msg["To"] = recipient

    plain = (
        f"Morning Digest — {today_str}\n\n"
        "Your intelligence brief is ready. Open the HTML version for the full digest."
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

def main():
    preview = "--preview" in sys.argv
    datestamp = datetime.now().strftime("%Y%m%d")

    print(f"\n{'='*55}")
    print(f"  MORNING DIGEST — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*55}\n")

    # 1. Fetch
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

    # 3. Generate all formats
    print("\n[3/4] Generating outputs...")
    html = generate_html(analyzed)
    md = generate_markdown(analyzed)
    js = generate_json(analyzed)

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
    print(f"  COMPLETE")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
