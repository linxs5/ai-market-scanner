import type { LearningAnalytics, RecommendationLedgerItem, RecommendationLedgerResponse } from "@/lib/shared/types";

const LEDGER_KEY = "market-intelligence-recommendation-ledger";

export function loadLocalRecommendationLedger(): RecommendationLedgerItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as RecommendationLedgerItem[]) : [];
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
  return {
    totalRecommendations: items.length,
    winRateByCategory: by((item) => [item.tradeCategory]),
    winRateBySignalType: signalRates,
    winRateByCatalystType: by((item) => [item.catalystType]),
    winRateByScoreBucket: by(() => ["tracked"]),
    averageResultByConfidence: Object.fromEntries(["low", "medium", "high"].map((level) => [level, 0])),
    bestPerformingSetupType: ranked[0]?.[0] ?? "n/a",
    worstPerformingSetupType: ranked.at(-1)?.[0] ?? "n/a",
    missedWinners: items.filter((item) => item.userActuallyEntered === "no" && item.status === "target_hit").length,
    avoidedLosers: items.filter((item) => ["SKIP", "AVOID"].includes(item.recommendation) && item.status === "stopped_out").length,
    overconfidenceWarning: wins.length < completed.length / 2 && completed.length >= 3 ? "Recent completed ideas are underperforming. Require stronger confirmation." : "No overconfidence warning yet.",
    systemGoodAt: ranked[0] ? `The system has been good at ${ranked[0][0]}.` : "The system needs more outcomes.",
    systemBadAt: ranked.at(-1) ? `The system has been bad at ${ranked.at(-1)?.[0]}.` : "The system needs more outcomes."
  };
}

export async function loadServerRecommendationLedger(): Promise<RecommendationLedgerResponse & { analytics: LearningAnalytics }> {
  try {
    const response = await fetch("/.netlify/functions/recommendation-ledger");
    if (!response.ok) throw new Error("Recommendation ledger fetch failed.");
    return (await response.json()) as RecommendationLedgerResponse & { analytics: LearningAnalytics };
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
    const response = await fetch("/.netlify/functions/recommendation-ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update: { id, update } })
    });
    if (!response.ok) throw new Error("Recommendation ledger update failed.");
    const payload = (await response.json()) as RecommendationLedgerResponse & { analytics: LearningAnalytics };
    saveLocalRecommendationLedger(payload.recommendations);
    return payload;
  } catch {
    return {
      ok: false,
      storageSource: "local fallback" as const,
      recommendations: local,
      analytics: analyzeLocalRecommendationLedger(local)
    };
  }
}
