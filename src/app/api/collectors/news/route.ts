import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyItems, type ClassificationInput } from '@/lib/skills/competitor-classification';

// RSS feeds for competitors with available feeds
const COMPETITOR_FEEDS: Record<string, string[]> = {
  'Deloitte': ['https://www2.deloitte.com/us/en/insights/rss-feeds.html'],
  'McKinsey & Company': ['https://www.mckinsey.com/insights/rss'],
  'BCG': ['https://www.bcg.com/rss.xml'],
};

// All competitors for name→id resolution
const ALL_COMPETITORS = [
  'Deloitte', 'McKinsey & Company', 'PwC', 'EY', 'Accenture', 'KPMG', 'BCG',
];

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  competitor: string;
}

function parseRSSItems(xml: string, competitor: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
    const link = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || '';
    const desc = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

    if (title && link) {
      items.push({
        title: title.replace(/<[^>]*>/g, '').trim(),
        link: link.trim(),
        description: desc.replace(/<[^>]*>/g, '').trim().slice(0, 500),
        pubDate,
        competitor,
      });
    }
  }

  // Also try Atom format
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];
      const title = entryXml.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
      const link = entryXml.match(/<link[^>]*href="([^"]*)"[^>]*\/>/)?.[1] || entryXml.match(/<link>([^<]*)<\/link>/)?.[1] || '';
      const summary = entryXml.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/)?.[1] || '';
      const updated = entryXml.match(/<updated>(.*?)<\/updated>/)?.[1] || entryXml.match(/<published>(.*?)<\/published>/)?.[1] || '';

      if (title && link) {
        items.push({
          title: title.replace(/<[^>]*>/g, '').trim(),
          link: link.trim(),
          description: summary.replace(/<[^>]*>/g, '').trim().slice(0, 500),
          pubDate: updated,
          competitor,
        });
      }
    }
  }

  return items;
}

export async function GET() {
  return NextResponse.json({
    collector: 'news-rss',
    status: 'active',
    competitors_with_feeds: Object.keys(COMPETITOR_FEEDS),
    total_competitors: ALL_COMPETITORS.length,
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Resolve competitor name → id
  const { data: competitors } = await supabase.from('competitors').select('id, name');
  const competitorMap = new Map<string, string>();
  (competitors || []).forEach(c => competitorMap.set(c.name, c.id));

  // Fetch RSS feeds in parallel
  const allItems: RSSItem[] = [];
  const fetchErrors: string[] = [];

  await Promise.allSettled(
    Object.entries(COMPETITOR_FEEDS).flatMap(([competitor, feeds]) =>
      feeds.map(async (feedUrl) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(feedUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) {
            fetchErrors.push(`${competitor}: HTTP ${res.status}`);
            return;
          }
          const xml = await res.text();
          const items = parseRSSItems(xml, competitor);
          allItems.push(...items);
        } catch (err) {
          fetchErrors.push(`${competitor}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    )
  );

  if (allItems.length === 0) {
    return NextResponse.json({
      collector: 'news-rss',
      status: 'completed',
      fetched: 0,
      classified: 0,
      inserted: 0,
      errors: fetchErrors,
    });
  }

  // Filter to last 14 days
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const recentItems = allItems.filter(item => {
    if (!item.pubDate) return true; // include if no date
    try {
      return new Date(item.pubDate) >= twoWeeksAgo;
    } catch {
      return true;
    }
  });

  // Dedup against existing source_urls
  const { data: existingIntel } = await supabase
    .from('competitor_intel')
    .select('source_url')
    .not('source_url', 'is', null);
  const existingUrls = new Set((existingIntel || []).map(i => i.source_url));
  const newItems = recentItems.filter(item => !existingUrls.has(item.link));

  if (newItems.length === 0) {
    return NextResponse.json({
      collector: 'news-rss',
      status: 'completed',
      fetched: allItems.length,
      recent: recentItems.length,
      classified: 0,
      inserted: 0,
      message: 'No new items after deduplication',
      errors: fetchErrors,
    });
  }

  // Classify with competitor-classification skill (batches of 10, Haiku 4.5)
  const classificationInput: ClassificationInput[] = newItems.slice(0, 30).map((item) => ({
    title: item.title,
    description: item.description,
    source: item.competitor,
    url: item.link,
    publishedAt: item.pubDate || new Date().toISOString(),
    contentType: 'news_article' as const,
  }));

  const classified = await classifyItems(classificationInput);

  // Insert classified items (including irrelevant for audit trail)
  let inserted = 0;
  for (let i = 0; i < classified.length; i++) {
    const result = classified[i];
    const source = newItems[i];
    if (!source) continue;

    // Try to resolve competitor from classification result, fall back to RSS source
    const competitorId = competitorMap.get(result.competitor) || competitorMap.get(source.competitor);
    if (!competitorId) continue;

    const { error } = await supabase.from('competitor_intel').insert({
      competitor_id: competitorId,
      type: result.intelType,
      title: source.title,
      summary: result.summary,
      source_url: source.link,
      significance: result.significance,
      published_at: source.pubDate ? new Date(source.pubDate).toISOString() : new Date().toISOString(),
    });

    if (!error) inserted++;
  }

  return NextResponse.json({
    collector: 'news-rss',
    status: 'completed',
    fetched: allItems.length,
    recent: recentItems.length,
    new_after_dedup: newItems.length,
    classified: classified.length,
    inserted,
    errors: fetchErrors,
  });
}
