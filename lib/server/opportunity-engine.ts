import type {
  ActionBadge,
  BeginnerActionPlan,
  IntelligenceReport,
  OpportunityEngineResponse,
  PolymarketOpportunity,
  ScanResponse,
  SetupReport,
  UnifiedOpportunity
} from "@/lib/shared/types";
import { WATCHLIST } from "@/lib/shared/watchlist";
import { classifyPolymarketCatalyst, classifyStockCatalyst } from "./catalysts";
import { buildCrossMarketInsights } from "./cross-market";
import type { EarningsSignal } from "./earnings";
import { fetchEarningsSignals } from "./earnings";
import { getSetupCheck } from "./env";
import { getMacroRiskToday } from "./macro";
import { runPolymarketScan } from "./polymarket";
import { runMarketScan } from "./scan";
import type { SecEightKSignal } from "./sec";
import { fetchSecEightKSignals } from "./sec";

function stockDataConfidence(setup: SetupReport, secSignal?: SecEightKSignal, earningsSignal?: EarningsSignal) {
  if (secSignal?.mappingConfidence === "low" || earningsSignal?.confidence === "low") return "medium";
  if (setup.news.length >= 2 && setup.quote.source) return "high";
  if (setup.news.length >= 1) return "medium";
  return "low";
}

function badgeFor(riskLevel: string, confidence: string, score: number): ActionBadge {
  if (riskLevel === "high") return "Too Risky";
  if (confidence === "low") return "Watch Only";
  if (score >= 75 && riskLevel === "low") return "Beginner Safe";
  if (score >= 65) return "Paper Candidate";
  return "Needs Research";
}

function stockDecision(setup: SetupReport) {
  if (setup.riskLevel === "high") return "Avoid" as const;
  if (setup.ai.confidence === "low" || setup.score < 60) return "Watch" as const;
  if (setup.warnings.length >= 3) return "Skip" as const;
  return "Paper Candidate" as const;
}

function makeStockActionPlan(setup: SetupReport, secSignal?: SecEightKSignal, earningsSignal?: EarningsSignal): BeginnerActionPlan {
  const price = setup.quote.price;
  const stopText = setup.ai.stopLoss || setup.ai.invalidation;
  const externalReasons = [
    secSignal?.hasEightKToday ? secSignal.explanation : null,
    earningsSignal?.badge ? earningsSignal.explanation : null
  ].filter(Boolean);
  const externalWarnings = [
    earningsSignal?.warning,
    secSignal?.mappingConfidence === "low" ? "SEC ticker mapping was uncertain, so filing data should not be treated as complete." : null
  ].filter(Boolean);
  return {
    marketType: "stock",
    decisionLabel: stockDecision(setup),
    badge: badgeFor(setup.riskLevel, setup.ai.confidence, setup.score),
    plainEnglish: {
      whatThisMeans: `${setup.ticker} is a research idea because the app found a price move, recent news, or a primary-data event. This is not a command to buy.`,
      whyItMattersToday: [setup.ai.catalyst, ...externalReasons].join(" "),
      whyThisCouldStillFail: [setup.ai.bearCase, ...externalWarnings].join(" ")
    },
    manualChecklist: [
      "Open Robinhood manually.",
      `Search the ticker: ${setup.ticker}.`,
      "Check the current Robinhood price before doing anything.",
      `Compare Robinhood price to the app price near $${price.toFixed(2)}.`,
      "If the price moved more than about 1%-2% from the app price, skip and re-run research.",
      "Check today volume and bid/ask spread on Robinhood if available.",
      "Read the newest headline or SEC filing first. Do not rely on the ticker moving by itself.",
      earningsSignal?.badge ? `Earnings check: ${earningsSignal.explanation}` : "Check whether earnings are today or this week before paper-tracking.",
      "Use a limit order only if you are paper-tracking the idea.",
      "Never use a market order.",
      "Suggested paper position size for a $100 account: about $10-$20.",
      "Max paper risk: $2-$5.",
      `Stop-loss/invalidation: ${stopText}.`,
      `Target idea: ${setup.ai.target}.`,
      "Exit if the invalidation happens, the catalyst fades, or the broad market turns against the idea.",
      `Skip completely if: ${setup.ai.whyToSkip}`
    ],
    riskTranslation: "If you paper trade $10 and this goes against you, plan the idea so your max paper loss is about $2.",
    doNotTouchIf: [
      "No clear catalyst.",
      "Price already ran too far.",
      "Spread is too wide.",
      "Volume is weak.",
      "Market is moving on rumor only.",
      "Confidence is low.",
      "Earnings are about to hit and you do not know the report time.",
      "SEC filing exists but you did not read what changed.",
      "You do not understand the thesis."
    ],
    maxPaperRisk: "$2-$5",
    suggestedPaperPositionSize: "$10-$20 paper position for a $100 account.",
    whenToExit: "Exit the paper idea if the invalidation level hits, the catalyst is contradicted, or the target is reached.",
    whenToSkipCompletely: setup.ai.whyToSkip,
    telegramSummary: {
      whatItIs: `${setup.ticker} stock research setup.`,
      whyItMatters: setup.ai.catalyst,
      whatToCheck: [
        "Current Robinhood price versus app price.",
        "Any SEC 8-K or earnings badge.",
        "Limit-order plan only.",
        "Max paper risk stays between $2 and $5.",
        "You understand the catalyst and invalidation."
      ],
      whyToSkip: setup.ai.whyToSkip
    }
  };
}

function polymarketDecision(market: PolymarketOpportunity) {
  if (market.riskFlags.resolutionSourceRisk || market.riskFlags.ambiguousWording) return "Avoid" as const;
  if (market.riskLevel === "high" || market.confidence === "low") return "Watch" as const;
  if ((market.yesPrice ?? 0.5) <= 0.5) return "Paper YES Candidate" as const;
  if ((market.noPrice ?? 0.5) <= 0.5) return "Paper NO Candidate" as const;
  return "Skip" as const;
}

function makePolymarketActionPlan(market: PolymarketOpportunity): BeginnerActionPlan {
  const yes = market.yesPrice === null ? "unknown" : `${Math.round(market.yesPrice * 100)} cents`;
  const no = market.noPrice === null ? "unknown" : `${Math.round(market.noPrice * 100)} cents`;
  const yesShares = market.yesPrice && market.yesPrice > 0 ? Math.floor(10 / market.yesPrice) : null;
  return {
    marketType: "polymarket",
    decisionLabel: polymarketDecision(market),
    badge: badgeFor(market.riskLevel, market.confidence, market.attentionPriority),
    plainEnglish: {
      whatThisMeans: `This market asks: ${market.question} YES means the event happens under the rules. NO means it does not happen under the rules.`,
      whyItMattersToday: `${market.currentConsensus}. ${market.catalyst}`,
      whyThisCouldStillFail: market.noCase
    },
    manualChecklist: [
      "Open Polymarket manually.",
      `Search the market title or slug: ${market.slug}.`,
      "Read the rules and resolution criteria first.",
      `Check YES price: ${yes}.`,
      `Check NO price: ${no}.`,
      `Check liquidity and volume: liquidity about $${Math.round(market.liquidity)}, 24h volume about $${Math.round(market.volume24hr)}.`,
      "Check if the app odds still match Polymarket.",
      "If YES or NO moved more than about 5 cents from the app odds, skip and re-run research.",
      "Compare best bid and best ask. If the gap is wide, do not touch it.",
      "Suggested paper position size: about $5-$10.",
      "Max paper risk: $2-$5.",
      `YES gets stronger if: ${market.whatWouldMoveIt[0] ?? "fresh official news supports YES."}`,
      "NO gets stronger if official news contradicts YES or the catalyst fades.",
      `Avoid the market if: ${market.whyToSkip}`
    ],
    riskTranslation:
      market.yesPrice && yesShares
        ? `If YES is ${yes}, a $10 paper position equals about ${yesShares} shares. If YES loses, the full $10 is gone. Do not treat this like a stock stop-loss.`
        : "Prediction-market paper trades can lose the full paper position. Do not treat this like a stock stop-loss.",
    doNotTouchIf: [
      "Resolution criteria are unclear.",
      "Liquidity is low.",
      "Spread is wide.",
      "Market already moved sharply.",
      "No fresh catalyst.",
      "Outcome depends on vague wording.",
      "You are just copying leaderboard traders."
    ],
    maxPaperRisk: "$2-$5",
    suggestedPaperPositionSize: "$5-$10 paper position for a $100 account.",
    whenToExit: "Exit the paper idea if rules change, the market reprices beyond your thesis, or the resolving news contradicts the position.",
    whenToSkipCompletely: market.whyToSkip,
    telegramSummary: {
      whatItIs: market.question,
      whyItMatters: `${market.currentConsensus}. ${market.catalyst}`,
      whatToCheck: [
        "Read resolution criteria first.",
        "Check YES and NO prices.",
        "Check liquidity, volume, and spread.",
        "Confirm odds still match the app.",
        "Do not copy leaderboard traders blindly."
      ],
      whyToSkip: market.whyToSkip
    }
  };
}

function stockToOpportunity(setup: SetupReport, secSignal?: SecEightKSignal, earningsSignal?: EarningsSignal): UnifiedOpportunity {
  const catalyst = classifyStockCatalyst(setup.news, setup.ai.catalyst);
  const catalystBadges = [secSignal?.badge, earningsSignal?.badge].filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
  const monitorNext = [
    ...setup.ai.checkBeforeTrading,
    secSignal?.hasEightKToday ? secSignal.explanation : null,
    earningsSignal?.warning
  ].filter((item): item is string => Boolean(item));
  const confidence = secSignal?.mappingConfidence === "low" && setup.ai.confidence === "high" ? "medium" : setup.ai.confidence;
  const warnings = [
    ...setup.warnings,
    ...(secSignal?.warnings ?? []),
    earningsSignal?.warning
  ].filter((item): item is string => Boolean(item));
  return {
    id: `stock-${setup.ticker}`,
    marketType: "stock",
    title: `${setup.ticker} stock research setup`,
    symbol: setup.ticker,
    current: `$${setup.quote.price.toFixed(2)} (${setup.quote.changePercent.toFixed(2)}%)`,
    score: setup.score,
    attentionPriority: setup.score,
    scoreBreakdown: setup.breakdown,
    catalyst: secSignal?.hasEightKToday
      ? {
          ...catalyst,
          type: "SEC filing",
          sourceQuality: secSignal.mappingConfidence,
          whyItMatters: `${catalyst.whyItMatters} ${secSignal.explanation}`,
          whatWouldMoveTheMarket: [secSignal.explanation, ...catalyst.whatWouldMoveTheMarket]
        }
      : catalyst,
    bullCase: setup.ai.bullCase,
    bearCase: setup.ai.bearCase,
    trap: setup.ai.whyToSkip,
    invalidation: setup.ai.invalidation,
    monitorNext,
    riskLevel: setup.riskLevel,
    confidence,
    dataConfidence: stockDataConfidence(setup, secSignal, earningsSignal),
    catalystBadges,
    suggestedPaperAction: confidence === "low" ? "Skip or watch only." : "Paper-trade only after manual checklist passes.",
    skipReason: warnings.length ? warnings.join(" ") : setup.ai.whyToSkip,
    actionPlan: makeStockActionPlan({ ...setup, warnings }, secSignal, earningsSignal),
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
    attentionPriority: market.attentionPriority,
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
    catalystBadges: [],
    suggestedPaperAction: market.confidence === "low" ? "Skip or monitor only." : "Paper-track thesis; no wallet or order placement.",
    skipReason: market.whyToSkip,
    actionPlan: makePolymarketActionPlan(market),
    source: "polymarket-scan"
  };
}

function makeEarningsWatchItems(signals: Record<string, EarningsSignal>) {
  return Object.values(signals).map((signal) => ({
    ticker: signal.ticker,
    status: signal.reportingToday ? ("today" as const) : signal.reportingSoon ? ("soon" as const) : signal.confidence === "low" ? ("unavailable" as const) : ("available" as const),
    note: [
      signal.explanation,
      signal.warning,
      signal.epsSurprisePercent === null ? null : `EPS surprise: ${signal.epsSurprisePercent}%.`
    ]
      .filter(Boolean)
      .join(" "),
    reportDate: signal.reportDate,
    epsSurprisePercent: signal.epsSurprisePercent
  }));
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
  const watchedTickers = [...new Set([...WATCHLIST, ...(stockScan?.setups.map((setupReport) => setupReport.ticker) ?? [])])];
  const [secSignals, earningsSignals] = await Promise.all([
    fetchSecEightKSignals(watchedTickers).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "SEC 8-K watcher failed.");
      return {} as Record<string, SecEightKSignal>;
    }),
    fetchEarningsSignals(watchedTickers).catch((error) => {
      warnings.push(error instanceof Error ? error.message : "Earnings watcher failed.");
      return {} as Record<string, EarningsSignal>;
    })
  ]);
  const crossMarketInsights = buildCrossMarketInsights(stockScan, polymarketScan);
  const stockOpportunities = stockScan?.setups.map((setupReport) => stockToOpportunity(setupReport, secSignals[setupReport.ticker], earningsSignals[setupReport.ticker])) ?? [];
  const polymarketOpportunities = polymarketScan.opportunities.map(polymarketToOpportunity);
  const opportunities = [...stockOpportunities, ...polymarketOpportunities].sort(
    (a, b) => b.attentionPriority - a.attentionPriority || b.score - a.score
  );
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
    earningsWatch: makeEarningsWatchItems(earningsSignals),
    warnings: [...warnings, ...polymarketScan.warnings]
  };
}
