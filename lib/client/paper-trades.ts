import type { MarketType, PolymarketOpportunity, SetupReport } from "@/lib/shared/types";
import { safeJsonFetch } from "./safe-json-fetch";

export type PaperTradeOutcome = "open" | "win" | "loss" | "breakeven" | "skipped";

export type PaperTrade = {
  id: string;
  symbol: string;
  ticker: string;
  marketType: MarketType;
  createdAt: string;
  status: PaperTradeOutcome;
  score: number;
  confidence: string;
  catalystType: string;
  entryZone: string;
  stopLoss: string;
  target: string;
  riskLevel: string;
  holdingPeriod: string;
  finalResult: string;
  failureReason: string;
  notes: string;
};

const STORAGE_KEY = "market-intelligence-paper-trades";
const FEED_KEY = "market-intelligence-research-feed";

export type ResearchFeedItem = {
  id: string;
  timestamp: string;
  source: MarketType | "alert" | "cross-market";
  symbol: string;
  score: number;
  summary: string;
  status: "generated" | "approved" | "skipped" | "follow-up";
  paperTradeAction: string;
  followUpNeeded: string;
};

export function loadPaperTrades(): PaperTrade[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PaperTrade[]) : [];
  } catch {
    return [];
  }
}

export function savePaperTrades(trades: PaperTrade[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

export async function loadServerPaperTrades(): Promise<{ available: boolean; trades: PaperTrade[]; warning?: string }> {
  if (typeof window === "undefined") return { available: false, trades: [] };

  try {
    return await safeJsonFetch<{ available: boolean; trades: PaperTrade[]; warning?: string }>("/.netlify/functions/paper-trades");
  } catch (error) {
    return {
      available: false,
      trades: [],
      warning: error instanceof Error ? error.message : "Paper trade server storage is unavailable."
    };
  }
}

export async function saveServerPaperTrades(trades: PaperTrade[]): Promise<{ available: boolean; warning?: string }> {
  if (typeof window === "undefined") return { available: false };

  try {
    const payload = await safeJsonFetch<{ available: boolean; warning?: string }>("/.netlify/functions/paper-trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades })
    });
    return { available: payload.available, warning: payload.warning };
  } catch (error) {
    return {
      available: false,
      warning: error instanceof Error ? error.message : "Paper trade server storage is unavailable."
    };
  }
}

export function mergePaperTrades(localTrades: PaperTrade[], serverTrades: PaperTrade[]) {
  const merged = new Map<string, PaperTrade>();
  [...serverTrades, ...localTrades].forEach((trade) => merged.set(trade.id, trade));
  return [...merged.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function setupToPaperTrade(setup: SetupReport, status: PaperTradeOutcome = "open"): PaperTrade {
  return {
    id: `${setup.ticker}-${Date.now()}`,
    symbol: setup.ticker,
    ticker: setup.ticker,
    marketType: "stock",
    createdAt: new Date().toISOString(),
    status,
    score: setup.score,
    confidence: setup.ai.confidence,
    catalystType: setup.news.length ? "company news" : "price action",
    entryZone: setup.ai.entryZone,
    stopLoss: setup.ai.stopLoss,
    target: setup.ai.target,
    riskLevel: setup.riskLevel,
    holdingPeriod: "unmarked",
    finalResult: "unmarked",
    failureReason: "",
    notes: status === "skipped" ? setup.ai.whyToSkip : ""
  };
}

export function polymarketToPaperTrade(market: PolymarketOpportunity, status: PaperTradeOutcome = "open"): PaperTrade {
  return {
    id: `${market.id}-${Date.now()}`,
    symbol: market.question,
    ticker: market.slug,
    marketType: "polymarket",
    createdAt: new Date().toISOString(),
    status,
    score: market.score,
    confidence: market.confidence,
    catalystType: market.category,
    entryZone: market.currentConsensus,
    stopLoss: market.invalidation,
    target: market.whatWouldMoveIt[0] ?? "Track next verified catalyst.",
    riskLevel: market.riskLevel,
    holdingPeriod: market.timeRemainingDays === null ? "unknown" : `${market.timeRemainingDays} days to resolution`,
    finalResult: "unmarked",
    failureReason: "",
    notes: status === "skipped" ? market.whyToSkip : market.riskFlags.probableTrap
  };
}

export function loadResearchFeed(): ResearchFeedItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(FEED_KEY);
    return raw ? (JSON.parse(raw) as ResearchFeedItem[]) : [];
  } catch {
    return [];
  }
}

export function saveResearchFeed(items: ResearchFeedItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FEED_KEY, JSON.stringify(items.slice(0, 200)));
}

export function analyzePaperTrades(trades: PaperTrade[]) {
  const completed = trades.filter((trade) => ["win", "loss", "breakeven"].includes(trade.status));
  const wins = completed.filter((trade) => trade.status === "win");
  const byType = (marketType: MarketType) => {
    const typed = completed.filter((trade) => trade.marketType === marketType);
    const typedWins = typed.filter((trade) => trade.status === "win");
    return typed.length ? Math.round((typedWins.length / typed.length) * 100) : 0;
  };
  const bucket = (min: number, max: number) => {
    const bucketTrades = completed.filter((trade) => trade.score >= min && trade.score <= max);
    const bucketWins = bucketTrades.filter((trade) => trade.status === "win");
    return bucketTrades.length ? Math.round((bucketWins.length / bucketTrades.length) * 100) : 0;
  };

  const catalystCounts = trades.reduce<Record<string, number>>((acc, trade) => {
    acc[trade.catalystType] = (acc[trade.catalystType] ?? 0) + 1;
    return acc;
  }, {});

  const failureCounts = completed.reduce<Record<string, number>>((acc, trade) => {
    if (trade.failureReason) acc[trade.failureReason] = (acc[trade.failureReason] ?? 0) + 1;
    return acc;
  }, {});
  const catalystPerformance = completed.reduce<Record<string, { total: number; wins: number }>>((acc, trade) => {
    acc[trade.catalystType] = acc[trade.catalystType] ?? { total: 0, wins: 0 };
    acc[trade.catalystType].total += 1;
    if (trade.status === "win") acc[trade.catalystType].wins += 1;
    return acc;
  }, {});
  const rankedCatalysts = Object.entries(catalystPerformance)
    .map(([name, value]) => ({
      name,
      winRate: value.total ? Math.round((value.wins / value.total) * 100) : 0,
      total: value.total
    }))
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total);
  const highConfidenceCompleted = completed.filter((trade) => trade.confidence === "high");
  const highConfidenceLosses = highConfidenceCompleted.filter((trade) => trade.status === "loss");

  return {
    totalIdeas: trades.length,
    approved: trades.filter((trade) => trade.status !== "skipped").length,
    skipped: trades.filter((trade) => trade.status === "skipped").length,
    open: trades.filter((trade) => trade.status === "open").length,
    winRate: completed.length ? Math.round((wins.length / completed.length) * 100) : 0,
    winRateByMarketType: {
      stock: byType("stock"),
      polymarket: byType("polymarket")
    },
    winRateByScoreBucket: {
      "55-69": bucket(55, 69),
      "70-84": bucket(70, 84),
      "85-100": bucket(85, 100)
    },
    catalystCounts,
    winRateByCatalystType: Object.fromEntries(rankedCatalysts.map((item) => [item.name, item.winRate])),
    bestPerformingCategory: rankedCatalysts[0]?.name ?? "n/a",
    worstPerformingCategory: rankedCatalysts.at(-1)?.name ?? "n/a",
    commonFailureReasons: failureCounts,
    mostCommonFailureReason: Object.entries(failureCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a",
    overconfidenceWarning:
      highConfidenceCompleted.length >= 3 && highConfidenceLosses.length / highConfidenceCompleted.length > 0.5
        ? "High-confidence ideas are losing more than half the time. Lower size, tighten filters, and review catalyst quality."
        : "No overconfidence warning yet.",
    averageConfidenceWinners:
      wins.length === 0
        ? "n/a"
        : wins.filter((trade) => trade.confidence === "high").length >= wins.length / 2
          ? "high"
          : "mixed"
  };
}
