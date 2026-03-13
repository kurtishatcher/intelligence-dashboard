'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { IntelligenceBrief } from '@/lib/types/database';

function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading 1
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-xl font-bold mt-8 mb-3" style={{ color: 'var(--navy)' }}>
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // Heading 2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-lg font-semibold mt-6 mb-3" style={{ color: 'var(--navy)' }}>
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.startsWith('---')) {
      elements.push(<hr key={i} className="my-6" style={{ borderColor: 'var(--border)' }} />);
      i++;
      continue;
    }

    // Table — collect all consecutive | lines
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Parse table: first line = header, second = separator, rest = rows
      const headerCells = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
      const dataRows = tableLines.slice(2).map(row =>
        row.split('|').filter(c => c.trim()).map(c => c.trim())
      );

      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-4 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5">
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && (/^\d+\.\s/.test(lines[i]) || (lines[i].trim() === '' && i + 1 < lines.length && /^\d+\.\s/.test(lines[i + 1])))) {
        if (lines[i].trim() !== '') {
          listItems.push(lines[i].replace(/^\d+\.\s/, ''));
        }
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-3 space-y-2 pl-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex gap-3 text-sm leading-relaxed">
              <span className="font-semibold shrink-0" style={{ color: 'var(--accent-blue)' }}>{li + 1}.</span>
              <span>{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm leading-relaxed mb-2">
        {renderInlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Split on **bold** patterns
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function BriefPage() {
  const [briefs, setBriefs] = useState<IntelligenceBrief[]>([]);
  const [selectedBrief, setSelectedBrief] = useState<IntelligenceBrief | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data } = await supabase
        .from('intelligence_briefs')
        .select('*')
        .order('brief_date', { ascending: false });
      const briefList = (data as IntelligenceBrief[]) || [];
      setBriefs(briefList);
      if (briefList.length > 0) setSelectedBrief(briefList[0]);
    }
    load();
  }, []);

  return (
    <div className="pt-4 md:pt-2">
      <PageHeader
        title="Daily Intelligence Brief"
        subtitle="AI-generated strategic intelligence summary"
        action={
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--navy)' }}
            onClick={() => alert('Brief generation requires Claude API key. Add ANTHROPIC_API_KEY to .env.local to enable.')}
          >
            Generate New Brief
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Brief History Sidebar */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--navy)' }}>Brief History</h3>
            <div className="space-y-2">
              {briefs.map((brief) => (
                <button
                  key={brief.id}
                  onClick={() => setSelectedBrief(brief)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{
                    background: selectedBrief?.id === brief.id ? 'var(--navy)' : 'transparent',
                    color: selectedBrief?.id === brief.id ? '#ffffff' : 'var(--text-primary)',
                  }}
                >
                  {new Date(brief.brief_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  <p className="text-xs mt-0.5" style={{ color: selectedBrief?.id === brief.id ? 'var(--text-sidebar)' : 'var(--text-secondary)' }}>
                    Generated by {brief.generated_by}
                  </p>
                </button>
              ))}
              {briefs.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No briefs generated yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Brief Content */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          {selectedBrief ? (
            <div className="space-y-6">
              {/* Federal Pipeline Summary — FIRST */}
              {selectedBrief.federal_highlights && (
                <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Federal Pipeline Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                    {(() => {
                      const fh = selectedBrief.federal_highlights as Record<string, number | string>;
                      return (
                        <>
                          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>{fh.total_opportunities}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Total Opps</p>
                          </div>
                          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                            <p className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{fh.high_fit_count}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>High Fit</p>
                          </div>
                          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>${((fh.total_pipeline_value as number) / 1000000).toFixed(1)}M</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Pipeline</p>
                          </div>
                          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                            <p className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>{fh.sdvosb_opportunities}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>SDVOSB</p>
                          </div>
                          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                            <p className="text-2xl font-bold" style={{ color: 'var(--warning)' }}>
                              {fh.nearest_deadline ? new Date(fh.nearest_deadline as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Next Deadline</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Key Highlights — SECOND */}
              {selectedBrief.highlights && (
                <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Key Highlights</h3>
                  <div className="space-y-3">
                    {(selectedBrief.highlights as { text: string; priority: string }[]).map((h, i) => (
                      <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0" style={{ borderColor: 'var(--border)' }}>
                        <StatusBadge status={h.priority} />
                        <p className="text-sm leading-relaxed">{h.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Competitor Mentions */}
              {selectedBrief.competitor_mentions && (
                <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Competitor Mentions</h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(selectedBrief.competitor_mentions as Record<string, number>)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => (
                        <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                          <span className="text-sm font-medium">{name}</span>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--navy)', color: '#ffffff' }}>
                            {count}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Full Brief — proper markdown rendering */}
              <div className="rounded-xl border p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--navy)' }}>Full Brief</h3>
                <div className="max-w-none">
                  {renderMarkdown(selectedBrief.content)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border p-16 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <p className="text-lg font-semibold mb-2" style={{ color: 'var(--navy)' }}>No Brief Selected</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Generate a new brief or select one from the history.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
