import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { trackClaudeCall } from '@/lib/services/cost-logger';

const SYSTEM_PROMPT = `You are a strategic intelligence analyst for Hatching Solutions, a veteran-owned OD consulting firm specializing in organizational development, strategic leadership, and change management for Federal/Defense and Corporate clients.

Generate a daily intelligence brief synthesizing the provided data about federal procurement opportunities, contract awards, and competitor activity.

Structure your brief as markdown with these sections:
## Executive Summary
2-3 sentences with the most actionable takeaways.

## Federal Pipeline Analysis
Key opportunities, upcoming deadlines, set-aside trends, and pipeline health.

## Competitive Landscape
Competitor activity patterns, strategic moves, and implications for Hatching Solutions.

## Strategic Recommendations
2-3 specific, actionable items for the next 1-2 weeks.

After the markdown brief, output a JSON block on a new line starting with ---JSON--- containing:
{
  "highlights": [{"text": "...", "priority": "low|medium|high|critical"}],
  "competitor_mentions": {"CompanyName": count, ...}
}

Keep the tone executive-ready: BLUF, no filler, evidence-based.`;

export async function generateBrief(): Promise<{
  success: boolean;
  brief_date: string;
  error?: string;
}> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];

  // Gather recent data
  const [
    { data: opportunities },
    { data: awards },
    { data: intel },
    { data: competitors },
  ] = await Promise.all([
    supabase.from('federal_opportunities').select('*').order('fit_score', { ascending: false }).limit(20),
    supabase.from('contract_awards').select('*').order('award_date', { ascending: false }).limit(15),
    supabase.from('competitor_intel').select('*, competitors(name)').order('published_at', { ascending: false }).limit(20),
    supabase.from('competitors').select('name'),
  ]);

  const activeOpps = (opportunities || []).filter(o => o.status !== 'passed');
  const totalPipelineValue = activeOpps.reduce((sum, o) => sum + (o.estimated_value || 0), 0);
  const highFitCount = activeOpps.filter(o => (o.fit_score || 0) >= 80).length;
  const sdvosbCount = activeOpps.filter(o => o.set_aside === 'SDVOSB').length;

  const nearestDeadline = activeOpps
    .filter(o => o.response_deadline && new Date(o.response_deadline) > new Date())
    .sort((a, b) => new Date(a.response_deadline!).getTime() - new Date(b.response_deadline!).getTime())[0];

  const federal_highlights = {
    total_opportunities: activeOpps.length,
    high_fit_count: highFitCount,
    total_pipeline_value: totalPipelineValue,
    sdvosb_opportunities: sdvosbCount,
    nearest_deadline: nearestDeadline?.response_deadline || null,
  };

  // Build data summary for Claude
  const dataSummary = `
## Current Federal Pipeline (${activeOpps.length} active opportunities)
${activeOpps.slice(0, 10).map(o => `- ${o.title} | ${o.agency} | $${((o.estimated_value || 0) / 1e6).toFixed(1)}M | Fit: ${o.fit_score} | Set-aside: ${o.set_aside || 'None'} | Deadline: ${o.response_deadline ? new Date(o.response_deadline).toLocaleDateString() : 'TBD'}`).join('\n')}

## Recent Contract Awards (${(awards || []).length} tracked)
${(awards || []).slice(0, 10).map(a => `- ${a.title} | ${a.agency} | Won by: ${a.winner} | $${((a.value || 0) / 1e6).toFixed(1)}M | NAICS: ${a.naics_code}`).join('\n')}

## Recent Competitor Intelligence
${(intel || []).slice(0, 10).map(i => `- [${(i.competitors as { name: string })?.name}] ${i.title} | Type: ${i.type} | Significance: ${i.significance}`).join('\n')}

## Pipeline Summary
- Total pipeline value: $${(totalPipelineValue / 1e6).toFixed(1)}M
- High-fit opportunities (80+): ${highFitCount}
- SDVOSB set-asides: ${sdvosbCount}
- Nearest deadline: ${nearestDeadline ? new Date(nearestDeadline.response_deadline!).toLocaleDateString() : 'None pending'}
- Competitors tracked: ${(competitors || []).map(c => c.name).join(', ')}
`;

  try {
    const client = new Anthropic();
    const briefModel = 'claude-sonnet-4-6-20250514';
    const response = await trackClaudeCall(
      'intelligence-dashboard',
      'generate-brief',
      briefModel,
      () => client.messages.create({
        model: briefModel,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Generate today's intelligence brief based on this data:\n${dataSummary}` }],
      }),
    );

    const fullText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Split markdown content from JSON block
    const jsonDelimiter = '---JSON---';
    const jsonIdx = fullText.indexOf(jsonDelimiter);
    let content = fullText;
    let highlights: { text: string; priority: string }[] = [];
    let competitor_mentions: Record<string, number> = {};

    if (jsonIdx !== -1) {
      content = fullText.slice(0, jsonIdx).trim();
      const jsonStr = fullText.slice(jsonIdx + jsonDelimiter.length).trim();
      try {
        const cleaned = jsonStr.replace(/```json?\s*/g, '').replace(/```\s*/g, '');
        const parsed = JSON.parse(cleaned);
        highlights = parsed.highlights || [];
        competitor_mentions = parsed.competitor_mentions || {};
      } catch {
        // JSON parsing failed — use defaults
      }
    }

    // Upsert brief (one per day)
    const { error: upsertError } = await supabase
      .from('intelligence_briefs')
      .upsert({
        brief_date: today,
        content,
        highlights,
        competitor_mentions,
        federal_highlights,
        generated_by: 'claude-sonnet-4-6',
      }, { onConflict: 'brief_date' });

    if (upsertError) {
      return { success: false, brief_date: today, error: upsertError.message };
    }

    return { success: true, brief_date: today };
  } catch (err) {
    return { success: false, brief_date: today, error: String(err) };
  }
}
