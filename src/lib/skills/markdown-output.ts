/**
 * Skill: Markdown Output Formatting (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/cross-cutting/markdown-output.skill.md
 *
 * Provides formatting prompt suffix for generation prompts and a
 * post-generation validator for markdown output consistency.
 */

// --- Types ---

export type DocumentType = 'brief' | 'proposal' | 'research' | 'morning-briefing' | 'weekly-plan' | 'client-prep' | 'competitor-analysis';
export type BrandContext = 'hatching-solutions' | 'federal';

export interface MarkdownMetadata {
  wordCount: number;
  sectionCount: number;
  hasBluf: boolean;
  lengthStatus: 'within-target' | 'over' | 'under';
  h1Count: number;
  maxHeadingDepth: number;
}

// --- Length targets ---

const LENGTH_TARGETS: Record<DocumentType, { target: number; min: number; max: number }> = {
  'brief':               { target: 800,   min: 600,  max: 1200 },
  'proposal':            { target: 2000,  min: 1500, max: 3000 },
  'research':            { target: 1500,  min: 1000, max: 2500 },
  'morning-briefing':    { target: 600,   min: 400,  max: 900  },
  'weekly-plan':         { target: 500,   min: 300,  max: 800  },
  'client-prep':         { target: 700,   min: 500,  max: 1000 },
  'competitor-analysis': { target: 1000,  min: 700,  max: 1500 },
};

// --- Brand voice descriptions ---

const BRAND_VOICE: Record<BrandContext, string> = {
  'hatching-solutions': 'Active voice, practitioner-level directness, "we" for Hatching Solutions references, Oxford comma, specific over general.',
  'federal': 'Formal register, passive voice acceptable for regulatory citations, avoid colloquialisms, agency names in full on first use, acronyms defined on first use.',
};

// --- Prompt suffix generator ---

export function getFormattingPromptSuffix(
  documentType: DocumentType,
  brandContext: BrandContext = 'hatching-solutions',
): string {
  const { target } = LENGTH_TARGETS[documentType];
  const voice = BRAND_VOICE[brandContext];

  return `\n\nFormat your response as clean markdown following these rules:
- Single H1 title at the top
- H2 for major sections, H3 for subsections only
- First paragraph states the bottom line — no preamble
- Prose paragraphs for analysis; bullet lists only for action items and checklists
- Bold for key terms and critical numbers only
- Target length: ${target} words
- Voice: ${voice}
Do not include a preamble, do not restate the request, begin directly with the H1 title.`;
}

// --- Post-generation validator ---

export function validateMarkdownOutput(
  markdown: string,
  documentType: DocumentType,
): MarkdownMetadata {
  const words = markdown.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  const { min, max } = LENGTH_TARGETS[documentType];
  const lengthStatus: 'within-target' | 'over' | 'under' =
    wordCount > max ? 'over' : wordCount < min ? 'under' : 'within-target';

  // Count headings
  const lines = markdown.split('\n');
  let h1Count = 0;
  let sectionCount = 0;
  let maxHeadingDepth = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      if (depth === 1) h1Count++;
      if (depth <= 3) sectionCount++;
      if (depth > maxHeadingDepth) maxHeadingDepth = depth;
    }
  }

  // BLUF check — first non-empty, non-heading paragraph should be substantive (>20 words)
  let hasBluf = false;
  let foundTitle = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && trimmed.length > 0) {
      const paraWords = trimmed.split(/\s+/).length;
      hasBluf = paraWords >= 10; // Substantive first paragraph
      break;
    }
  }

  return {
    wordCount,
    sectionCount,
    hasBluf,
    lengthStatus,
    h1Count,
    maxHeadingDepth,
  };
}
