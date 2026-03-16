'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CHART_COLORS } from '@/lib/constants/colors';

interface IntelItem {
  significance: string | null;
}

const SIG_COLORS: Record<string, string> = {
  low: '#94a3b8',
  medium: CHART_COLORS.accentBlue,
  high: CHART_COLORS.warning,
  critical: CHART_COLORS.danger,
};

export function IntelBySignificanceChart({ intel }: { intel: IntelItem[] }) {
  const bySig = ['low', 'medium', 'high', 'critical'].map(sig => ({
    significance: sig.charAt(0).toUpperCase() + sig.slice(1),
    count: intel.filter(i => i.significance === sig).length,
    color: SIG_COLORS[sig],
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={bySig}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="significance" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v) => [`${v} entries`, 'Count']}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {bySig.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
