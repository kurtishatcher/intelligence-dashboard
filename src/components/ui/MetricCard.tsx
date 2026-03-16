interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  accent?: boolean;
}

export function MetricCard({ label, value, change, trend, accent }: MetricCardProps) {
  const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)';
  const trendArrow = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';

  return (
    <div
      className="rounded-lg p-5 border"
      style={{
        background: accent ? 'var(--navy)' : 'var(--card-bg)',
        borderColor: accent ? 'transparent' : 'var(--border)',
      }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: accent ? 'var(--text-sidebar)' : 'var(--text-muted)' }}
      >
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color: accent ? '#ffffff' : 'var(--navy)' }}>
        {value}
      </p>
      {change && (
        <p className="text-xs mt-2 font-medium" style={{ color: accent ? 'var(--accent-blue-light)' : trendColor }}>
          {trendArrow} {change}
        </p>
      )}
    </div>
  );
}
