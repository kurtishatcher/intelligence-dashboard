'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Competitor, CompetitorIntel } from '@/lib/types/database';
import { IntelByTypeChart } from '@/components/charts/IntelByTypeChart';
import { IntelBySignificanceChart } from '@/components/charts/IntelBySignificanceChart';

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [intel, setIntel] = useState<(CompetitorIntel & { competitors: { name: string } })[]>([]);
  const [selectedFirm, setSelectedFirm] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [{ data: comps }, { data: intelData }] = await Promise.all([
        supabase.from('competitors').select('*').order('revenue_billions', { ascending: false }),
        supabase.from('competitor_intel').select('*, competitors(name)').order('published_at', { ascending: false }),
      ]);
      setCompetitors((comps as Competitor[]) || []);
      setIntel((intelData as (CompetitorIntel & { competitors: { name: string } })[]) || []);
    }
    load();
  }, []);

  const filteredIntel = intel.filter((item) => {
    if (selectedFirm && item.competitor_id !== selectedFirm) return false;
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    return true;
  });

  const intelTypes = ['all', 'revenue', 'pivot', 'thought_leadership', 'framework', 'offering'];

  const selectStyle = {
    background: 'var(--bg-card)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div>
      <PageHeader title="Competitor Intelligence" subtitle="Tracking 7 major consulting firms across OD, leadership, and Federal advisory" />

      {/* Competitor Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {competitors.map((comp) => {
          const compIntel = intel.filter((i) => i.competitor_id === comp.id);
          const isSelected = selectedFirm === comp.id;
          return (
            <button
              key={comp.id}
              onClick={() => setSelectedFirm(isSelected ? null : comp.id)}
              className="text-left rounded-xl border p-4 transition-all"
              style={{
                background: isSelected ? 'var(--navy)' : 'var(--bg-card)',
                borderColor: isSelected ? 'var(--navy)' : 'var(--border)',
              }}
            >
              <h3 className="font-semibold text-sm" style={{ color: isSelected ? '#ffffff' : 'var(--navy)' }}>
                {comp.name}
              </h3>
              <p className="text-xs mt-1" style={{ color: isSelected ? 'var(--text-sidebar)' : 'var(--text-secondary)' }}>
                ${comp.revenue_billions}B revenue &middot; {(comp.employee_count || 0).toLocaleString()} employees
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {(comp.focus_areas || []).slice(0, 3).map((area) => (
                  <span
                    key={area}
                    className="px-2 py-0.5 rounded text-xs"
                    style={{
                      background: isSelected ? 'rgba(255,255,255,0.15)' : 'var(--bg-primary)',
                      color: isSelected ? 'var(--text-sidebar)' : 'var(--text-secondary)',
                    }}
                  >
                    {area}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-2 border-t" style={{ borderColor: isSelected ? 'rgba(255,255,255,0.15)' : 'var(--border)' }}>
                <span className="text-xs font-medium" style={{ color: isSelected ? 'var(--accent-blue-light)' : 'var(--accent-blue)' }}>
                  {compIntel.length} intel entries
                </span>
                <span className="text-xs" style={{ color: isSelected ? 'var(--text-sidebar)' : 'var(--text-secondary)' }}>
                  &middot; {compIntel.filter(i => i.significance === 'critical').length} critical
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Intel Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Intel by Type</h2>
          <IntelByTypeChart intel={filteredIntel} />
        </div>
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Intel by Significance</h2>
          <IntelBySignificanceChart intel={filteredIntel} />
        </div>
      </div>

      {/* Intel Feed */}
      <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--navy)' }}>
            Intelligence Feed
            {selectedFirm && (
              <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-secondary)' }}>
                — {competitors.find(c => c.id === selectedFirm)?.name}
              </span>
            )}
          </h2>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border"
            style={selectStyle}
          >
            {intelTypes.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          {filteredIntel.map((item) => (
            <div key={item.id} className="pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>
                      {item.competitors?.name}
                    </span>
                    <StatusBadge status={item.type} />
                    {item.significance && <StatusBadge status={item.significance} />}
                  </div>
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:underline block" style={{ color: 'var(--navy)' }}>{item.title}</a>
                  ) : (
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                  )}
                  {item.summary && (
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {item.published_at ? new Date(item.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                    </span>
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium"
                        style={{ color: 'var(--accent-blue)' }}
                      >
                        Source →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filteredIntel.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              No intelligence entries match your filters.
            </p>
          )}
        </div>
      </div>

      {/* OD Relevance Section */}
      {selectedFirm && (
        <div className="mt-6 rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--navy)' }}>OD Competitive Analysis</h2>
          {(() => {
            const comp = competitors.find(c => c.id === selectedFirm);
            if (!comp) return null;
            return (
              <div>
                <p className="text-sm mb-3">{comp.od_relevance}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(comp.focus_areas || []).map((area) => (
                    <div key={area} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-primary)' }}>
                      {area}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
