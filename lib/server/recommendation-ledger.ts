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

function numberFromText(value: string) {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function dollars(value: number) {
  return `$${value.toFixed(2)}`;
}

function readinessLabel(score: number): RecommendationLedgerItem["readinessLabel"] {
  if (score >= 85) return "HIGH CONVICTION";
  if (score >= 70) return "ACTIONABLE";
  if (score >= 40) return "PREPARE";
  return "WATCH ONLY";
}

function urgencyFromText(text: string): RecommendationLedgerItem["urgencyLevel"] {
  const normalized = text.toLowerCase();
  if (/(today|live|now|this hour|resolves soon|same day|breaking|urgent)/.test(normalized)) return "urgent";
  if (/(tomorrow|soon|earnings|8-k|fed|cpi|jobs|closing|midday)/.test(normalized)) return "high";
  if (/(week|watch|monitor)/.test(normalized)) return "medium";
  return "low";
}

function nextCheckFor(urgency: RecommendationLedgerItem["urgencyLevel"]) {
  if (urgency === "urgent") return "Re-check in 15-30 minutes or when the trigger prints.";
  if (urgency === "high") return "Re-check within 1 hour or before the catalyst window.";
  if (urgency === "medium") return "Re-check next scan or later today.";
  return "Re-check tomorrow unless fresh news appears.";
}

function hasClearText(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 8 && !["n/a", "unknown", "none"].includes(normalized);
}

function expiryFor(category: RecommendationLedgerItem["tradeCategory"], createdAt: string) {
  const created = new Date(createdAt).getTime();
  const days = category === "DAY_TRADE" ? 1 : category === "POLYMARKET" ? 7 : 30;
  return new Date(created + days * 86_400_000).toISOString();
}

function buildDirectExecutionPlan(
  opportunity: UnifiedOpportunity,
  tradeCategory: RecommendationLedgerItem["tradeCategory"],
  recommendation: RecommendationLedgerItem["recommendation"]
): RecommendationLedgerItem["directExecutionPlan"] {
  const isPoly = opportunity.marketType === "polymarket";
  const currentNumber = numberFromText(opportunity.current);
  const stockEntry = currentNumber === null ? "Wait for a clean trigger near current price." : dollars(currentNumber);
  const stockStop = currentNumber === null ? opportunity.invalidation : dollars(Math.max(0.01, currentNumber * 0.97));
  const stockTarget1 = currentNumber === null ? opportunity.actionPlan.whenToExit : dollars(currentNumber * 1.05);
  const stockTarget2 = currentNumber === null ? opportunity.bullCase : dollars(currentNumber * 1.08);
  const riskPerShareNumber = currentNumber === null ? null : Math.max(0.01, currentNumber - currentNumber * 0.97);
  const rewardPerShareNumber = currentNumber === null ? null : Math.max(0.01, currentNumber * 1.05 - currentNumber);
  const ratio = riskPerShareNumber && rewardPerShareNumber ? rewardPerShareNumber / riskPerShareNumber : null;
  const suggestedShares = currentNumber === null ? "small dollar amount" : `${Math.max(1, Math.floor(20 / currentNumber))} share${Math.max(1, Math.floor(20 / currentNumber)) === 1 ? "" : "s"}`;
  const yesOdds = opportunity.current.match(/YES\s+(\d+)%/i)?.[1];
  const noOdds = opportunity.current.match(/NO\s+(\d+)%/i)?.[1];
  const polyEntry = recommendation === "PAPER_NO" ? (noOdds ? `${noOdds} cents` : opportunity.current) : yesOdds ? `${yesOdds} cents` : opportunity.current;
  const urgency = urgencyFromText(`${opportunity.current} ${opportunity.catalyst.whyItMatters} ${opportunity.title}`);
  const label =
    recommendation === "AVOID"
      ? "AVOID"
      : recommendation === "SKIP"
        ? "SKIP"
        : isPoly
          ? "POLYMARKET BINARY RISK"
          : recommendation === "PAPER_TRADE"
            ? "PAPER EXECUTION CANDIDATE"
            : "WATCH ONLY";
  const direction = recommendation === "PAPER_YES" ? "PAPER YES" : recommendation === "PAPER_NO" ? "PAPER NO" : recommendation === "PAPER_TRADE" ? "LONG WATCH" : "WATCH";
  const exactEntry = isPoly ? polyEntry : stockEntry;
  const exactStop = isPoly ? "Exit/skip if official news contradicts the side or odds move 8-12 cents against the thesis." : stockStop;
  const exactTarget1 = isPoly ? "Take paper profit if odds move 8-12 cents in your favor." : stockTarget1;
  const exactTarget2 = isPoly ? "Take more paper profit if odds move 15-20 cents in your favor or the edge becomes crowded." : stockTarget2;

  return {
    label,
    category: isPoly ? "POLYMARKET" : tradeCategory === "LONG_TERM" ? "LONG-TERM INVESTING" : "DAY TRADE - SHARES",
    direction,
    readinessLabel: "WATCH ONLY",
    currentPriceOrOdds: opportunity.current,
    entryZone: exactEntry,
    exactEntry,
    stopOrInvalidation: exactStop,
    exactStop,
    target1: exactTarget1,
    target2: exactTarget2,
    exactTarget1,
    exactTarget2,
    riskPerShare: riskPerShareNumber === null ? "Binary paper risk; max loss is the paper stake." : dollars(riskPerShareNumber),
    rewardPerShare: rewardPerShareNumber === null ? "Binary reward depends on odds movement." : dollars(rewardPerShareNumber),
    riskRewardRatio: ratio === null ? "Estimate from odds movement, not stock-style R/R." : `${ratio.toFixed(1)}:1`,
    confidenceScore: `${opportunity.confidence} confidence before readiness adjustment.`,
    expectedValueEstimate: ratio !== null && ratio >= 1.5 ? "Positive only if trigger confirms and risk stays controlled." : "Needs confirmation; do not assume positive EV.",
    whyNow: opportunity.actionPlan.plainEnglish.whyItMattersToday,
    nextSuggestedCheck: nextCheckFor(urgency),
    catalystCountdown: urgency === "urgent" ? "Catalyst window is active now or today." : urgency === "high" ? "Catalyst is approaching soon." : "No immediate catalyst countdown.",
    urgencyLevel: urgency,
    maxPaperRisk: "$2-$5",
    suggestedPaperPositionSize: opportunity.actionPlan.suggestedPaperPositionSize,
    timeHorizon: tradeCategory === "DAY_TRADE" ? "Same day. Expire this idea by the close unless the trigger is active." : tradeCategory === "POLYMARKET" ? "Until the catalyst/news resolves or odds move against the thesis." : "Weeks to months. Watchlist or small DCA only.",
    plainEnglish: opportunity.actionPlan.plainEnglish.whatThisMeans,
    robinhoodSteps: isPoly
      ? []
      : tradeCategory === "LONG_TERM"
        ? [
            "Open Robinhood.",
            `Search ${opportunity.symbol}.`,
            "Add it to your watchlist first.",
            "Read the latest news.",
            "If buying manually, use Dollars/Fractional Share.",
            "Use small size.",
            "Do not buy just because of one alert."
          ]
        : [
            "Open Robinhood.",
            "Tap Search.",
            `Type ${opportunity.symbol}.`,
            "Tap the correct stock/ETF.",
            "Tap Trade.",
            "Tap Buy.",
            `Choose Shares and enter ${suggestedShares}, or choose Dollars for a tiny paper size.`,
            "Choose Limit Order, not Market Order.",
            `Enter the limit price near ${exactEntry}.`,
            "Review estimated cost.",
            "Do not submit if price moved outside the entry zone.",
            "If paper trading, click 'I entered this' in the app.",
            `After fill, use the stop/invalidation plan near ${exactStop}.`,
            `Take partial paper profit near ${exactTarget1}.`,
            `Take more paper profit or close near ${exactTarget2}.`
          ],
    polymarketSteps: isPoly
      ? [
          "Open Polymarket.",
          `Search exact market title: ${opportunity.title}.`,
          "Open the market.",
          "Read rules/resolution criteria.",
          "Check YES price and NO price.",
          "Compare to the app price.",
          "If odds moved too far, skip.",
          "Check volume/liquidity.",
          "If paper trading, click 'I entered this' in this app.",
          "If real trading manually, risk only the stated amount.",
          "Take profit if odds move in your favor.",
          "Exit/avoid if thesis breaks."
        ]
      : [],
    optionsUnavailableMessage: "Options Watch unavailable - options chain data source not connected.",
    warnings: [
      isPoly ? "Prediction markets are binary. If the side loses, the full paper stake can go to zero." : "No market orders. Use a limit order only if manually trading.",
      "Manual approval only. No real auto-trading."
    ]
  };
}

function executionReadinessFor(item: Pick<RecommendationLedgerItem, "tradeCategory" | "marketType" | "recommendation" | "entryZone" | "stopOrInvalidation" | "target1" | "target2" | "currentPriceOrOddsAtRecommendation" | "confidence" | "riskLevel" | "whySkip" | "whyNow" | "sourceDataUsed" | "directExecutionPlan" | "strategyTags" | "signalTypes" | "learningAdjustment">): Pick<
  RecommendationLedgerItem,
  "executionReadinessScore" | "autoPaperEligible" | "reasonNotEligible" | "executionPlanQuality" | "readinessLabel" | "readinessBreakdown" | "nextSuggestedCheck" | "catalystCountdown" | "urgencyLevel"
> {
  const reasons: string[] = [];
  const entry = hasClearText(item.entryZone);
  const stop = hasClearText(item.stopOrInvalidation);
  const target = hasClearText(item.target1);
  const entryNumber = numberFromText(item.entryZone);
  const stopNumber = numberFromText(item.stopOrInvalidation);
  const targetNumber = numberFromText(item.target1);
  const riskDistance = entryNumber !== null && stopNumber !== null ? Math.abs(entryNumber - stopNumber) : null;
  const rewardDistance = entryNumber !== null && targetNumber !== null ? Math.abs(targetNumber - entryNumber) : null;
  const ratio = riskDistance && rewardDistance ? rewardDistance / riskDistance : null;
  const riskRewardOk = ratio === null ? target : ratio >= 1.2;
  const confidenceOk = item.confidence === "high" || (item.confidence === "medium" && item.riskLevel !== "high");
  const actionable = !["SKIP", "AVOID", "WATCH"].includes(item.recommendation);
  const notOverextended = !/(ran too far|overextended|already moved|chase)/i.test(item.whySkip);
  const liquidityOk = !/(low liquidity|thin liquidity|wide spread)/i.test(item.whySkip);
  const dataFresh = item.sourceDataUsed.includes("opportunity-engine") || item.sourceDataUsed.includes("saved-report");
  const rulesClear = item.marketType !== "polymarket" || !/(unclear|ambiguous|vague)/i.test(`${item.whySkip} ${item.stopOrInvalidation}`);
  const text = `${item.whyNow} ${item.whySkip} ${item.directExecutionPlan.catalystCountdown} ${item.signalTypes.join(" ")}`.toLowerCase();
  const urgency = item.directExecutionPlan.urgencyLevel ?? urgencyFromText(text);
  const hasCatalyst = /(earnings|8-k|sec|fed|cpi|jobs|inflation|news|volume|macro|crypto|election|live|today|filing|catalyst)/i.test(text);
  const activeNow = urgency === "urgent" || urgency === "high";
  const highRiskPenalty = item.riskLevel === "high" ? 8 : item.riskLevel === "medium" ? 3 : 0;

  const entryQuality = Math.max(
    0,
    Math.min(
      25,
      (entry ? 8 : 0) +
        (entryNumber !== null ? 5 : 0) +
        (/(support|demand|vwap|break|hold|near current|odds)/i.test(`${item.entryZone} ${item.whyNow}`) ? 5 : 0) +
        (notOverextended ? 5 : 0) +
        (item.confidence === "high" ? 2 : 0)
    )
  );
  const riskDefinition = Math.max(
    0,
    Math.min(
      25,
      (stop ? 7 : 0) +
        (target ? 5 : 0) +
        (riskDistance !== null ? 4 : 0) +
        (rewardDistance !== null ? 4 : 0) +
        (riskRewardOk ? 5 : 0) -
        highRiskPenalty
    )
  );
  const catalystQuality = Math.max(
    0,
    Math.min(
      25,
      (hasCatalyst ? 8 : 0) +
        (dataFresh ? 5 : 0) +
        (item.confidence === "high" ? 5 : item.confidence === "medium" ? 3 : 0) +
        (item.strategyTags.some((tag) => /SEC 8-K|earnings|macro|crypto|politics|finance/i.test(tag)) ? 4 : 0) +
        (liquidityOk ? 3 : 0)
    )
  );
  const timingQuality = Math.max(
    0,
    Math.min(25, (activeNow ? 8 : urgency === "medium" ? 4 : 1) + (notOverextended ? 6 : 0) + (liquidityOk ? 4 : 0) + (rulesClear ? 4 : 0) + (item.learningAdjustment > 0 ? 3 : 0))
  );

  if (!entry) reasons.push("No clear entry zone.");
  if (!stop) reasons.push("No clear stop/invalidation.");
  if (!target) reasons.push("No clear target.");
  if (!riskRewardOk) reasons.push("Risk/reward is not clear enough.");
  if (!confidenceOk) reasons.push("Confidence is below the action threshold.");
  if (!dataFresh) reasons.push("Data freshness is not clear.");
  if (!liquidityOk) reasons.push("Liquidity/spread warning.");
  if (!notOverextended) reasons.push("Idea may already be overextended or missed.");
  if (!rulesClear) reasons.push("Polymarket rules/resolution are not clear enough.");
  if (!actionable) reasons.push("Recommendation is watch/skip/avoid, not an execution candidate.");

  const executionReadinessScore = Math.min(100, entryQuality + riskDefinition + catalystQuality + timingQuality + Math.max(-8, Math.min(8, item.learningAdjustment)));
  const label = readinessLabel(executionReadinessScore);
  const autoPaperEligible = actionable && executionReadinessScore >= 70 && entry && stop && target && liquidityOk && notOverextended && rulesClear && confidenceOk;
  const executionPlanQuality: RecommendationLedgerItem["executionPlanQuality"] =
    executionReadinessScore >= 85 ? "elite" : executionReadinessScore >= 70 ? "strong" : executionReadinessScore >= 40 ? "acceptable" : "weak";
  return {
    executionReadinessScore,
    autoPaperEligible,
    reasonNotEligible: autoPaperEligible ? "" : reasons.join(" "),
    executionPlanQuality,
    readinessLabel: label,
    readinessBreakdown: { entryQuality, riskDefinition, catalystQuality, timingQuality, reasons },
    nextSuggestedCheck: item.directExecutionPlan.nextSuggestedCheck,
    catalystCountdown: item.directExecutionPlan.catalystCountdown,
    urgencyLevel: urgency
  };
}

function normalizeStoredItem(item: RecommendationLedgerItem): RecommendationLedgerItem {
  const defaultDirectExecutionPlan: RecommendationLedgerItem["directExecutionPlan"] = {
      label: item.recommendation === "AVOID" ? "AVOID" : item.recommendation === "SKIP" ? "SKIP" : item.marketType === "polymarket" ? "POLYMARKET BINARY RISK" : "WATCH ONLY",
      category: item.marketType === "polymarket" ? "POLYMARKET" : item.tradeCategory === "LONG_TERM" ? "LONG-TERM INVESTING" : "DAY TRADE - SHARES",
      direction: item.recommendation === "PAPER_YES" ? "PAPER YES" : item.recommendation === "PAPER_NO" ? "PAPER NO" : item.recommendation === "PAPER_TRADE" ? "LONG WATCH" : "WATCH",
      readinessLabel: readinessLabel(item.executionReadinessScore ?? 0),
      currentPriceOrOdds: item.currentPriceOrOddsAtRecommendation,
      entryZone: item.entryZone,
      exactEntry: item.entryZone,
      stopOrInvalidation: item.stopOrInvalidation,
      exactStop: item.stopOrInvalidation,
      target1: item.target1,
      target2: item.target2,
      exactTarget1: item.target1,
      exactTarget2: item.target2,
      riskPerShare: "Needs fresh scan.",
      rewardPerShare: "Needs fresh scan.",
      riskRewardRatio: "Needs fresh scan.",
      confidenceScore: item.confidence,
      expectedValueEstimate: "Needs fresh scan; never fabricate EV.",
      whyNow: item.whyNow,
      nextSuggestedCheck: "Re-run Opportunities to refresh this saved setup.",
      catalystCountdown: "Saved before catalyst countdown existed.",
      urgencyLevel: "low" as const,
      maxPaperRisk: "$2-$5" as const,
      suggestedPaperPositionSize: "Risk only $2-$5 while paper-tracking.",
      timeHorizon: item.tradeCategory === "DAY_TRADE" ? "Same day watch." : item.tradeCategory === "POLYMARKET" ? "Until the catalyst resolves." : "Longer-term watchlist.",
      plainEnglish: item.beginnerThesis,
      robinhoodSteps: ["Open Robinhood.", `Search ${item.tickerOrMarket}.`, "Use limit order only if manually trading.", "Click 'I entered this' in the app if paper-tracking."],
      polymarketSteps: ["Open Polymarket.", `Search ${item.title}.`, "Read rules first.", "Click 'I entered this' in the app if paper-tracking."],
      optionsUnavailableMessage: "Options Watch unavailable - options chain data source not connected.",
      warnings: ["Manual approval only. No real auto-trading."]
    };
  const directExecutionPlan = { ...defaultDirectExecutionPlan, ...(item.directExecutionPlan ?? {}) };
  return {
    ...item,
    executionReadinessScore: item.executionReadinessScore ?? 0,
    autoPaperEligible: item.autoPaperEligible ?? false,
    reasonNotEligible: item.reasonNotEligible ?? "Saved before execution readiness scoring existed.",
    executionPlanQuality: item.executionPlanQuality ?? "weak",
    readinessLabel: item.readinessLabel ?? readinessLabel(item.executionReadinessScore ?? 0),
    readinessBreakdown: item.readinessBreakdown ?? {
      entryQuality: 0,
      riskDefinition: 0,
      catalystQuality: 0,
      timingQuality: 0,
      reasons: ["Re-run Opportunities to calculate the upgraded readiness breakdown."]
    },
    lastChecked: item.lastChecked ?? item.lastCheckedAt ?? null,
    nextSuggestedCheck: item.nextSuggestedCheck ?? directExecutionPlan.nextSuggestedCheck,
    catalystCountdown: item.catalystCountdown ?? directExecutionPlan.catalystCountdown,
    urgencyLevel: item.urgencyLevel ?? directExecutionPlan.urgencyLevel,
    directExecutionPlan,
    autoPaperTrade: item.autoPaperTrade ?? null
  };
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
  const recommendation = normalizeRecommendation(opportunity.actionPlan.decisionLabel, marketType);
  const createdAt = now();
  const directExecutionPlan = buildDirectExecutionPlan(opportunity, tradeCategory, recommendation);
  const base = {
    id: `${opportunity.id}-${opportunity.source}`,
    createdAt,
    marketType,
    tradeCategory,
    tickerOrMarket: opportunity.symbol,
    title: opportunity.title,
    recommendation,
    entryZone: directExecutionPlan.entryZone,
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
    lastAlertedStatus: null,
    directExecutionPlan
  } satisfies Omit<
    RecommendationLedgerItem,
    | "executionReadinessScore"
    | "autoPaperEligible"
    | "reasonNotEligible"
    | "executionPlanQuality"
    | "readinessLabel"
    | "readinessBreakdown"
    | "lastChecked"
    | "nextSuggestedCheck"
    | "catalystCountdown"
    | "urgencyLevel"
    | "autoPaperTrade"
  >;
  const readiness = executionReadinessFor(base);
  return {
    ...base,
    ...readiness,
    status: readiness.autoPaperEligible ? "waiting_for_trigger" : base.status,
    lastChecked: null,
    directExecutionPlan: { ...base.directExecutionPlan, readinessLabel: readiness.readinessLabel },
    autoPaperTrade: readiness.autoPaperEligible
      ? {
          plannedEntry: base.entryZone,
          plannedStopOrInvalidation: base.stopOrInvalidation,
          plannedTarget: base.target1,
          plannedMaxRisk: "$2-$5",
          createdAt,
          expiresAt: expiryFor(tradeCategory, createdAt),
          sourceRecommendationId: base.id,
          currentPriceOrOdds: base.currentPriceOrOddsAtRecommendation,
          maxFavorableMove: "No live move tracked yet.",
          maxAdverseMove: "No live move tracked yet.",
          theoreticalResult: "Waiting for trigger."
        }
      : null
  };
}

export function recommendationsFromEngine(engine: OpportunityEngineResponse, existing: RecommendationLedgerItem[] = []) {
  return engine.opportunities.slice(0, 20).map((opportunity) => recommendationFromOpportunity(opportunity, existing));
}

export function recommendationsFromReport(report: SavedDailyReport, existing: RecommendationLedgerItem[] = []) {
  const reportRecommendations: RecommendationLedgerItem[] = [];
  report.topDayTradeIdeas.forEach((idea) => {
    const recommendation = idea.actionLabel.toLowerCase().includes("paper") ? "PAPER_TRADE" : idea.actionLabel.toLowerCase().includes("avoid") ? "AVOID" : "WATCH";
    const directExecutionPlan: RecommendationLedgerItem["directExecutionPlan"] = {
      label: recommendation === "PAPER_TRADE" ? "PAPER EXECUTION CANDIDATE" : recommendation === "AVOID" ? "AVOID" : "WATCH ONLY",
      category: "DAY TRADE - SHARES",
      direction: recommendation === "PAPER_TRADE" ? "LONG WATCH" : "WATCH",
      readinessLabel: "WATCH ONLY",
      currentPriceOrOdds: idea.current,
      entryZone: idea.entryZone,
      exactEntry: idea.entryZone,
      stopOrInvalidation: idea.stopInvalidation,
      exactStop: idea.stopInvalidation,
      target1: idea.target,
      target2: idea.watchNext[0] ?? idea.target,
      exactTarget1: idea.target,
      exactTarget2: idea.watchNext[0] ?? idea.target,
      riskPerShare: "Calculated from the paper stop after confirming live price.",
      rewardPerShare: "Calculated from target after confirming live price.",
      riskRewardRatio: "Confirm live price first.",
      confidenceScore: "medium confidence before readiness adjustment.",
      expectedValueEstimate: "Needs trigger confirmation; do not assume positive EV.",
      whyNow: idea.reason,
      nextSuggestedCheck: "Re-check in 30-60 minutes or before the catalyst window.",
      catalystCountdown: "Report idea; catalyst may be active today.",
      urgencyLevel: "high",
      maxPaperRisk: "$2-$5",
      suggestedPaperPositionSize: "Risk only $2-$5. Use a tiny paper position sized around the stop distance.",
      timeHorizon: "Same day. Expire this idea by the close unless the trigger is active.",
      plainEnglish: idea.reason,
      robinhoodSteps: [
        "Open Robinhood.",
        "Tap Search.",
        `Type ${idea.symbol}.`,
        "Tap the correct stock/ETF.",
        "Tap Trade.",
        "Tap Buy.",
        "Choose Dollars or Shares.",
        "Choose Limit Order, not Market Order.",
        "Enter the limit price from the entry zone.",
        "Review estimated cost.",
        "Do not submit if price moved outside the entry zone.",
        "If paper trading, click 'I entered this' in the app.",
        "If the invalidation level breaks, exit manually or use a stop/stop-limit if available.",
        "If target hits, take profit or mark target hit in the app."
      ],
      polymarketSteps: [],
      optionsUnavailableMessage: "Options Watch unavailable - options chain data source not connected.",
      warnings: ["No market orders. Use a limit order only if manually trading.", "Manual approval only. No real auto-trading."]
    };
    const base = {
      id: `${report.id}-${idea.id}`,
      createdAt: report.timestamp,
      marketType: "stock",
      tradeCategory: "DAY_TRADE",
      tickerOrMarket: idea.symbol,
      title: idea.title,
      recommendation,
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
      lastAlertedStatus: null,
      directExecutionPlan
  } satisfies Omit<
      RecommendationLedgerItem,
      | "executionReadinessScore"
      | "autoPaperEligible"
      | "reasonNotEligible"
      | "executionPlanQuality"
      | "readinessLabel"
      | "readinessBreakdown"
      | "lastChecked"
      | "nextSuggestedCheck"
      | "catalystCountdown"
      | "urgencyLevel"
      | "autoPaperTrade"
    >;
    const readiness = executionReadinessFor(base);
    reportRecommendations.push({
      ...base,
      ...readiness,
      status: readiness.autoPaperEligible ? "waiting_for_trigger" : base.status,
      lastChecked: null,
      directExecutionPlan: { ...base.directExecutionPlan, readinessLabel: readiness.readinessLabel },
      autoPaperTrade: readiness.autoPaperEligible
        ? {
            plannedEntry: base.entryZone,
            plannedStopOrInvalidation: base.stopOrInvalidation,
            plannedTarget: base.target1,
            plannedMaxRisk: "$2-$5",
            createdAt: base.createdAt,
            expiresAt: expiryFor("DAY_TRADE", base.createdAt),
            sourceRecommendationId: base.id,
            currentPriceOrOdds: base.currentPriceOrOddsAtRecommendation,
            maxFavorableMove: "No live move tracked yet.",
            maxAdverseMove: "No live move tracked yet.",
            theoreticalResult: "Waiting for trigger."
          }
        : null
    });
  });
  return reportRecommendations;
}

export async function loadRecommendationLedger() {
  const recommendations = ((await store().get(LEDGER_KEY, { type: "json" })) ?? []) as RecommendationLedgerItem[];
  return recommendations.map(normalizeStoredItem);
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
  const completed = items.filter((item) => ["target_hit", "stopped_out", "expired", "manually_closed", "missed_winner", "good_skip"].includes(item.status));
  if (!completed.length) return 0;
  const wins = completed.filter((item) => ["target_hit", "good_skip"].includes(item.status) || Number(item.resultPct ?? 0) > 0);
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
  const categoryEntries = Object.entries(ratesBy(recommendations, (item) => [item.tradeCategory])).sort((a, b) => b[1] - a[1]);
  const missedWinners = recommendations.filter((item) => item.userActuallyEntered === "no" && item.status === "target_hit").length;
  const avoidedLosers = recommendations.filter((item) => ["SKIP", "AVOID"].includes(item.recommendation) && item.status === "stopped_out").length;
  const autoPaperItems = recommendations.filter((item) => item.autoPaperTrade);
  const userEnteredItems = recommendations.filter((item) => item.userActuallyEntered === "yes");
  const stopMaking = Object.entries(winRateBySignalType)
    .filter(([, rate]) => rate > 0 && rate < 40)
    .map(([name, rate]) => `${name}: ${rate}% win rate. Require stronger confirmation or stop making this setup.`);
  return {
    totalRecommendations: recommendations.length,
    winRateByCategory: Object.fromEntries(categoryEntries),
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
    autoPaperWinRate: winRate(autoPaperItems),
    userEnteredWinRate: winRate(userEnteredItems),
    skippedWinnerCount: recommendations.filter((item) => item.status === "missed_winner" || (item.userActuallyEntered === "no" && item.status === "target_hit")).length,
    avoidedLoserCount: recommendations.filter((item) => item.status === "good_skip" || (["SKIP", "AVOID"].includes(item.recommendation) && item.status === "stopped_out")).length,
    bestSignalType: entries[0]?.[0] ?? "n/a",
    worstSignalType: entries.at(-1)?.[0] ?? "n/a",
    bestCategory: categoryEntries[0]?.[0] ?? "n/a",
    recommendationsToStopMaking: stopMaking.length ? stopMaking : ["Need more completed outcomes before stopping a setup type."],
    overconfidenceWarning:
      recommendations.filter((item) => item.confidence === "high" && item.status === "stopped_out").length >= 2
        ? "High-confidence ideas have recent losses. Lower confidence until confirmation improves."
        : "No overconfidence warning yet.",
    systemGoodAt: entries[0] ? `The system has been good at ${entries[0][0]} setups.` : "The system needs more completed outcomes.",
    systemBadAt: entries.at(-1) ? `The system has been bad at ${entries.at(-1)?.[0]} setups.` : "The system needs more completed outcomes."
  };
}
