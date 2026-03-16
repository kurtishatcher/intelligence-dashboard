'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface Opportunity {
  fit_score: number | null;
}

const BUCKETS = [
  { range: '0-29', min: 0, max: 29, color: '#94a3b8' },
  { range: '30-49', min: 30, max: 49, color: CHART_COLORS.warning },
  { range: '50-69', min: 50, max: 69, color: CHART_COLORS.accentBlue },
  { range: '70-84', min: 70, max: 84, color: CHART_COLORS.teal },
  { range: '85-100', min: 85, max: 100, color: CHART_COLORS.success },
];

export function FitScoreDistribution({ opportunities }: { opportunities: Opportunity[] }) {
  const data = BUCKETS.map(bucket => ({
    range: bucket.range,
    count: opportunities.filter(o => {
      const score = o.fit_score || 0;
      return score >= bucket.min && score <= bucket.max;
    }).length,
    color: bucket.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="range" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v) => [`${v} opportunities`, 'Count']}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
