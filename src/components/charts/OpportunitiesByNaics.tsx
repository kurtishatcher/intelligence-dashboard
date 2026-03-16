'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface Opportunity {
  naics_code: string | null;
  naics_description: string | null;
}

export function OpportunitiesByNaics({ opportunities }: { opportunities: Opportunity[] }) {
  const byNaics = opportunities.reduce<Record<string, { name: string; value: number }>>((acc, o) => {
    const code = o.naics_code || 'Unknown';
    const desc = o.naics_description || code;
    const label = `${code} - ${desc.length > 25 ? desc.slice(0, 23) + '...' : desc}`;
    if (!acc[code]) acc[code] = { name: label, value: 0 };
    acc[code].value += 1;
    return acc;
  }, {});

  const data = Object.values(byNaics).sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>No opportunity data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${(name || '').split(' - ')[0]} (${((percent || 0) * 100).toFixed(0)}%)`}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v) => [`${v} opportunities`, 'Count']}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
