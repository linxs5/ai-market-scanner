import type {
  LearningAnalytics,
  OpportunityEngineResponse,
  RecommendationLedgerItem,
  RecommendationStatus,
  SavedDailyReport,
  UnifiedOpportunity
} from "@/lib/shared/types";
import { getBlobStore } from "./blob-storage";

const LEDGER_KEY = "recommendation-ledger";

function store() {
  return getBlobStore("market-intelligence-recommendation-ledger");
}

function now() {
  return new Date().toISOString();
}

function normalizeRecommendation(label: string, marketType: "stock" | "polymarket"): RecommendationLedgerItem["recommendation"] {
  const value = label.toLowerCase();
  if (value.includes("avoid")) return "AVOID";
  if (value.includes("skip")) return "SKIP";
  if (value.includes("yes")) return "PAPER_YES";
  if (value.includes("no")) return "PAPER_NO";
  if (value.includes("paper")) return "PAPER_TRADE";
  return marketType === "polymarket" ? "WATCH" : "WATCH";
}

function scoreBucket(score: number) {
  if (score >= 85) return "85-100";
  if (score >= 70) return "70-84";
  if (score >= 55) return "55-69";
  return "0-54";
}

function learningAdjustmentFor(opportunity: UnifiedOpportunity, existing: RecommendationLedgerItem[]) {
  const similar = existing.filter((item) => item.catalystType === opportunity.catalyst.type || item.strategyTags.includes(opportunity.catalyst.type));
  const completed = similar.filter((item) => ["target_hit", "stopped_out", "expired", "manually_closed"].includes(item.status));
  const wins = completed.filter((item) => item.status === "target_hit" || Number(item.resultPct ?? 0) > 0);
  if (completed.length < 3) {
    return {
      learningAdjustment: 0,
      learningAdjustmentReason: "Learning adjustment: 0 because there is not enough history for this setup type yet."
    };
  }
  const winRate = wins.length / completed.length;
  if (winRate >= 0.67) {
    return {
      learningAdjustment: 8,
      learningAdjustmentReason: `Learning adjustment: +8 because similar ${opportunity.catalyst.type} setups worked ${wins.length} of last ${completed.length} times.`
    };
  }
  if (winRate <= 0.34) {
    return {
      learningAdjustment: -8,
      learningAdjustmentReason: `Learning adjustment: -8 because similar ${opportunity.catalyst.type} setups recently failed ${completed.length - wins.length} of ${completed.length} times. Needs confirmation.`
    };
  }
  return {
    learningAdjustment: 0,
    learningAdjustmentReason: "Learning adjustment: 0 because similar setup history is mixed."
  };
}

export function recommendationFromOpportunity(
  opportunity: UnifiedOpportunity,
  existing: RecommendationLedgerItem[] = []
): RecommendationLedgerItem {
  const marketType = opportunity.marketType;
  const tradeCategory = marketType === "polymarket" ? "POLYMARKET" : opportunity.actionPlan.decisionLabel === "Watch" ? "LONG_TERM" : "DAY_TRADE";
  const learning = learningAdjustmentFor(opportunity, existing);
  return {
    id: `${opportunity.id}-${opportunity.source}`,
    createdAt: now(),
    marketType,
    tradeCategory,
    tickerOrMarket: opportunity.symbol,
    title: opportunity.title,
    recommendation: normalizeRecommendation(opportunity.actionPlan.decisionLabel, marketType),
    entryZone: opportunity.actionPlan.manualChecklist.find((item) => item.toLowerCase().includes("entry") || item.toLowerCase().includes("price")) ?? opportunity.current,
    stopOrInvalidation: opportunity.invalidation,
    target1: opportunity.actionPlan.whenToExit,
    target2: opportunity.bullCase,
    currentPriceOrOddsAtRecommendation: opportunity.current,
    confidence: opportunity.confidence,
    riskLevel: opportunity.riskLevel,
    catalystType: opportunity.catalyst.type,
    signalTypes: [opportunity.source, opportunity.catalyst.type, opportunity.riskLevel],
    strategyTags: [tradeCategory, opportunity.actionPlan.badge, ...opportunity.catalystBadges],
    sourceDataUsed: [opportunity.source, "opportunity-engine", "beginner-action-plan"],
    beginnerThesis: opportunity.actionPlan.plainEnglish.whatThisMeans,
    whyNow: opportunity.actionPlan.plainEnglish.whyItMattersToday,
    whySkip: opportunity.skipReason,
    maxRisk: "$2-$5",
    status: "recommended",
    userActuallyEntered: "unknown",
    userEntryPrice: "",
    userPositionSize: "",
    userNotes: "",
    finalOutcome: "",
    resultPct: null,
    lessonLearned: "",
    ...learning,
    lastCheckedAt: null,
    lastAlertedStatus: null
  };
}

export function recommendationsFromEngine(engine: OpportunityEngineResponse, existing: RecommendationLedgerItem[] = []) {
  return engine.opportunities.slice(0, 20).map((opportunity) => recommendationFromOpportunity(opportunity, existing));
}

export function recommendationsFromReport(report: SavedDailyReport, existing: RecommendationLedgerItem[] = []) {
  const reportRecommendations: RecommendationLedgerItem[] = [];
  report.topDayTradeIdeas.forEach((idea) => {
    reportRecommendations.push({
      id: `${report.id}-${idea.id}`,
      createdAt: report.timestamp,
      marketType: "stock",
      tradeCategory: "DAY_TRADE",
      tickerOrMarket: idea.symbol,
      title: idea.title,
      recommendation: idea.actionLabel.toLowerCase().includes("paper") ? "PAPER_TRADE" : idea.actionLabel.toLowerCase().includes("avoid") ? "AVOID" : "WATCH",
      entryZone: idea.entryZone,
      stopOrInvalidation: idea.stopInvalidation,
      target1: idea.target,
      target2: idea.watchNext[0] ?? idea.target,
      currentPriceOrOddsAtRecommendation: idea.current,
      confidence: "medium",
      riskLevel: "medium",
      catalystType: "price-action",
      signalTypes: ["daily-playbook", "day-trade"],
      strategyTags: ["DAY_TRADE"],
      sourceDataUsed: ["saved-report"],
      beginnerThesis: idea.reason,
      whyNow: idea.reason,
      whySkip: idea.doNotTouchIf.join(" "),
      maxRisk: "$2-$5",
      status: "recommended",
      userActuallyEntered: "unknown",
      userEntryPrice: "",
      userPositionSize: "",
      userNotes: "",
      finalOutcome: "",
      resultPct: null,
      lessonLearned: "",
      ...learningAdjustmentFor(
        {
          id: idea.id,
          marketType: "stock",
          title: idea.title,
          symbol: idea.symbol,
          current: idea.current,
          score: 65,
          attentionPriority: 65,
          scoreBreakdown: {},
          catalyst: { type: "finance", sourceQuality: "medium", whyItMatters: idea.reason, whatWouldMoveTheMarket: [], invalidation: idea.stopInvalidation },
          bullCase: idea.target,
          bearCase: idea.riskNote ?? "",
          trap: idea.doNotTouchIf.join(" "),
          invalidation: idea.stopInvalidation,
          monitorNext: idea.watchNext,
          riskLevel: "medium",
          confidence: "medium",
          dataConfidence: "medium",
          catalystBadges: [],
          suggestedPaperAction: idea.actionLabel,
          skipReason: idea.doNotTouchIf.join(" "),
          actionPlan: {
            marketType: "stock",
            decisionLabel: "Watch",
            badge: "Needs Research",
            plainEnglish: { whatThisMeans: idea.reason, whyItMattersToday: idea.reason, whyThisCouldStillFail: idea.riskNote ?? "" },
            manualChecklist: idea.robinhoodSteps,
            riskTranslation: "Max paper risk $2-$5.",
            doNotTouchIf: idea.doNotTouchIf,
            maxPaperRisk: "$2-$5",
            suggestedPaperPositionSize: "$10-$20 paper position for a $100 account.",
            whenToExit: idea.target,
            whenToSkipCompletely: idea.doNotTouchIf.join(" "),
            telegramSummary: { whatItIs: idea.title, whyItMatters: idea.reason, whatToCheck: idea.watchNext, whyToSkip: idea.doNotTouchIf.join(" ") }
          },
          source: "stock-scan"
        },
        existing
      ),
      lastCheckedAt: null,
      lastAlertedStatus: null
    });
  });
  return reportRecommendations;
}

export async function loadRecommendationLedger() {
  const recommendations = ((await store().get(LEDGER_KEY, { type: "json" })) ?? []) as RecommendationLedgerItem[];
  return recommendations;
}

export async function saveRecommendationLedger(recommendations: RecommendationLedgerItem[]) {
  const deduped = [...recommendations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 500);
  await store().setJSON(LEDGER_KEY, deduped);
  return deduped;
}

export async function appendRecommendations(recommendations: RecommendationLedgerItem[]) {
  const existing = await loadRecommendationLedger();
  return saveRecommendationLedger([...recommendations, ...existing]);
}

export async function updateRecommendation(id: string, update: Partial<RecommendationLedgerItem>) {
  const existing = await loadRecommendationLedger();
  return saveRecommendationLedger(existing.map((item) => (item.id === id ? { ...item, ...update } : item)));
}

function winRate(items: RecommendationLedgerItem[]) {
  const completed = items.filter((item) => ["target_hit", "stopped_out", "expired", "manually_closed"].includes(item.status));
  if (!completed.length) return 0;
  const wins = completed.filter((item) => item.status === "target_hit" || Number(item.resultPct ?? 0) > 0);
  return Math.round((wins.length / completed.length) * 100);
}

function ratesBy(items: RecommendationLedgerItem[], key: (item: RecommendationLedgerItem) => string[]) {
  const groups = new Map<string, RecommendationLedgerItem[]>();
  items.forEach((item) => {
    key(item).forEach((value) => groups.set(value, [...(groups.get(value) ?? []), item]));
  });
  return Object.fromEntries([...groups.entries()].map(([name, values]) => [name, winRate(values)]));
}

export function analyzeRecommendationLedger(recommendations: RecommendationLedgerItem[]): LearningAnalytics {
  const winRateBySignalType = ratesBy(recommendations, (item) => item.signalTypes);
  const winRateByCatalystType = ratesBy(recommendations, (item) => [item.catalystType]);
  const entries = Object.entries(winRateBySignalType).sort((a, b) => b[1] - a[1]);
  const missedWinners = recommendations.filter((item) => item.userActuallyEntered === "no" && item.status === "target_hit").length;
  const avoidedLosers = recommendations.filter((item) => ["SKIP", "AVOID"].includes(item.recommendation) && item.status === "stopped_out").length;
  return {
    totalRecommendations: recommendations.length,
    winRateByCategory: ratesBy(recommendations, (item) => [item.tradeCategory]),
    winRateBySignalType,
    winRateByCatalystType,
    winRateByScoreBucket: ratesBy(recommendations, (item) => [scoreBucket(Number(item.resultPct ?? 65))]),
    averageResultByConfidence: Object.fromEntries(
      ["low", "medium", "high"].map((confidence) => {
        const values = recommendations.filter((item) => item.confidence === confidence && item.resultPct !== null);
        return [confidence, values.length ? Math.round(values.reduce((sum, item) => sum + Number(item.resultPct), 0) / values.length) : 0];
      })
    ),
    bestPerformingSetupType: entries[0]?.[0] ?? "n/a",
    worstPerformingSetupType: entries.at(-1)?.[0] ?? "n/a",
    missedWinners,
    avoidedLosers,
    overconfidenceWarning:
      recommendations.filter((item) => item.confidence === "high" && item.status === "stopped_out").length >= 2
        ? "High-confidence ideas have recent losses. Lower confidence until confirmation improves."
        : "No overconfidence warning yet.",
    systemGoodAt: entries[0] ? `The system has been good at ${entries[0][0]} setups.` : "The system needs more completed outcomes.",
    systemBadAt: entries.at(-1) ? `The system has been bad at ${entries.at(-1)?.[0]} setups.` : "The system needs more completed outcomes."
  };
}
