'use client';

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface Brief {
  brief_date: string;
}

export function BriefTrendChart({ briefs }: { briefs: Brief[] }) {
  const byWeek = briefs.reduce<Record<string, { week: string; count: number }>>((acc, b) => {
    const d = new Date(b.brief_date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!acc[key]) acc[key] = { week: key, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});

  const data = Object.values(byWeek).slice(-12);

  if (data.length === 0) {
    return <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>No briefs yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data}>
        <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
        <YAxis hide allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [`${v} briefs`, 'Count']}
        />
        <Area type="monotone" dataKey="count" stroke={CHART_COLORS.navy} fill={CHART_COLORS.navy} fillOpacity={0.15} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
