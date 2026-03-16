'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface Award {
  agency: string | null;
  value: number | null;
}

export function AwardsByAgencyChart({ awards }: { awards: Award[] }) {
  const byAgency = awards.reduce<Record<string, { agency: string; value: number; count: number }>>((acc, a) => {
    const agency = a.agency || 'Unknown';
    if (!acc[agency]) acc[agency] = { agency, value: 0, count: 0 };
    acc[agency].value += (a.value || 0) / 1000000;
    acc[agency].count += 1;
    return acc;
  }, {});

  const data = Object.values(byAgency)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map(d => ({ ...d, agency: d.agency.length > 30 ? d.agency.slice(0, 28) + '...' : d.agency }));

  if (data.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No award data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <YAxis dataKey="agency" type="category" width={140} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip
          contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v) => [`$${Number(v).toFixed(1)}M`, 'Award Value']}
        />
        <Bar dataKey="value" fill={CHART_COLORS.accentBlue} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
