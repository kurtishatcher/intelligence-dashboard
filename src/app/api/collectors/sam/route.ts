import { NextResponse } from 'next/server';

// SAM.gov API Collector
// Status: STRUCTURED — not connected to live API
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchFromSamGov(_params: SamSearchParams) {
  // TODO: Connect to live SAM.gov API
  // const apiKey = process.env.SAM_GOV_API_KEY;
  // const url = new URL(SAM_API_BASE);
  // url.searchParams.set('api_key', apiKey);
  // url.searchParams.set('naics', params.naics?.join(',') || RELEVANT_NAICS.join(','));
  // url.searchParams.set('postedFrom', params.postedFrom || '');
  // url.searchParams.set('postedTo', params.postedTo || '');
  // url.searchParams.set('limit', String(params.limit || 25));
  // url.searchParams.set('offset', String(params.offset || 0));
  // const response = await fetch(url.toString());
  // return response.json();

  return {
    status: 'mock',
    message: 'SAM.gov API not connected. Set SAM_GOV_API_KEY in .env.local to enable.',
    endpoint: SAM_API_BASE,
    naics_codes: RELEVANT_NAICS,
  };
}

export async function POST() {
  const result = await fetchFromSamGov({
    naics: RELEVANT_NAICS,
    limit: 25,
  });

  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({
    collector: 'sam-gov',
    status: 'inactive',
    description: 'SAM.gov Federal opportunity collector',
    required_env: ['SAM_GOV_API_KEY'],
    naics_codes: RELEVANT_NAICS,
  });
}
