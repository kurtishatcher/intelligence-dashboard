import { NextResponse } from 'next/server';

// USAspending.gov API Collector
// Status: STRUCTURED — not connected to live API
// Endpoint: https://api.usaspending.gov/api/v2/search/spending_by_award/
// Docs: https://api.usaspending.gov/
// No API key required — public API

const USASPENDING_API_BASE = 'https://api.usaspending.gov/api/v2';

const RELEVANT_NAICS = ['541611', '541612', '541618', '611430', '611710'];

interface UsaSpendingSearchParams {
  naics?: string[];
  dateRange?: { start: string; end: string };
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchFromUsaSpending(_params: UsaSpendingSearchParams) {
  // TODO: Connect to live USAspending API
  // const response = await fetch(`${USASPENDING_API_BASE}/search/spending_by_award/`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     filters: {
  //       naics_codes: params.naics || RELEVANT_NAICS,
  //       time_period: [params.dateRange || { start_date: '2025-01-01', end_date: '2026-12-31' }],
  //       award_type_codes: ['A', 'B', 'C', 'D'], // Contracts
  //     },
  //     fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'NAICS Code', 'Period of Performance Start Date'],
  //     limit: params.limit || 25,
  //     order: 'desc',
  //     sort: 'Award Amount',
  //   }),
  // });
  // return response.json();

  return {
    status: 'mock',
    message: 'USAspending API not connected. No API key required — enable by setting USASPENDING_ENABLED=true in .env.local.',
    endpoint: USASPENDING_API_BASE,
    naics_codes: RELEVANT_NAICS,
  };
}

export async function POST() {
  const result = await fetchFromUsaSpending({
    naics: RELEVANT_NAICS,
    limit: 25,
  });

  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({
    collector: 'usaspending',
    status: 'inactive',
    description: 'USAspending.gov contract awards collector',
    required_env: ['USASPENDING_ENABLED'],
    naics_codes: RELEVANT_NAICS,
    note: 'Public API — no key required',
  });
}
