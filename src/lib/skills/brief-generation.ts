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
import * as fs from 'fs';
import * as path from 'path';

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

// --- Theme memory file ---

const THEMES_FILE = path.join(process.cwd(), 'id_brief_themes.md');

function readPreviousThemes(): string[] {
  try {
    if (!fs.existsSync(THEMES_FILE)) {
      fs.writeFileSync(THEMES_FILE, '# Intelligence Brief Themes\n\n');
      return [];
    }
    const content = fs.readFileSync(THEMES_FILE, 'utf-8');
    // Extract themes from last 3 entries (each line starting with "- ")
    const themeLines = content.split('\n').filter((l) => l.startsWith('- '));
    return themeLines.slice(-9); // Last 3 entries × ~3 themes each
  } catch {
    return [];
  }
}

function writeThemes(briefDate: string, themes: string[]): void {
  try {
    const entry = `\n## ${briefDate}\n${themes.map((t) => `- ${t}`).join('\n')}\n`;
    fs.appendFileSync(THEMES_FILE, entry);
  } catch {
    console.error('[brief-generation] Failed to write themes to', THEMES_FILE);
  }
}

// --- Brief section structure prompt ---

const BRIEF_PROMPT_TEMPLATE = `You are an executive intelligence analyst for Hatching Solutions, a veteran-owned federal OD consulting firm (SDVOSB). Generate an executive intelligence brief from the data provided.

Context:
- Firm focus: organizational development, change management, leadership development for federal clients
- Primary target: DCSA (Defense Counterintelligence and Security Agency) and adjacent DoD/civilian agencies
- Set-aside eligibility: SDVOSB, small business
- Recent brief themes (avoid repeating): [PREVIOUS_THEMES]

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

Be specific — use agency names, NAICS codes, dollar values, and deadlines. Bottom line first in every section. Executive briefing standard: a senior leader must be able to act on this brief immediately.

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

  // Step 3: Read previous themes
  const previousThemes = readPreviousThemes();

  // Step 4: Build prompt data
  const oppsData = qualifiedOpps
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    .map((o) => `${o.agency} | ${o.title} | ${o.naics_code} | $${((o.estimated_value ?? 0) / 1e6).toFixed(1)}M | ${o.response_deadline || 'TBD'} | ${o.fit_score} | ${o.set_aside || 'None'}`)
    .join('\n');

  const awardsData = input.awards
    .map((a) => `${a.agency} | ${a.title} | ${a.winner} | $${((a.value ?? 0) / 1e6).toFixed(1)}M | ${a.naics_code}`)
    .join('\n');

  const intelData = qualifiedIntel
    .map((i) => `[${i.type}] ${i.competitor_name || 'Unknown'}: ${i.title} (${i.significance}) — ${i.summary || ''}`)
    .join('\n');

  const prompt = BRIEF_PROMPT_TEMPLATE
    .replace('[PREVIOUS_THEMES]', previousThemes.join(', ') || 'None (first brief)')
    .replace('[OPPORTUNITIES_DATA]', oppsData || 'None')
    .replace('[AWARDS_DATA]', awardsData || 'None')
    .replace('[COMPETITOR_DATA]', intelData || 'None')
    .replace('[DATE]', input.briefDate);

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
        messages: [{ role: 'user', content: prompt }],
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

    // Step 8: Write themes to memory
    if (themes.length > 0) {
      writeThemes(input.briefDate, themes);
    }

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
