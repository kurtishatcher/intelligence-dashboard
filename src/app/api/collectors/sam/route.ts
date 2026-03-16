import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// SAM.gov API Collector
// Endpoint: https://api.sam.gov/opportunities/v2/search
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
// Required: SAM.gov API key (free, register at sam.gov)

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';

// NAICS codes relevant to OD/Leadership/Change Management
const RELEVANT_NAICS = ['541611', '541612', '541618', '611430', '611710'];

// Set-aside codes that benefit veteran-owned/small businesses
const FAVORABLE_SET_ASIDES = ['SBA', 'SBP', 'SDVOSBC', 'SDVOSBS', 'VSA', 'VSB', '8A', '8AN', 'HZC', 'HZS'];

interface SamSearchParams {
  naics?: string[];
  postedFrom?: string;
  postedTo?: string;
  limit?: number;
  offset?: number;
}

interface SamOpportunity {
  noticeId: string;
  title: string;
  department: string | null;
  subtierAgency: string | null;
  naicsCode: string | null;
  naicsSolicitationDescription?: string | null;
  classificationCode: string | null;
  award?: { amount?: number } | null;
  responseDeadLine: string | null;
  type: string | null;
  typeOfSetAsideDescription: string | null;
  typeOfSetAside: string | null;
  uiLink: string | null;
  postedDate: string | null;
  description: string | null;
  organizationType: string | null;
  pointOfContact?: Array<{ fullName?: string; email?: string }>;
}

function calculateFitScore(opp: SamOpportunity): number {
  let score = 50; // Base score

  // NAICS alignment (+20 for primary OD codes, +10 for adjacent)
  if (opp.naicsCode) {
    if (['541611', '541612'].includes(opp.naicsCode)) {
      score += 20; // Core management/HR consulting
    } else if (['541618', '611430', '611710'].includes(opp.naicsCode)) {
      score += 10; // Adjacent consulting/training
    }
  }

  // Set-aside bonus (+15 for SDVOSB/veteran, +10 for small business)
  if (opp.typeOfSetAside) {
    if (['SDVOSBC', 'SDVOSBS', 'VSA', 'VSB'].includes(opp.typeOfSetAside)) {
      score += 15; // Veteran-owned preference
    } else if (FAVORABLE_SET_ASIDES.includes(opp.typeOfSetAside)) {
      score += 10; // Other small business set-asides
    }
  }

  // Title keyword relevance (+5 each, max +15)
  const title = (opp.title || '').toLowerCase();
  const description = (opp.description || '').toLowerCase();
  const combined = title + ' ' + description;
  const keywords = ['organizational development', 'change management', 'leadership', 'training', 'facilitation', 'strategic planning', 'workforce', 'human capital', 'organizational effectiveness', 'knowledge management'];
  let keywordBonus = 0;
  for (const kw of keywords) {
    if (combined.includes(kw)) {
      keywordBonus += 5;
      if (keywordBonus >= 15) break;
    }
  }
  score += keywordBonus;

  return Math.min(score, 100);
}

async function fetchFromSamGov(params: SamSearchParams) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'SAM_GOV_API_KEY not configured. Register for a free key at sam.gov.',
    };
  }

  const url = new URL(SAM_API_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('limit', String(params.limit || 25));
  url.searchParams.set('offset', String(params.offset || 0));
  url.searchParams.set('ptype', 'o,p,k'); // Opportunities, presolicitations, combined synopsis/solicitation

  // Date range — default to last 90 days (SAM.gov requires both postedFrom and postedTo in MM/dd/yyyy format)
  const formatSamDate = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

  if (params.postedFrom) {
    url.searchParams.set('postedFrom', params.postedFrom);
  } else {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    url.searchParams.set('postedFrom', formatSamDate(ninetyDaysAgo));
  }
  if (params.postedTo) {
    url.searchParams.set('postedTo', params.postedTo);
  } else {
    url.searchParams.set('postedTo', formatSamDate(new Date()));
  }

  // NAICS filter — single code per request (SAM.gov doesn't support comma-separated)
  if (params.naics && params.naics.length === 1) {
    url.searchParams.set('ncode', params.naics[0]);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `SAM.gov API error (${response.status}): ${errorText.slice(0, 500)}`,
    };
  }

  const data = await response.json();
  return { success: true, data };
}

function mapToDbRecord(opp: SamOpportunity) {
  return {
    notice_id: opp.noticeId,
    title: opp.title || 'Untitled',
    agency: opp.department || null,
    sub_agency: opp.subtierAgency || null,
    naics_code: opp.naicsCode || null,
    naics_description: opp.naicsSolicitationDescription || null,
    estimated_value: opp.award?.amount || null,
    response_deadline: opp.responseDeadLine || null,
    set_aside: opp.typeOfSetAsideDescription || null,
    type: opp.type || null,
    fit_score: calculateFitScore(opp),
    status: 'new' as const,
    source_url: opp.uiLink || null,
    posted_at: opp.postedDate || null,
  };
}

export async function POST() {
  try {
    // SAM.gov doesn't support comma-separated NAICS — query each code individually
    const allOpportunities: SamOpportunity[] = [];
    const errors: string[] = [];

    for (const code of RELEVANT_NAICS) {
      const result = await fetchFromSamGov({ naics: [code], limit: 25 });
      if (!result.success) {
        errors.push(`${code}: ${result.error}`);
        continue;
      }
      const opps: SamOpportunity[] = result.data?.opportunitiesData || [];
      allOpportunities.push(...opps);
    }

    if (allOpportunities.length === 0) {
      return NextResponse.json({
        collector: 'sam-gov',
        status: errors.length > 0 ? 'partial' : 'success',
        message: 'No new opportunities found matching NAICS filters.',
        fetched: 0,
        upserted: 0,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // Deduplicate by noticeId
    const seen = new Set<string>();
    const unique = allOpportunities.filter((o) => {
      if (seen.has(o.noticeId)) return false;
      seen.add(o.noticeId);
      return true;
    });

    // Map to DB schema
    const records = unique.map(mapToDbRecord);

    // Upsert to Supabase (skip duplicates by notice_id)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('federal_opportunities')
      .upsert(records, { onConflict: 'notice_id', ignoreDuplicates: false })
      .select('id');

    if (error) {
      return NextResponse.json(
        { collector: 'sam-gov', status: 'error', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      collector: 'sam-gov',
      status: 'success',
      fetched: unique.length,
      upserted: data?.length || 0,
      naics_codes: RELEVANT_NAICS,
      timestamp: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { collector: 'sam-gov', status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const hasKey = !!process.env.SAM_GOV_API_KEY;
  return NextResponse.json({
    collector: 'sam-gov',
    status: hasKey ? 'ready' : 'inactive',
    description: 'SAM.gov Federal opportunity collector',
    required_env: ['SAM_GOV_API_KEY'],
    configured: hasKey,
    naics_codes: RELEVANT_NAICS,
  });
}
