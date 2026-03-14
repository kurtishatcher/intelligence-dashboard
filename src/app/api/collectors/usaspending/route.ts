import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// USAspending.gov API Collector
// Endpoint: https://api.usaspending.gov/api/v2/search/spending_by_award/
// Docs: https://api.usaspending.gov/
// No API key required — public API

const USASPENDING_API_BASE = 'https://api.usaspending.gov/api/v2';

const RELEVANT_NAICS = ['541611', '541612', '541618', '611430', '611710'];

interface UsaSpendingSearchParams {
  naics?: string[];
  dateRange?: { start: string; end: string };
  limit?: number;
  page?: number;
}

interface UsaSpendingAward {
  'Award ID': string | null;
  'Award Amount': number | null;
  'Total Outlays': number | null;
  'Description': string | null;
  'Start Date': string | null;
  'End Date': string | null;
  'Awarding Agency': string | null;
  'Awarding Sub Agency': string | null;
  'Recipient Name': string | null;
  'recipient_id': string | null;
  'NAICS Code': string | null;
  'NAICS Description': string | null;
  'Award Type': string | null;
  'internal_id': number | null;
  'generated_internal_id': string | null;
}

async function fetchFromUsaSpending(params: UsaSpendingSearchParams) {
  // Default date range: last 12 months
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const dateRange = params.dateRange || {
    start: oneYearAgo.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  };

  const requestBody = {
    filters: {
      naics_codes: params.naics || RELEVANT_NAICS,
      time_period: [{ start_date: dateRange.start, end_date: dateRange.end }],
      award_type_codes: ['A', 'B', 'C', 'D'], // Contracts (BPA, PO, Delivery Order, Definitive)
    },
    fields: [
      'Award ID',
      'Award Amount',
      'Total Outlays',
      'Description',
      'Start Date',
      'End Date',
      'Awarding Agency',
      'Awarding Sub Agency',
      'Recipient Name',
      'recipient_id',
      'NAICS Code',
      'NAICS Description',
      'Award Type',
      'internal_id',
      'generated_internal_id',
    ],
    limit: params.limit || 50,
    page: params.page || 1,
    order: 'desc',
    sort: 'Award Amount',
    subawards: false,
  };

  const response = await fetch(`${USASPENDING_API_BASE}/search/spending_by_award/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `USAspending API error (${response.status}): ${errorText.slice(0, 500)}`,
    };
  }

  const data = await response.json();
  return { success: true, data };
}

function estimateDurationMonths(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
}

function mapToDbRecord(award: UsaSpendingAward) {
  const awardId = award['Award ID'] || award['generated_internal_id'] || null;

  return {
    award_id: awardId,
    title: award['Description']?.slice(0, 500) || `Award ${awardId || 'Unknown'}`,
    agency: award['Awarding Agency'] || null,
    winner: award['Recipient Name'] || null,
    winner_duns: null, // USAspending v2 doesn't return DUNS directly
    value: award['Award Amount'] || null,
    duration_months: estimateDurationMonths(award['Start Date'], award['End Date']),
    naics_code: award['NAICS Code']?.toString() || null,
    naics_description: award['NAICS Description'] || null,
    award_date: award['Start Date'] || null,
    description: award['Description'] || null,
    source_url: awardId
      ? `https://www.usaspending.gov/award/${award['generated_internal_id'] || awardId}`
      : null,
  };
}

export async function POST() {
  try {
    const result = await fetchFromUsaSpending({
      naics: RELEVANT_NAICS,
      limit: 25,
    });

    if (!result.success) {
      return NextResponse.json({ collector: 'usaspending', ...result }, { status: 400 });
    }

    const awards: UsaSpendingAward[] = result.data?.results || [];
    const totalCount = result.data?.page_metadata?.total || 0;

    if (awards.length === 0) {
      return NextResponse.json({
        collector: 'usaspending',
        status: 'success',
        message: 'No contract awards found matching NAICS filters.',
        fetched: 0,
        upserted: 0,
        total_available: totalCount,
      });
    }

    // Map to DB schema, filter out records without an award_id
    const records = awards
      .map(mapToDbRecord)
      .filter((r) => r.award_id !== null);

    // Upsert to Supabase (skip duplicates by award_id)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('contract_awards')
      .upsert(records, { onConflict: 'award_id', ignoreDuplicates: false })
      .select('id');

    if (error) {
      return NextResponse.json(
        { collector: 'usaspending', status: 'error', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      collector: 'usaspending',
      status: 'success',
      fetched: awards.length,
      upserted: data?.length || 0,
      total_available: totalCount,
      naics_codes: RELEVANT_NAICS,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { collector: 'usaspending', status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    collector: 'usaspending',
    status: 'ready',
    description: 'USAspending.gov contract awards collector',
    required_env: [],
    note: 'Public API — no key required. Always active.',
    naics_codes: RELEVANT_NAICS,
  });
}
