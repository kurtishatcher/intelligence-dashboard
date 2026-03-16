'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MetricCard } from '@/components/ui/MetricCard';
import type { FederalOpportunity, ContractAward } from '@/lib/types/database';
import { FitScoreDistribution } from '@/components/charts/FitScoreDistribution';
import { OpportunitiesByNaics } from '@/components/charts/OpportunitiesByNaics';

type FilterStatus = 'all' | 'new' | 'reviewing' | 'pursuing' | 'passed' | 'submitted';
type FilterSetAside = 'all' | 'SDVOSB' | 'SB' | '8(a)' | 'Unrestricted';

export default function FederalPage() {
  const [opportunities, setOpportunities] = useState<FederalOpportunity[]>([]);
  const [awards, setAwards] = useState<ContractAward[]>([]);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [setAsideFilter, setSetAsideFilter] = useState<FilterSetAside>('all');
  const [tab, setTab] = useState<'opportunities' | 'awards'>('opportunities');

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const [{ data: opps }, { data: awds }] = await Promise.all([
        supabase.from('federal_opportunities').select('*').order('fit_score', { ascending: false }),
        supabase.from('contract_awards').select('*').order('award_date', { ascending: false }),
      ]);
      setOpportunities((opps as FederalOpportunity[]) || []);
      setAwards((awds as ContractAward[]) || []);
    }
    load();
  }, []);

  const filtered = opportunities.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (setAsideFilter !== 'all' && o.set_aside !== setAsideFilter) return false;
    return true;
  });

  const totalValue = filtered.reduce((sum, o) => sum + (o.estimated_value || 0), 0);
  const avgFitScore = filtered.length > 0
    ? Math.round(filtered.reduce((sum, o) => sum + (o.fit_score || 0), 0) / filtered.length)
    : 0;

  const selectStyle = {
    background: 'var(--bg-card)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div>
      <PageHeader title="Federal Intelligence" subtitle="SAM.gov opportunities and USAspending contract awards" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Opportunities" value={filtered.length} />
        <MetricCard label="Pipeline Value" value={`$${(totalValue / 1000000).toFixed(1)}M`} />
        <MetricCard label="Avg Fit Score" value={avgFitScore} trend={avgFitScore >= 75 ? 'up' : 'neutral'} />
        <MetricCard label="Awards Tracked" value={awards.length} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Fit Score Distribution</h2>
          <FitScoreDistribution opportunities={filtered} />
        </div>
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Opportunities by NAICS</h2>
          <OpportunitiesByNaics opportunities={filtered} />
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-4">
        {(['opportunities', 'awards'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === t ? 'var(--navy)' : 'var(--bg-card)',
              color: tab === t ? '#ffffff' : 'var(--text-secondary)',
              border: tab === t ? 'none' : '1px solid var(--border)',
            }}
          >
            {t === 'opportunities' ? 'Opportunities' : 'Contract Awards'}
          </button>
        ))}
      </div>

      {tab === 'opportunities' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="px-3 py-2 rounded-lg text-sm border"
              style={selectStyle}
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="reviewing">Reviewing</option>
              <option value="pursuing">Pursuing</option>
              <option value="passed">Passed</option>
              <option value="submitted">Submitted</option>
            </select>
            <select
              value={setAsideFilter}
              onChange={(e) => setSetAsideFilter(e.target.value as FilterSetAside)}
              className="px-3 py-2 rounded-lg text-sm border"
              style={selectStyle}
            >
              <option value="all">All Set-Asides</option>
              <option value="SDVOSB">SDVOSB</option>
              <option value="SB">Small Business</option>
              <option value="8(a)">8(a)</option>
              <option value="Unrestricted">Unrestricted</option>
            </select>
          </div>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-primary)' }}>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Opportunity</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>Agency</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Value</th>
                    <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Fit</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Deadline</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((opp) => (
                    <tr key={opp.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3">
                        {opp.source_url ? (
                          <a href={opp.source_url} target="_blank" rel="noopener noreferrer" className="font-medium truncate max-w-xs block hover:underline" style={{ color: 'var(--navy)' }}>{opp.title}</a>
                        ) : (
                          <p className="font-medium truncate max-w-xs">{opp.title}</p>
                        )}
                        {opp.notice_id && (
                          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>{opp.notice_id}</p>
                        )}
                        <div className="flex gap-2 mt-1">
                          {opp.naics_code && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>NAICS {opp.naics_code}</span>}
                          {opp.set_aside && opp.set_aside !== 'Unrestricted' && (
                            <StatusBadge status={opp.set_aside === 'SDVOSB' ? 'pursuing' : 'new'} label={opp.set_aside} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        <p className="truncate max-w-[200px]">{opp.agency}</p>
                        {opp.sub_agency && <p className="text-xs truncate max-w-[200px]">{opp.sub_agency}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--navy)' }}>
                        ${((opp.estimated_value || 0) / 1000000).toFixed(1)}M
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold"
                          style={{
                            background: (opp.fit_score || 0) >= 85 ? '#d1fae5' : (opp.fit_score || 0) >= 70 ? '#fef3c7' : '#f3f4f6',
                            color: (opp.fit_score || 0) >= 85 ? '#065f46' : (opp.fit_score || 0) >= 70 ? '#92400e' : '#6b7280',
                          }}
                        >
                          {opp.fit_score}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : 'TBD'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={opp.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'awards' && (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Contract</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>Agency</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Winner</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Value</th>
                  <th className="text-center px-4 py-3 font-medium hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Duration</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((award) => (
                  <tr key={award.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3">
                      {award.source_url ? (
                        <a href={award.source_url} target="_blank" rel="noopener noreferrer" className="font-medium truncate max-w-xs block hover:underline" style={{ color: 'var(--navy)' }}>{award.title}</a>
                      ) : (
                        <p className="font-medium truncate max-w-xs">{award.title}</p>
                      )}
                      {award.award_id && (
                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{award.award_id}</p>
                      )}
                      {award.naics_code && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>NAICS {award.naics_code}</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {award.agency}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--navy)' }}>
                      {award.winner}
                    </td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--navy)' }}>
                      ${((award.value || 0) / 1000000).toFixed(1)}M
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {award.duration_months}mo
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {award.award_date ? new Date(award.award_date).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
