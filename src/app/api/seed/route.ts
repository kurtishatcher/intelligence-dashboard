import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { mockCompetitors } from '@/lib/mock/competitors';
import { mockIntel } from '@/lib/mock/intel';
import { mockOpportunities } from '@/lib/mock/opportunities';
import { mockAwards } from '@/lib/mock/awards';
import { mockBrief } from '@/lib/mock/brief';

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Clear existing data
    await supabase.from('competitor_intel').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('job_postings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('competitors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('federal_opportunities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('contract_awards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('intelligence_briefs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Seed competitors
    const { data: competitors, error: compError } = await supabase
      .from('competitors')
      .insert(mockCompetitors)
      .select();

    if (compError) throw compError;

    // Build name-to-id map
    const nameToId: Record<string, string> = {};
    for (const c of competitors!) {
      nameToId[c.name] = c.id;
    }

    // Seed competitor intel
    const intelRows = mockIntel.map(({ competitor_name, ...rest }) => ({
      ...rest,
      competitor_id: nameToId[competitor_name],
    }));
    const { error: intelError } = await supabase.from('competitor_intel').insert(intelRows);
    if (intelError) throw intelError;

    // Seed federal opportunities
    const { error: oppError } = await supabase.from('federal_opportunities').insert(mockOpportunities);
    if (oppError) throw oppError;

    // Seed contract awards
    const { error: awardError } = await supabase.from('contract_awards').insert(mockAwards);
    if (awardError) throw awardError;

    // Seed intelligence brief
    const { error: briefError } = await supabase.from('intelligence_briefs').insert({
      brief_date: mockBrief.brief_date,
      content: mockBrief.content,
      highlights: mockBrief.highlights,
      competitor_mentions: mockBrief.competitor_mentions,
      federal_highlights: mockBrief.federal_highlights,
      generated_by: mockBrief.generated_by,
    });
    if (briefError) throw briefError;

    return NextResponse.json({
      success: true,
      seeded: {
        competitors: competitors!.length,
        intel: intelRows.length,
        opportunities: mockOpportunities.length,
        awards: mockAwards.length,
        briefs: 1,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
