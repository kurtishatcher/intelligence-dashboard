import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default async function OverviewPage() {
  const supabase = await createClient();

  const [
    { count: competitorCount },
    { data: opportunities },
    { data: recentIntel },
    { data: latestBrief },
    { data: awards },
  ] = await Promise.all([
    supabase.from('competitors').select('*', { count: 'exact', head: true }),
    supabase.from('federal_opportunities').select('*').order('fit_score', { ascending: false }),
    supabase.from('competitor_intel').select('*, competitors(name)').order('published_at', { ascending: false }).limit(5),
    supabase.from('intelligence_briefs').select('*').order('brief_date', { ascending: false }).limit(1),
    supabase.from('contract_awards').select('*').order('award_date', { ascending: false }),
  ]);

  const activeOpps = opportunities?.filter((o) => o.status !== 'passed') || [];
  const highFitOpps = activeOpps.filter((o) => (o.fit_score || 0) >= 80);
  const totalPipelineValue = activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0);
  const totalAwardValue = awards?.reduce((sum, a) => sum + (a.value || 0), 0) || 0;

  const nearestDeadline = activeOpps
    .filter((o) => o.response_deadline)
    .sort((a, b) => new Date(a.response_deadline!).getTime() - new Date(b.response_deadline!).getTime())[0];

  const daysUntilDeadline = nearestDeadline
    ? Math.ceil((new Date(nearestDeadline.response_deadline!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      <PageHeader
        title="Intelligence Overview"
        subtitle={`Last updated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Active Opportunities"
          value={activeOpps.length}
          change={`${highFitOpps.length} high-fit (80+)`}
          trend="up"
          accent
        />
        <MetricCard
          label="Pipeline Value"
          value={`$${(totalPipelineValue / 1000000).toFixed(1)}M`}
          change="Active opportunities"
          trend="up"
        />
        <MetricCard
          label="Competitors Tracked"
          value={competitorCount || 0}
          change="7 major firms"
          trend="neutral"
        />
        <MetricCard
          label="Next Deadline"
          value={daysUntilDeadline !== null ? `${daysUntilDeadline}d` : 'N/A'}
          change={nearestDeadline ? nearestDeadline.title?.substring(0, 40) + '...' : ''}
          trend={daysUntilDeadline !== null && daysUntilDeadline <= 14 ? 'down' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Opportunities */}
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--navy)' }}>Top Federal Opportunities</h2>
          <div className="space-y-3">
            {highFitOpps.slice(0, 5).map((opp) => (
              <div key={opp.id} className="flex items-start justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  {opp.source_url ? (
                    <a href={opp.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block hover:underline" style={{ color: 'var(--navy)' }}>{opp.title}</a>
                  ) : (
                    <p className="text-sm font-medium truncate">{opp.title}</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {opp.agency} &middot; ${((opp.estimated_value || 0) / 1000000).toFixed(1)}M
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>{opp.fit_score}</span>
                  <StatusBadge status={opp.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Competitor Intel */}
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--navy)' }}>Recent Competitor Intelligence</h2>
          <div className="space-y-3">
            {(recentIntel || []).map((intel) => (
              <div key={intel.id} className="flex items-start justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{intel.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {(intel.competitors as { name: string } | null)?.name} &middot; {intel.published_at ? new Date(intel.published_at).toLocaleDateString() : 'N/A'}
                    </p>
                    {intel.source_url && (
                      <a href={intel.source_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>
                        Source →
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={intel.type} />
                  {intel.significance && <StatusBadge status={intel.significance} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Awards */}
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--navy)' }}>Recent Contract Awards</h2>
          <div className="space-y-3">
            {(awards || []).slice(0, 5).map((award) => (
              <div key={award.id} className="flex items-start justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  {award.source_url ? (
                    <a href={award.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block hover:underline" style={{ color: 'var(--navy)' }}>{award.title}</a>
                  ) : (
                    <p className="text-sm font-medium truncate">{award.title}</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {award.agency} &middot; Won by <strong>{award.winner}</strong>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--navy)' }}>${((award.value || 0) / 1000000).toFixed(1)}M</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{award.duration_months}mo</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latest Brief Preview */}
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--navy)' }}>Latest Intelligence Brief</h2>
          {latestBrief?.[0] ? (
            <div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                {new Date(latestBrief[0].brief_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <div className="space-y-2">
                {(latestBrief[0].highlights as { text: string; priority: string }[] || []).slice(0, 4).map((h, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <StatusBadge status={h.priority} />
                    <p className="text-sm">{h.text}</p>
                  </div>
                ))}
              </div>
              <a href="/brief" className="inline-block mt-4 text-sm font-medium" style={{ color: 'var(--accent-blue)' }}>
                Read full brief →
              </a>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No brief generated yet.</p>
          )}
        </div>
      </div>

      {/* Market Summary */}
      <div className="mt-6 rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--navy)' }}>Market Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>${(totalAwardValue / 1000000).toFixed(0)}M</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Recent Award Volume</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>{awards?.length || 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tracked Awards</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>{opportunities?.filter(o => o.set_aside === 'SDVOSB').length || 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>SDVOSB Opportunities</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>{opportunities?.filter(o => o.set_aside === 'SB').length || 0}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Small Business Set-Asides</p>
          </div>
        </div>
      </div>
    </div>
  );
}
