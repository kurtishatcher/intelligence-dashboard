export const mockBrief = {
  brief_date: '2026-03-13',
  content: `# Daily Intelligence Brief — March 13, 2026

## Priority Alerts

**KPMG acquired ChangePro Consulting** (Mar 10) — 45-person change management boutique, $28M revenue. This is a direct competitive signal: KPMG is buying capabilities rather than building them in the Federal change management space. Watch for accelerated KPMG bids on OD/CM contracts in the next 60 days.

**BCG opened a Federal Advisory Practice in DC** (Mar 3) — Hiring 200+ consultants. BCG has historically avoided Federal work. This entry signals they see enough margin and volume in Federal OD/leadership to justify a dedicated office. New competitor in your primary market.

---

## Top Federal Opportunities

| Opportunity | Agency | Value | Deadline | Fit Score |
|---|---|---|---|---|
| Leadership Development Program for SES | OPM | $1.2M | Apr 1 | **95** |
| OD and Change Management Support | DoD/OSD | $4.5M | Apr 15 | **92** |
| Executive Coaching — Navy | NETC | $980K | May 1 | **90** |
| Workforce Transformation Advisory | VA/VHA | $2.8M | Mar 28 | **88** |
| Multi-Agency Facilitation Services | OMB | $550K | Apr 18 | **87** |

**Action required:** The VA workforce transformation opportunity (SDVOSB set-aside, $2.8M) has a Mar 28 deadline — 15 days out. Decision needed this week on whether to pursue.

**Sources Sought alert:** Army KM Strategy and Implementation ($3.2M) posted yesterday. This aligns directly with KITE framework expertise. Respond to sources sought to position for the eventual solicitation.

---

## Competitor Activity Summary

| Firm | Recent Moves | Threat Level |
|---|---|---|
| **Deloitte** | AI Workforce Accelerator launch; $12B HC revenue | High — dominant and accelerating |
| **McKinsey** | OrgHealth 3.0 framework; Federal practice expansion | Medium — thought leadership threat |
| **PwC** | CM-as-a-Service platform; 18% revenue growth | Medium — productizing OD delivery |
| **EY** | Pivoting to "Human-AI Teaming" brand | Medium — repackaging, watch pricing |
| **Accenture** | LearnVantage platform; $3.8B Federal Q1 | High — scale + technology advantage |
| **KPMG** | ChangePro acquisition; Federal Leadership Academy | Rising — aggressive Federal expansion |
| **BCG** | DC Federal office; AI/org research papers | Rising — new Federal market entrant |

---

## Market Signals

1. **AI-augmented OD is now table stakes.** Three of seven competitors launched AI-powered OD platforms or services in Q1 2026. Firms without AI integration in their OD delivery are being positioned as legacy providers.

2. **Federal OD spending is accelerating.** Contract awards in OD/leadership NAICS codes up 22% YoY. Driven by workforce modernization mandates and AI adoption requirements across agencies.

3. **Boutique acquisition wave.** KPMG's ChangePro acquisition follows Deloitte's 2025 acquisition of two leadership development firms. Big firms are buying boutique capabilities — both a threat (fewer partners) and a signal (validates the market).

---

## Recommended Actions

1. **Respond to Army KM Sources Sought** (SAM-2026-OD-007) this week — direct KITE framework alignment
2. **Decision on VA SDVOSB opportunity** (SAM-2026-OD-003) by end of week — $2.8M, 15-day deadline
3. **Monitor KPMG Federal activity** closely for next 60 days post-acquisition
4. **Position AI-augmented delivery** in all upcoming proposals — market is moving fast
5. **Track BCG DC hiring** — their job postings will signal which Federal OD segments they're targeting`,
  highlights: [
    { text: 'KPMG acquired ChangePro Consulting — signals aggressive Federal CM expansion', priority: 'critical' },
    { text: 'BCG opened Federal Advisory Practice in DC — new competitor in Federal OD', priority: 'critical' },
    { text: 'OPM SES Leadership Development — $1.2M, 95 fit score, Apr 1 deadline', priority: 'high' },
    { text: 'Army KM Sources Sought — direct KITE alignment, respond this week', priority: 'high' },
    { text: 'VA SDVOSB opportunity — $2.8M, decision needed by end of week', priority: 'high' },
  ],
  competitor_mentions: {
    'Deloitte': 3,
    'McKinsey & Company': 2,
    'PwC': 2,
    'EY': 1,
    'Accenture': 2,
    'KPMG': 3,
    'BCG': 3,
  },
  federal_highlights: {
    total_opportunities: 12,
    high_fit_count: 5,
    total_pipeline_value: 18625000,
    nearest_deadline: '2026-03-25',
    sdvosb_opportunities: 2,
  },
  generated_by: 'claude',
};
