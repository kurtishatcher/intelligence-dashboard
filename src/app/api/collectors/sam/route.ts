import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { calculateFitScore } from '@/lib/skills/fit-scoring';

// SAM.gov API Collector
// Endpoint: https://api.sam.gov/opportunities/v2/search
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
// Required: SAM.gov API key (free, register at sam.gov)

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';

// NAICS codes relevant to OD/Leadership/Change Management
const RELEVANT_NAICS = ['541611', '541612', '541618', '611430', '611710'];

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
  } else if (params.naics && params.naics.length > 1) {
    return { success: false, error: 'SAM.gov API requires one NAICS code per request. Pass a single code.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error && err.name === 'AbortError' ? 'Request timed out (8s)' : String(err);
    return { success: false, error: `SAM.gov fetch failed: ${message}` };
  }
  clearTimeout(timeout);

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
  const { fitScore, scoreBreakdown, pursuitRecommendation, flags } = calculateFitScore({
    naicsCode: opp.naicsCode || '',
    setAside: opp.typeOfSetAsideDescription || opp.typeOfSetAside || null,
    title: opp.title || '',
    description: opp.description || '',
    awardAmount: opp.award?.amount || null,
    responseDeadline: opp.responseDeadLine || '',
    agency: opp.department || '',
    type: opp.type || 'solicitation',
  });

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
    fit_score: fitScore,
    pursuit_recommendation: pursuitRecommendation,
    score_breakdown: scoreBreakdown,
    flags,
    status: 'new' as const,
    source_url: opp.uiLink || null,
    posted_at: opp.postedDate || null,
  };
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // SAM.gov doesn't support comma-separated NAICS — query each code in parallel
    const results = await Promise.allSettled(
      RELEVANT_NAICS.map((code) => fetchFromSamGov({ naics: [code], limit: 25 }))
    );

    const allOpportunities: SamOpportunity[] = [];
    const errors: string[] = [];

    results.forEach((result, i) => {
      const code = RELEVANT_NAICS[i];
      if (result.status === 'rejected') {
        errors.push(`${code}: ${String(result.reason)}`);
        return;
      }
      if (!result.value.success) {
        errors.push(`${code}: ${result.value.error}`);
        return;
      }
      const opps: SamOpportunity[] = result.value.data?.opportunitiesData || [];
      allOpportunities.push(...opps);
    });

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
