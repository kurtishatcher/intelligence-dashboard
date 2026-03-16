'use client';

import { PipelineTrendChart } from './PipelineTrendChart';
import { AwardsByAgencyChart } from './AwardsByAgencyChart';

interface Props {
  opportunities: { posted_at: string | null; estimated_value: number | null }[];
  awards: { agency: string | null; value: number | null }[];
}

export function OverviewCharts({ opportunities, awards }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Pipeline Trend</h2>
        <PipelineTrendChart opportunities={opportunities} />
      </div>
      <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Awards by Agency</h2>
        <AwardsByAgencyChart awards={awards} />
      </div>
    </div>
  );
}
