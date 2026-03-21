/**
 * Skill: Federal Quality Gate (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/cross-cutting/federal-quality-gate.skill.md
 *
 * Reusable quality evaluation for AI-generated federal consulting outputs.
 * Single Sonnet 4.6 call per evaluation. Rubric varies by document type.
 * Grade A/B = ready for delivery. Below B = hold.
 */
import Anthropic from '@anthropic-ai/sdk';
import { trackClaudeCall } from '@/lib/skills/cost-tracking';

// --- Types ---

export type DocumentType = 'intelligence-brief' | 'proposal' | 'research-report' | 'client-briefing' | 'competitor-analysis';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface QualityGateInput {
  content: string;
  documentType: DocumentType;
  context?: {
    clientName?: string;
    opportunityType?: string;
  };
}

export interface QualityGateResult {
  grade: Grade;
  score: number;
  readyForDelivery: boolean;
  issues: Array<{
    category: string;
    severity: 'critical' | 'major' | 'minor';
    description: string;
    location: string;
  }>;
  recommendations: string[];
}

// --- Rubric definitions ---

const RUBRICS: Record<DocumentType, string> = {
  'intelligence-brief': `Rubric for Intelligence Brief:
- BLUF compliance (20%): Key finding stated in first sentence
- Evidence density (25%): Each claim tied to source (SAM.gov, USASpending, competitor feed)
- Opportunity specificity (20%): Opportunities include agency, NAICS, value, deadline
- Trend analysis (15%): At least one cross-data trend identified
- Actionability (20%): At least one recommended action per major finding`,

  'proposal': `Rubric for Proposal:
- Section completeness (25%): All 6 sections present (exec summary, tech approach, mgmt, staffing, pricing, past performance)
- Client alignment (25%): Client name and specific requirements referenced in each section
- Differentiator clarity (20%): Veteran-owned SDVOSB / OD expertise positioned at least once
- Compliance (15%): No prohibited representations, no unsubstantiated past performance claims
- Tone (15%): Confident, active voice; no excessive hedging`,

  'research-report': `Rubric for Research Report:
- Research question answered (25%): Explicit answer to the stated research question
- Source diversity (20%): At least 3 distinct source types used
- Citation completeness (20%): All factual claims cited
- Implications section (20%): At least 2 actionable implications for Hatching Solutions
- Executive summary (15%): Present, ≤150 words, BLUF compliant`,

  'client-briefing': `Rubric for Client Briefing:
- BLUF compliance (25%): Key recommendation in first 2 sentences
- Client specificity (25%): References client context, not generic advice
- Evidence basis (20%): Claims supported by data or framework reference
- Actionability (20%): Clear next steps with owners and timelines
- Tone (10%): Executive-ready, no hedging`,

  'competitor-analysis': `Rubric for Competitor Analysis:
- BLUF compliance (20%): Key competitive insight stated first
- Evidence density (25%): Claims tied to specific sources or data
- Strategic implications (25%): At least 2 implications for Hatching Solutions positioning
- Competitor specificity (20%): Named competitors with specific activities
- Actionability (10%): At least one recommended response`,
};

// --- Main function ---

export async function evaluateQuality(input: QualityGateInput): Promise<QualityGateResult> {
  const { content, documentType, context } = input;
  const rubric = RUBRICS[documentType];

  const systemPrompt = 'You are a federal consulting quality reviewer for Hatching Solutions. Evaluate documents against rubrics with precision. Return only valid JSON.';

  const prompt = `Evaluate the following ${documentType} against the federal quality gate rubric.

${rubric}

${context?.clientName ? `Client: ${context.clientName}` : ''}
${context?.opportunityType ? `Opportunity: ${context.opportunityType}` : ''}

Document to review:
---
${content.slice(0, 12000)}
---

Score each dimension (0-100) and provide:
1. Dimension scores with brief justification
2. Composite score (0-100) and grade (A=90-100, B=75-89, C=60-74, D=40-59, F=0-39)
3. Specific issues found (category, severity: critical/major/minor, description, location in document)
4. Ordered recommendations for improvement

Additional checks:
- Flag any hedging language ("might possibly", "perhaps could", "it seems like")
- Flag unsubstantiated claims (assertions without evidence or source)
- Flag undefined jargon on first use
- Flag if output is >20% above typical length for this document type

Return ONLY valid JSON matching this schema:
{
  "grade": "B",
  "score": 82,
  "readyForDelivery": true,
  "issues": [{ "category": "evidence", "severity": "minor", "description": "...", "location": "paragraph 3" }],
  "recommendations": ["Add source citation for the DCSA claim in paragraph 3"]
}`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured.');

    const client = new Anthropic({ apiKey });
    const model = 'claude-sonnet-4-6';

    const response = await trackClaudeCall(
      'intelligence-dashboard',
      'federal-quality-gate',
      model,
      () => client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    );

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

    const grade = validateGrade(parsed.grade);
    const score = Math.min(100, Math.max(0, parsed.score ?? 0));

    return {
      grade,
      score,
      readyForDelivery: grade === 'A' || grade === 'B',
      issues: (Array.isArray(parsed.issues) ? parsed.issues : [])
        .filter((i: Record<string, unknown>) => i.category && i.severity && i.description)
        .map((i: Record<string, unknown>) => ({
          category: String(i.category),
          severity: ['critical', 'major', 'minor'].includes(String(i.severity)) ? String(i.severity) as 'critical' | 'major' | 'minor' : 'minor',
          description: String(i.description),
          location: String(i.location || 'N/A'),
        })),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    };
  } catch (err) {
    console.error('[federal-quality-gate] Evaluation failed:', err);
    // On failure, return conservative result — do not auto-approve
    return {
      grade: 'C',
      score: 60,
      readyForDelivery: false,
      issues: [{ category: 'system', severity: 'critical' as const, description: 'Quality gate evaluation failed — manual review required.', location: 'N/A' }],
      recommendations: ['Quality gate could not evaluate — manual review required.'],
    };
  }
}

function validateGrade(value: string): Grade {
  const valid = new Set(['A', 'B', 'C', 'D', 'F']);
  return valid.has(value) ? (value as Grade) : 'C';
}
