'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface Opportunity {
  posted_at: string | null;
  estimated_value: number | null;
}

export function PipelineTrendChart({ opportunities }: { opportunities: Opportunity[] }) {
  const monthlyData = opportunities.reduce<Record<string, { month: string; count: number; value: number }>>((acc, opp) => {
    if (!opp.posted_at) return acc;
    const month = new Date(opp.posted_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!acc[month]) acc[month] = { month, count: 0, value: 0 };
    acc[month].count += 1;
    acc[month].value += (opp.estimated_value || 0) / 1000000;
    return acc;
  }, {});

  const data = Object.values(monthlyData).slice(-12);

  if (data.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No pipeline data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis yAxisId="count" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis yAxisId="value" orientation="right" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <Tooltip
          contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v, name) => [name === 'count' ? `${v} opps` : `$${Number(v).toFixed(1)}M`, name === 'count' ? 'Opportunities' : 'Value']}
        />
        <Line yAxisId="count" type="monotone" dataKey="count" stroke={CHART_COLORS.navy} strokeWidth={2} dot={{ r: 3 }} />
        <Line yAxisId="value" type="monotone" dataKey="value" stroke={CHART_COLORS.accentBlue} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
