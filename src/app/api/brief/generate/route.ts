import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBrief } from '@/lib/skills/brief-generation';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron-triggered — proceed
  } else {
    // Manual trigger — middleware handles auth
  }

  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Gather data for brief generation
    const [
      { data: opportunities },
      { data: awards },
      { data: intel },
    ] = await Promise.all([
      supabase
        .from('federal_opportunities')
        .select('title, agency, naics_code, estimated_value, response_deadline, set_aside, fit_score, pursuit_recommendation, source_url')
        .gte('fit_score', 40)
        .order('fit_score', { ascending: false })
        .limit(50),
      supabase
        .from('contract_awards')
        .select('title, agency, winner, value, naics_code, award_date')
        .order('award_date', { ascending: false })
        .limit(15),
      supabase
        .from('competitor_intel')
        .select('title, summary, type, significance, competitors(name)')
        .in('significance', ['high', 'medium'])
        .order('published_at', { ascending: false })
        .limit(20),
    ]);

    const competitorIntel = (intel || []).map((i) => ({
      title: i.title,
      summary: i.summary,
      type: i.type,
      significance: i.significance,
      competitor_name: (i.competitors as unknown as { name: string } | null)?.name ?? null,
    }));

    const result = await generateBrief({
      opportunities: opportunities || [],
      awards: awards || [],
      competitorIntel,
      briefDate: today,
    });

    if (result.status === 'error') {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (result.status === 'insufficient_data') {
      return NextResponse.json({
        status: 'insufficient_data',
        message: result.error,
        counts: {
          opportunities: result.opportunityCount,
          awards: result.awardCount,
          competitorIntel: result.competitorItemCount,
        },
      });
    }

    // Upsert brief (one per day)
    const { error: upsertError } = await supabase
      .from('intelligence_briefs')
      .upsert({
        brief_date: today,
        content: result.brief,
        highlights: result.highlights,
        themes: result.themes,
        federal_highlights: {
          opportunity_count: result.opportunityCount,
          award_count: result.awardCount,
          competitor_item_count: result.competitorItemCount,
        },
        generated_by: 'claude-sonnet-4-6',
      }, { onConflict: 'brief_date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      status: 'generated',
      brief_date: today,
      highlights: result.highlights?.length ?? 0,
      themes: result.themes,
      counts: {
        opportunities: result.opportunityCount,
        awards: result.awardCount,
        competitorIntel: result.competitorItemCount,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
