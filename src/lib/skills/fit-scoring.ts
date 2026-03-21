/**
 * Skill: Fit Scoring (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/intelligence-dashboard/fit-scoring.skill.md
 *
 * Scores Federal procurement opportunities 0–100 across 4 dimensions:
 * NAICS alignment (40), set-aside eligibility (25), keyword relevance (25),
 * contract value fit (10). Pure function — no API calls, no side effects.
 */

// --- Hatching Solutions NAICS codes ---

const PRIMARY_NAICS = ['541611', '541612', '541613', '541614', '611430'];

// Adjacent = same 4-digit prefix as any primary code
const ADJACENT_PREFIXES = [...new Set(PRIMARY_NAICS.map((n) => n.slice(0, 4)))];

// --- 25 relevance keywords (1 point each) ---

const KEYWORDS = [
  'organizational development', 'od', 'change management', 'leadership development',
  'workforce development', 'human capital', 'organizational effectiveness', 'culture',
  'facilitation', 'strategic planning', 'performance management', 'talent management',
  'learning and development', 'l&d', 'training', 'coaching', 'team effectiveness',
  'dcsa', 'federal workforce', 'consulting', 'assessment', 'intervention',
  'transformation', 'capacity building', 'stakeholder engagement',
];

// --- Types ---

export interface OpportunityInput {
  naicsCode: string;
  setAside: string | null;
  title: string;
  description: string;
  awardAmount: number | null;
  responseDeadline: string;
  agency: string;
  type: 'solicitation' | 'award' | 'presolicitation' | string;
}

export interface FitScoreResult {
  fitScore: number;
  scoreBreakdown: {
    naicsScore: number;
    setAsideScore: number;
    keywordScore: number;
    valueScore: number;
  };
  pursuitRecommendation: 'pursue' | 'monitor' | 'pass';
  flags: string[];
}

// --- Scoring function ---

export function calculateFitScore(opportunity: OpportunityInput): FitScoreResult {
  const text = `${opportunity.title} ${opportunity.description}`.toLowerCase();
  const flags: string[] = [];

  // 1. NAICS Alignment (40 pts)
  let naicsScore = 0;
  if (PRIMARY_NAICS.includes(opportunity.naicsCode)) {
    naicsScore = 40;
  } else if (ADJACENT_PREFIXES.some((p) => opportunity.naicsCode.startsWith(p))) {
    naicsScore = 20;
  } else {
    flags.push('naics_mismatch');
  }

  // 2. Set-Aside Eligibility (25 pts)
  const setAside = (opportunity.setAside ?? '').toUpperCase();
  let setAsideScore = 0;

  if (setAside.includes('SDVOSB') || setAside.includes('SERVICE-DISABLED VETERAN')) {
    setAsideScore = 25;
    flags.push('sdvosb_eligible');
  } else if (setAside.includes('SMALL') || setAside.includes('SBP') || setAside.includes('SBA')) {
    setAsideScore = 15;
  } else if (setAside.includes('8(A)') || setAside.includes('8A') || setAside.includes('HUBZONE')) {
    setAsideScore = 10;
  } else if (setAside === '' || setAside === 'UNRESTRICTED' || setAside.includes('FULL AND OPEN')) {
    setAsideScore = 5;
  } else {
    // Set-aside exists but doesn't match any eligible category
    flags.push('ineligible_set_aside');
    setAsideScore = 0;
  }

  // 3. Keyword Relevance (25 pts — 1 per match, word-boundary aware)
  const keywordMatches = KEYWORDS.filter((kw) => {
    const pattern = new RegExp(`\\b${kw.replace(/[&]/g, '\\$&')}\\b`, 'i');
    return pattern.test(text);
  });
  const keywordScore = Math.min(keywordMatches.length, 25);

  // 4. Contract Value Fit (10 pts)
  const value = opportunity.awardAmount ?? 0;
  let valueScore = 0;
  if (value >= 250_000 && value <= 5_000_000) {
    valueScore = 10;
  } else if ((value >= 50_000 && value < 250_000) || (value > 5_000_000 && value <= 15_000_000)) {
    valueScore = 5;
  }
  // <50K or >15M or null → 0

  // --- Composite ---
  const fitScore = naicsScore + setAsideScore + keywordScore + valueScore;

  // --- Additional flags ---
  if (opportunity.responseDeadline) {
    const deadline = new Date(opportunity.responseDeadline);
    const daysUntil = (deadline.getTime() - Date.now()) / 86400000;
    if (daysUntil >= 0 && daysUntil <= 7) {
      flags.push('deadline_urgent');
    }
  }

  if (opportunity.type === 'award') {
    flags.push('award_not_solicitation');
  }

  // --- Recommendation ---
  const pursuitRecommendation: 'pursue' | 'monitor' | 'pass' =
    fitScore >= 75 ? 'pursue' : fitScore >= 50 ? 'monitor' : 'pass';

  return {
    fitScore,
    scoreBreakdown: { naicsScore, setAsideScore, keywordScore, valueScore },
    pursuitRecommendation,
    flags,
  };
}
