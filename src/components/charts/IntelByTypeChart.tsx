'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface IntelItem {
  type: string;
}

const TYPE_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  pivot: 'Strategic Pivot',
  thought_leadership: 'Thought Leadership',
  framework: 'Framework',
  offering: 'Offering',
};

export function IntelByTypeChart({ intel }: { intel: IntelItem[] }) {
  const byType = intel.reduce<Record<string, { name: string; value: number }>>((acc, item) => {
    const label = TYPE_LABELS[item.type] || item.type;
    if (!acc[item.type]) acc[item.type] = { name: label, value: 0 };
    acc[item.type].value += 1;
    return acc;
  }, {});

  const data = Object.values(byType).sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No intel data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={75} dataKey="value">
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v) => [`${v} entries`, 'Count']}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
