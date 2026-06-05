import type { LearningAnalytics, RecommendationLedgerItem, RecommendationLedgerResponse } from "@/lib/shared/types";
import { safeJsonFetch } from "./safe-json-fetch";

const LEDGER_KEY = "market-intelligence-recommendation-ledger";

function normalizeItem(item: RecommendationLedgerItem): RecommendationLedgerItem {
  const directExecutionPlan =
    item.directExecutionPlan ?? {
      label: item.recommendation === "AVOID" ? "AVOID" : item.recommendation === "SKIP" ? "SKIP" : item.marketType === "polymarket" ? "POLYMARKET BINARY RISK" : "WATCH ONLY",
      category: item.marketType === "polymarket" ? "POLYMARKET" : item.tradeCategory === "LONG_TERM" ? "LONG-TERM INVESTING" : "DAY TRADE - SHARES",
      direction: item.recommendation === "PAPER_YES" ? "PAPER YES" : item.recommendation === "PAPER_NO" ? "PAPER NO" : item.recommendation === "PAPER_TRADE" ? "LONG WATCH" : "WATCH",
      currentPriceOrOdds: item.currentPriceOrOddsAtRecommendation,
      entryZone: item.entryZone,
      stopOrInvalidation: item.stopOrInvalidation,
      target1: item.target1,
      target2: item.target2,
      maxPaperRisk: "$2-$5" as const,
      suggestedPaperPositionSize: "Risk only $2-$5 while paper-tracking.",
      timeHorizon: item.tradeCategory === "DAY_TRADE" ? "Same day watch." : item.tradeCategory === "POLYMARKET" ? "Until the catalyst resolves." : "Longer-term watchlist.",
      plainEnglish: item.beginnerThesis,
      robinhoodSteps: ["Open Robinhood.", `Search ${item.tickerOrMarket}.`, "Use limit order only if manually trading.", "Click 'I entered this' in the app if paper-tracking."],
      polymarketSteps: ["Open Polymarket.", `Search ${item.title}.`, "Read rules first.", "Click 'I entered this' in the app if paper-tracking."],
      optionsUnavailableMessage: "Options Watch unavailable - options chain data source not connected.",
      warnings: ["Manual approval only. No real auto-trading."]
    };
  return {
    ...item,
    executionReadinessScore: item.executionReadinessScore ?? 0,
    autoPaperEligible: item.autoPaperEligible ?? false,
    reasonNotEligible: item.reasonNotEligible ?? "Saved before execution readiness scoring existed.",
    executionPlanQuality: item.executionPlanQuality ?? "weak",
    directExecutionPlan,
    autoPaperTrade: item.autoPaperTrade ?? null
  };
}

export function loadLocalRecommendationLedger(): RecommendationLedgerItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as RecommendationLedgerItem[]).map(normalizeItem) : [];
  } catch {
    return [];
  }
}

export function saveLocalRecommendationLedger(items: RecommendationLedgerItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEDGER_KEY, JSON.stringify(items.slice(0, 500)));
}

export function analyzeLocalRecommendationLedger(items: RecommendationLedgerItem[]): LearningAnalytics {
  const completed = items.filter((item) => ["target_hit", "stopped_out", "expired", "manually_closed"].includes(item.status));
  const wins = completed.filter((item) => item.status === "target_hit" || Number(item.resultPct ?? 0) > 0);
  const rate = (group: RecommendationLedgerItem[]) => {
    const done = group.filter((item) => ["target_hit", "stopped_out", "expired", "manually_closed"].includes(item.status));
    if (!done.length) return 0;
    return Math.round((done.filter((item) => item.status === "target_hit" || Number(item.resultPct ?? 0) > 0).length / done.length) * 100);
  };
  const by = (key: (item: RecommendationLedgerItem) => string[]) => {
    const groups = new Map<string, RecommendationLedgerItem[]>();
    items.forEach((item) => key(item).forEach((value) => groups.set(value, [...(groups.get(value) ?? []), item])));
    return Object.fromEntries([...groups.entries()].map(([name, values]) => [name, rate(values)]));
  };
  const signalRates = by((item) => item.signalTypes);
  const ranked = Object.entries(signalRates).sort((a, b) => b[1] - a[1]);
  const categoryRates = by((item) => [item.tradeCategory]);
  const rankedCategories = Object.entries(categoryRates).sort((a, b) => b[1] - a[1]);
  return {
    totalRecommendations: items.length,
    winRateByCategory: categoryRates,
    winRateBySignalType: signalRates,
    winRateByCatalystType: by((item) => [item.catalystType]),
    winRateByScoreBucket: by(() => ["tracked"]),
    averageResultByConfidence: Object.fromEntries(["low", "medium", "high"].map((level) => [level, 0])),
    bestPerformingSetupType: ranked[0]?.[0] ?? "n/a",
    worstPerformingSetupType: ranked.at(-1)?.[0] ?? "n/a",
    missedWinners: items.filter((item) => item.userActuallyEntered === "no" && item.status === "target_hit").length,
    avoidedLosers: items.filter((item) => ["SKIP", "AVOID"].includes(item.recommendation) && item.status === "stopped_out").length,
    autoPaperWinRate: rate(items.filter((item) => item.autoPaperTrade)),
    userEnteredWinRate: rate(items.filter((item) => item.userActuallyEntered === "yes")),
    skippedWinnerCount: items.filter((item) => item.status === "missed_winner" || (item.userActuallyEntered === "no" && item.status === "target_hit")).length,
    avoidedLoserCount: items.filter((item) => item.status === "good_skip" || (["SKIP", "AVOID"].includes(item.recommendation) && item.status === "stopped_out")).length,
    bestSignalType: ranked[0]?.[0] ?? "n/a",
    worstSignalType: ranked.at(-1)?.[0] ?? "n/a",
    bestCategory: rankedCategories[0]?.[0] ?? "n/a",
    recommendationsToStopMaking: ranked.filter(([, value]) => value > 0 && value < 40).map(([key, value]) => `${key}: ${value}% win rate. Require stronger confirmation.`),
    overconfidenceWarning: wins.length < completed.length / 2 && completed.length >= 3 ? "Recent completed ideas are underperforming. Require stronger confirmation." : "No overconfidence warning yet.",
    systemGoodAt: ranked[0] ? `The system has been good at ${ranked[0][0]}.` : "The system needs more outcomes.",
    systemBadAt: ranked.at(-1) ? `The system has been bad at ${ranked.at(-1)?.[0]}.` : "The system needs more outcomes."
  };
}

export async function loadServerRecommendationLedger(): Promise<RecommendationLedgerResponse & { analytics: LearningAnalytics }> {
  try {
    const payload = await safeJsonFetch<RecommendationLedgerResponse & { analytics: LearningAnalytics }>("/.netlify/functions/recommendation-ledger");
    return { ...payload, recommendations: payload.recommendations.map(normalizeItem) };
  } catch (error) {
    const recommendations = loadLocalRecommendationLedger();
    return {
      ok: false,
      storageSource: "local fallback",
      recommendations,
      analytics: analyzeLocalRecommendationLedger(recommendations),
      warning: error instanceof Error ? error.message : "Recommendation ledger server unavailable."
    };
  }
}

export async function saveRecommendationUpdate(id: string, update: Partial<RecommendationLedgerItem>) {
  const local = loadLocalRecommendationLedger().map((item) => (item.id === id ? { ...item, ...update } : item));
  saveLocalRecommendationLedger(local);
  try {
    const payload = await safeJsonFetch<RecommendationLedgerResponse & { analytics: LearningAnalytics }>("/.netlify/functions/recommendation-ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update: { id, update } })
    });
    const recommendations = payload.recommendations.map(normalizeItem);
    saveLocalRecommendationLedger(recommendations);
    return { ...payload, recommendations };
  } catch {
    return {
      ok: false,
      storageSource: "local fallback" as const,
      recommendations: local,
      analytics: analyzeLocalRecommendationLedger(local)
    };
  }
}
