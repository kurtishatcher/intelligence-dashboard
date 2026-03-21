/**
 * Skill: Brief Generation (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/intelligence-dashboard/brief-generation.skill.md
 *
 * Synthesizes collected intelligence into an executive-ready brief using
 * Claude Sonnet 4.6. Reads previous themes to prevent repetition. Filters
 * inputs by fit score and significance. Writes new themes after generation.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { trackClaudeCall } from '@/lib/skills/cost-tracking';

// --- Types ---

export interface BriefInput {
  opportunities: Array<{
    title: string;
    agency: string | null;
    naics_code: string | null;
    estimated_value: number | null;
    response_deadline: string | null;
    set_aside: string | null;
    fit_score: number | null;
    pursuit_recommendation?: string | null;
    source_url?: string | null;
  }>;
  awards: Array<{
    title: string;
    agency: string | null;
    winner: string | null;
    value: number | null;
    naics_code: string | null;
    award_date: string | null;
  }>;
  competitorIntel: Array<{
    title: string;
    summary: string | null;
    type: string;
    significance: string | null;
    competitor_name?: string | null;
  }>;
  briefDate: string;
}

export interface BriefResult {
  status: 'generated' | 'insufficient_data' | 'error';
  brief?: string;
  highlights?: Array<{ title: string; finding: string; priority: 'high' | 'medium' | 'low' }>;
  themes?: string[];
  opportunityCount: number;
  awardCount: number;
  competitorItemCount: number;
  error?: string;
}

// --- Theme memory (Supabase-backed, not filesystem) ---

async function readPreviousThemes(): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('intelligence_briefs')
      .select('themes')
      .not('themes', 'is', null)
      .order('brief_date', { ascending: false })
      .limit(3);

    if (!data) return [];
    return data.flatMap((row) => row.themes || []);
  } catch {
    return [];
  }
}
// Themes are written to intelligence_briefs by the route handler during upsert — no separate write needed here.

// --- System prompt (role + context — sent via API system parameter) ---

const BRIEF_SYSTEM_PROMPT = `You are an executive intelligence analyst for Hatching Solutions, a veteran-owned federal OD consulting firm (SDVOSB).

Context:
- Firm focus: organizational development, change management, leadership development for federal clients
- Primary target: DCSA (Defense Counterintelligence and Security Agency) and adjacent DoD/civilian agencies
- Set-aside eligibility: SDVOSB, small business
- Output standard: a senior leader must be able to act on this brief immediately
- Voice: specific, evidence-based, BLUF first in every section — use agency names, NAICS codes, dollar values, and deadlines`;

// --- User prompt template (data + structure instructions) ---

const BRIEF_USER_TEMPLATE = `Generate an executive intelligence brief from this data. Avoid repeating these recent themes: [PREVIOUS_THEMES]

Data provided:
Opportunities (fit score ≥ 50): [OPPORTUNITIES_DATA]
Contract Awards: [AWARDS_DATA]
Competitor Intelligence (high/medium significance): [COMPETITOR_DATA]

Follow this section structure exactly:

# Intelligence Brief — [DATE]

## Situation
[1 paragraph: macro context — what's happening in Federal OD/HC market this period]

## Key Opportunities
[Pursue-tier opportunities only, sorted by fit score descending]
| Agency | Title | NAICS | Value | Deadline | Fit Score |
|--------|-------|-------|-------|----------|-----------|

## Contract Awards (Intelligence)
[Notable competitor wins — what it tells us about market activity]

## Competitive Activity
[High/medium significance competitor intel, grouped by intelType]

## Recommended Actions
[Numbered, specific, actionable — each tied to a finding above]

## Appendix: All Scored Opportunities
[All opportunities with fitScore >= 40, including Monitor tier]

After the brief, on a new line output ---STRUCTURED--- followed by a JSON object:
{
  "highlights": [{"title": "...", "finding": "...", "priority": "high|medium|low"}],
  "themes": ["theme1", "theme2", "theme3"]
}
Highlights must contain exactly 3-5 items. Themes must contain exactly 3 items.`;

// --- Main function ---

export async function generateBrief(input: BriefInput): Promise<BriefResult> {
  // Step 1: Filter inputs per spec
  const qualifiedOpps = input.opportunities.filter((o) => (o.fit_score ?? 0) >= 50);
  const monitorOpps = input.opportunities.filter((o) => (o.fit_score ?? 0) >= 40 && (o.fit_score ?? 0) < 50);
  const qualifiedIntel = input.competitorIntel.filter(
    (i) => i.significance === 'high' || i.significance === 'medium'
  );

  // Step 2: Check minimum data threshold
  if (qualifiedOpps.length < 3 && qualifiedIntel.length < 2) {
    return {
      status: 'insufficient_data',
      opportunityCount: qualifiedOpps.length,
      awardCount: input.awards.length,
      competitorItemCount: qualifiedIntel.length,
      error: `Insufficient data: ${qualifiedOpps.length} opportunities (need ≥3) and ${qualifiedIntel.length} intel items (need ≥2).`,
    };
  }

  // Step 3: Read previous themes from last 3 briefs in Supabase
  const previousThemes = await readPreviousThemes();

  // Step 4: Build prompt data
  const allScoredOpps = [...qualifiedOpps, ...monitorOpps]
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));

  const oppsData = qualifiedOpps
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    .map((o) => `${o.agency} | ${o.title} | ${o.naics_code} | $${((o.estimated_value ?? 0) / 1e6).toFixed(1)}M | ${o.response_deadline || 'TBD'} | ${o.fit_score} | ${o.set_aside || 'None'}`)
    .join('\n');

  const appendixData = allScoredOpps
    .map((o) => `${o.agency} | ${o.title} | ${o.naics_code} | $${((o.estimated_value ?? 0) / 1e6).toFixed(1)}M | ${o.response_deadline || 'TBD'} | ${o.fit_score} | ${o.pursuit_recommendation || 'N/A'}`)
    .join('\n');

  const awardsData = input.awards
    .map((a) => `${a.agency} | ${a.title} | ${a.winner} | $${((a.value ?? 0) / 1e6).toFixed(1)}M | ${a.naics_code}`)
    .join('\n');

  const intelData = qualifiedIntel
    .map((i) => `[${i.type}] ${i.competitor_name || 'Unknown'}: ${i.title} (${i.significance}) — ${i.summary || ''}`)
    .join('\n');

  const userPrompt = BRIEF_USER_TEMPLATE
    .replace('[PREVIOUS_THEMES]', previousThemes.join(', ') || 'None (first brief)')
    .replace('[OPPORTUNITIES_DATA]', oppsData || 'None')
    .replace('[AWARDS_DATA]', awardsData || 'None')
    .replace('[COMPETITOR_DATA]', intelData || 'None')
    .replace('[DATE]', input.briefDate)
    + `\n\nAppendix data (all opportunities fitScore >= 40):\n${appendixData || 'None'}`;

  // Step 5: Generate with Sonnet 4.6
  try {
    const client = new Anthropic();
    const model = 'claude-sonnet-4-6';

    const response = await trackClaudeCall(
      'intelligence-dashboard',
      'brief-generation',
      model,
      () => client.messages.create({
        model,
        max_tokens: 4096,
        system: BRIEF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    );

    const fullText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Step 6: Parse structured data from response
    const delimiter = '---STRUCTURED---';
    const delimIdx = fullText.indexOf(delimiter);
    let briefContent = fullText;
    let highlights: Array<{ title: string; finding: string; priority: 'high' | 'medium' | 'low' }> = [];
    let themes: string[] = [];

    if (delimIdx !== -1) {
      briefContent = fullText.slice(0, delimIdx).trim();
      const jsonStr = fullText.slice(delimIdx + delimiter.length).trim();
      try {
        const cleaned = jsonStr.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        highlights = (parsed.highlights || []).slice(0, 5);
        themes = (parsed.themes || []).slice(0, 3);
      } catch {
        // JSON parsing failed — proceed without structured data
      }
    }

    // Ensure highlights is 3–5
    if (highlights.length < 3) {
      highlights = highlights.concat(
        Array(3 - highlights.length).fill({ title: 'Review needed', finding: 'Auto-generated highlight missing — review brief manually.', priority: 'low' as const })
      );
    }

    // Step 7: Federal quality gate (Priority 16 — not yet implemented, skip with note)
    // TODO: Wire federal-quality-gate skill here when Priority 16 is implemented.
    // If gate returns readyForDelivery: false, hold the brief and surface the issue.

    // Step 8: Themes are persisted by the route handler during intelligence_briefs upsert

    return {
      status: 'generated',
      brief: briefContent,
      highlights,
      themes,
      opportunityCount: qualifiedOpps.length,
      awardCount: input.awards.length,
      competitorItemCount: qualifiedIntel.length,
    };
  } catch (err) {
    return {
      status: 'error',
      opportunityCount: qualifiedOpps.length,
      awardCount: input.awards.length,
      competitorItemCount: qualifiedIntel.length,
      error: String(err),
    };
  }
}
