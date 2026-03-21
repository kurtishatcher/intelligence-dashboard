/**
 * Skill: Competitor Classification (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/intelligence-dashboard/competitor-classification.skill.md
 *
 * Classifies competitor intelligence by type (7 categories), significance,
 * and OD relevance. Uses Claude Haiku 4.5 for cost efficiency at volume.
 * Batches up to 10 items per API call.
 */
import Anthropic from '@anthropic-ai/sdk';
import { trackClaudeCall } from '@/lib/skills/cost-tracking';

// --- Types ---

export type IntelType =
  | 'capability_expansion'
  | 'talent_signal'
  | 'contract_win'
  | 'thought_leadership'
  | 'pricing_signal'
  | 'partnership'
  | 'irrelevant';

export type Significance = 'high' | 'medium' | 'low';

export interface ClassificationInput {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  contentType: 'news_article' | 'job_posting' | 'contract_award';
}

export interface ClassificationResult {
  intelType: IntelType;
  significance: Significance;
  odRelevanceScore: number;
  summary: string;
  tags: string[];
  competitor: string;
}

// --- Constants ---

const BATCH_SIZE = 10;
const MODEL = 'claude-haiku-4-5';

const CLASSIFICATION_PROMPT = `Classify the following items as competitor intelligence for Hatching Solutions, a veteran-owned federal OD consulting firm.

For each item, return a JSON object with these exact fields:
{
  "index": <item number>,
  "intelType": one of ["capability_expansion", "talent_signal", "contract_win", "thought_leadership", "pricing_signal", "partnership", "irrelevant"],
  "significance": one of ["high", "medium", "low"],
  "odRelevanceScore": 0-10,
  "summary": "1-2 sentence plain summary",
  "tags": ["tag1", "tag2"],
  "competitor": "normalized competitor name or 'unknown'"
}

Intel type definitions:
- capability_expansion: Competitor launching new service line or capability in OD/HC/leadership
- talent_signal: Competitor hiring in OD/HC/leadership domain (flag if title indicates practice build-out)
- contract_win: Competitor wins Federal contract in NAICS 541611/541612/541613/541614/611430
- thought_leadership: Competitor publishing IP, frameworks, reports on OD topics
- pricing_signal: Contract award revealing competitor pricing or rate structure
- partnership: Competitor announcing teaming arrangement or acquisition
- irrelevant: General news with no competitive intelligence value

Significance criteria:
- high: Direct threat to pipeline; competitor entering DCSA/Federal OD space
- medium: Adjacent capability or market; relevant for positioning
- low: Background noise; useful for historical record only

OD relevance: 8-10 for direct federal OD/HC signals, 5-7 for adjacent capability, 1-4 for peripheral, 0 for irrelevant.

Return ONLY a JSON array of objects. No markdown fences, no preamble.`;

// --- Main function ---

export async function classifyItems(items: ClassificationInput[]): Promise<ClassificationResult[]> {
  if (items.length === 0) return [];

  const results: ClassificationResult[] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await classifyBatch(batch, i);
    results.push(...batchResults);
  }

  return results;
}

async function classifyBatch(
  batch: ClassificationInput[],
  startIndex: number,
): Promise<ClassificationResult[]> {
  const itemSummaries = batch
    .map((item, i) =>
      `[${startIndex + i}] Type: ${item.contentType}\nSource: ${item.source}\nTitle: ${item.title}\nDescription: ${item.description.slice(0, 400)}`
    )
    .join('\n\n');

  try {
    const anthropic = new Anthropic();
    const response = await trackClaudeCall(
      'intelligence-dashboard',
      'competitor-classification',
      MODEL,
      () => anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: CLASSIFICATION_PROMPT,
        messages: [{ role: 'user', content: `Classify these items:\n\n${itemSummaries}` }],
      }),
    );

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed: Array<{
      index: number;
      intelType: string;
      significance: string;
      odRelevanceScore: number;
      summary: string;
      tags: string[];
      competitor: string;
    }> = JSON.parse(cleaned);

    return parsed.map((p) => ({
      intelType: validateIntelType(p.intelType),
      significance: validateSignificance(p.significance),
      odRelevanceScore: p.intelType === 'irrelevant' ? 0 : Math.min(10, Math.max(0, p.odRelevanceScore ?? 0)),
      summary: p.summary || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      competitor: p.competitor || 'unknown',
    }));
  } catch (err) {
    console.error('[competitor-classification] Batch classification failed:', err);
    // Return irrelevant for all items in the failed batch rather than crashing
    return batch.map(() => ({
      intelType: 'irrelevant' as IntelType,
      significance: 'low' as Significance,
      odRelevanceScore: 0,
      summary: 'Classification failed — manual review needed.',
      tags: ['classification-error'],
      competitor: 'unknown',
    }));
  }
}

// --- Validators ---

const VALID_INTEL_TYPES: Set<string> = new Set([
  'capability_expansion', 'talent_signal', 'contract_win',
  'thought_leadership', 'pricing_signal', 'partnership', 'irrelevant',
]);

const VALID_SIGNIFICANCE: Set<string> = new Set(['high', 'medium', 'low']);

function validateIntelType(value: string): IntelType {
  return VALID_INTEL_TYPES.has(value) ? (value as IntelType) : 'irrelevant';
}

function validateSignificance(value: string): Significance {
  return VALID_SIGNIFICANCE.has(value) ? (value as Significance) : 'low';
}
