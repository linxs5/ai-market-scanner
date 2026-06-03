import type {
  IntelligenceReport,
  OpportunityEngineResponse,
  PolymarketOpportunity,
  ScanResponse,
  SetupReport,
  UnifiedOpportunity
} from "@/lib/shared/types";
import { classifyPolymarketCatalyst, classifyStockCatalyst } from "./catalysts";
import { buildCrossMarketInsights } from "./cross-market";
import { getSetupCheck } from "./env";
import { getEarningsWatch, getMacroRiskToday } from "./macro";
import { runPolymarketScan } from "./polymarket";
import { runMarketScan } from "./scan";

function stockDataConfidence(setup: SetupReport) {
  if (setup.news.length >= 2 && setup.quote.source) return "high";
  if (setup.news.length >= 1) return "medium";
  return "low";
}

function stockToOpportunity(setup: SetupReport): UnifiedOpportunity {
  const catalyst = classifyStockCatalyst(setup.news, setup.ai.catalyst);
  return {
    id: `stock-${setup.ticker}`,
    marketType: "stock",
    title: `${setup.ticker} stock research setup`,
    symbol: setup.ticker,
    current: `$${setup.quote.price.toFixed(2)} (${setup.quote.changePercent.toFixed(2)}%)`,
    score: setup.score,
    scoreBreakdown: setup.breakdown,
    catalyst,
    bullCase: setup.ai.bullCase,
    bearCase: setup.ai.bearCase,
    trap: setup.ai.whyToSkip,
    invalidation: setup.ai.invalidation,
    monitorNext: setup.ai.checkBeforeTrading,
    riskLevel: setup.riskLevel,
    confidence: setup.ai.confidence,
    dataConfidence: stockDataConfidence(setup),
    suggestedPaperAction: setup.ai.confidence === "low" ? "Skip or watch only." : "Paper-trade only after manual checklist passes.",
    skipReason: setup.ai.whyToSkip,
    source: "stock-scan"
  };
}

function polymarketToOpportunity(market: PolymarketOpportunity): UnifiedOpportunity {
  const catalyst = classifyPolymarketCatalyst(market);
  return {
    id: `polymarket-${market.id}`,
    marketType: "polymarket",
    title: market.question,
    symbol: market.slug,
    current: `${market.currentConsensus}${market.priceHistoryChange === null ? "" : ` · 1d history ${Math.round(market.priceHistoryChange * 100)} pts`}`,
    score: market.score,
    scoreBreakdown: market.scoreBreakdown,
    catalyst,
    bullCase: market.yesCase,
    bearCase: market.noCase,
    trap: market.riskFlags.probableTrap,
    invalidation: market.invalidation,
    monitorNext: market.whatToMonitor,
    riskLevel: market.riskLevel,
    confidence: market.confidence,
    dataConfidence: market.dataConfidence,
    suggestedPaperAction: market.confidence === "low" ? "Skip or monitor only." : "Paper-track thesis; no wallet or order placement.",
    skipReason: market.whyToSkip,
    source: "polymarket-scan"
  };
}

function makeReport(
  title: IntelligenceReport["title"],
  opportunities: UnifiedOpportunity[],
  topCrossMarketInsight: IntelligenceReport["topCrossMarketInsight"]
): IntelligenceReport {
  const topStocks = opportunities.filter((item) => item.marketType === "stock").slice(0, 3);
  const topPolymarket = opportunities.filter((item) => item.marketType === "polymarket").slice(0, 3);
  const highestRisk = opportunities.find((item) => item.riskLevel === "high");

  return {
    id: `${title.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
    title,
    generatedAt: new Date().toISOString(),
    topStocks,
    topPolymarket,
    topCrossMarketInsight,
    biggestRiskToday: highestRisk?.trap ?? "Missing data is the biggest risk. Do not force trades when catalyst quality is weak.",
    whatToIgnore: [
      "Low-liquidity markets with wide spreads.",
      "Stock moves with no fresh catalyst.",
      "Leaderboard chasing without knowing whether the odds already moved."
    ],
    monitorNext: [
      "Fresh headlines from primary sources.",
      "Polymarket spread plus 24h volume before paper tracking.",
      "Broad market regime before approving any stock idea."
    ],
    paperTradeIdeasOnly: [...topStocks, ...topPolymarket].map((item) => `${item.symbol}: ${item.suggestedPaperAction}`)
  };
}

export async function runOpportunityEngine(): Promise<OpportunityEngineResponse> {
  const warnings: string[] = [];
  const setup = getSetupCheck();
  let stockScan: ScanResponse | null = null;

  if (!setup.requiredMissing.length) {
    try {
      stockScan = await runMarketScan();
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Stock opportunity scan failed.");
    }
  } else {
    warnings.push(`Stock opportunity scan skipped; missing ${setup.requiredMissing.join(", ")}.`);
  }

  const polymarketScan = await runPolymarketScan();
  const crossMarketInsights = buildCrossMarketInsights(stockScan, polymarketScan);
  const stockOpportunities = stockScan?.setups.map(stockToOpportunity) ?? [];
  const polymarketOpportunities = polymarketScan.opportunities.map(polymarketToOpportunity);
  const opportunities = [...stockOpportunities, ...polymarketOpportunities].sort((a, b) => b.score - a.score);
  const topCrossMarketInsight = crossMarketInsights[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    disclaimer: "Research only. No auto-trading, no wallet connection, no private keys, and no guaranteed outcomes.",
    opportunities,
    stockScan,
    polymarketScan,
    crossMarketInsights,
    reports: [
      makeReport("Morning Brief", opportunities, topCrossMarketInsight),
      makeReport("Midday Update", opportunities, topCrossMarketInsight),
      makeReport("Closing Watchlist", opportunities, topCrossMarketInsight),
      makeReport("Weekend Deep Dive", opportunities, topCrossMarketInsight)
    ],
    macroRiskToday: getMacroRiskToday(),
    earningsWatch: await getEarningsWatch(),
    warnings: [...warnings, ...polymarketScan.warnings]
  };
}
