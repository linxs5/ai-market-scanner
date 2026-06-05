import type {
  AlertResponse,
  DailyReportType,
  LiveCalloutPlan,
  OpportunityEngineResponse,
  PolymarketActionIdea,
  PolymarketHourlyWatch,
  ReportDiagnostics,
  SavedDailyReport,
  SavedReportsResponse,
  ScheduleDiagnosticsRecord,
  UnifiedOpportunity
} from "@/lib/shared/types";
import { getBlobStore } from "./blob-storage";

const REPORTS_KEY = "saved-daily-reports";
const SCHEDULE_DIAGNOSTICS_KEY = "schedule-diagnostics";

export const REPORT_SCHEDULES: Record<DailyReportType, SavedDailyReport["schedule"]> = {
  morning: {
    configuredUtc: "30 12 * * 1-5",
    etEstUtc: "13:30 UTC",
    etEdtUtc: "12:30 UTC",
    dstNote:
      "8:30 AM ET is 13:30 UTC during EST and 12:30 UTC during EDT. Current Netlify cron is fixed at 12:30 UTC, so it follows the EDT time unless manually changed for EST."
  },
  midday: {
    configuredUtc: "30 16 * * 1-5",
    etEstUtc: "17:30 UTC",
    etEdtUtc: "16:30 UTC",
    dstNote:
      "12:30 PM ET is 17:30 UTC during EST and 16:30 UTC during EDT. Current Netlify cron is fixed at 16:30 UTC, so it follows the EDT time unless manually changed for EST."
  },
  closing: {
    configuredUtc: "30 19 * * 1-5",
    etEstUtc: "20:30 UTC",
    etEdtUtc: "19:30 UTC",
    dstNote:
      "3:30 PM ET is 20:30 UTC during EST and 19:30 UTC during EDT. Current Netlify cron is fixed at 19:30 UTC, so it follows the EDT time unless manually changed for EST."
  }
};

const REPORT_TITLES: Record<DailyReportType, SavedDailyReport["title"]> = {
  morning: "Morning Brief",
  midday: "Midday Update",
  closing: "Closing Watchlist"
};

function store() {
  return getBlobStore("market-intelligence-saved-reports");
}

function riskSentence(opportunity: UnifiedOpportunity) {
  if (opportunity.riskLevel === "high") return "High risk. Treat this as avoid or watch-only unless the thesis becomes much clearer.";
  if (opportunity.riskLevel === "medium") return "Medium risk. Use paper tracking only and keep the planned loss small.";
  return "Lower relative risk for this scanner, but still research only.";
}

function stockEntryZone(opportunity: UnifiedOpportunity) {
  const checklistEntry = opportunity.actionPlan.manualChecklist.find((item) => item.toLowerCase().includes("app price near"));
  return checklistEntry ?? opportunity.current;
}

function makeDayTradeIdea(opportunity: UnifiedOpportunity) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    symbol: opportunity.symbol,
    actionLabel: opportunity.actionPlan.decisionLabel,
    reason: opportunity.actionPlan.plainEnglish.whyItMattersToday,
    current: opportunity.current,
    entryZone: stockEntryZone(opportunity),
    stopInvalidation: opportunity.invalidation,
    target: opportunity.actionPlan.whenToExit,
    maxPaperRisk: "$2-$5" as const,
    robinhoodSteps: [
      "Open Robinhood.",
      `Search ${opportunity.symbol}.`,
      "Check current price against the app price.",
      "If price is above the entry zone, skip.",
      "Use a limit order only for paper planning.",
      "Do not use a market order.",
      "Set the exit plan before entering the paper idea.",
      "If using options, label it VERY HIGH RISK and remember the contract can go to $0."
    ],
    doNotTouchIf: opportunity.actionPlan.doNotTouchIf,
    watchNext: opportunity.monitorNext,
    riskNote: riskSentence(opportunity)
  };
}

function makeLongTermIdea(opportunity: UnifiedOpportunity) {
  return {
    id: `long-${opportunity.id}`,
    symbol: opportunity.symbol,
    thesis: `${opportunity.symbol} may be worth watching longer term if the catalyst connects to durable revenue, adoption, or market-share growth.`,
    whyMonthsYears: opportunity.bullCase,
    risk: opportunity.bearCase,
    betterEntryCondition: "Wait for a calmer price, cleaner market regime, or a pullback where the thesis still makes sense.",
    dcaIdea: "Dollar-cost-average watchlist idea only. Not urgent. Do not force a same-day trade.",
    robinhoodSteps: [
      "Open Robinhood.",
      `Search ${opportunity.symbol}.`,
      "Add it to your watchlist.",
      "Review chart and news.",
      "Only buy if it fits your written plan."
    ],
    label: "Not a day trade" as const
  };
}

function makePolymarketIdea(opportunity: UnifiedOpportunity): PolymarketActionIdea {
  const yes = opportunity.current.match(/YES\s+(\d+)%/i)?.[1];
  const no = opportunity.current.match(/NO\s+(\d+)%/i)?.[1];
  return {
    id: opportunity.id,
    title: opportunity.title,
    yesPrice: yes ? `${yes} cents` : "check Polymarket",
    noPrice: no ? `${no} cents` : "check Polymarket",
    actionLabel: opportunity.actionPlan.decisionLabel,
    yesMeans: "YES means the event happens under the market rules.",
    noMeans: "NO means the event does not happen under the market rules.",
    whyOddsMayMove: opportunity.actionPlan.plainEnglish.whyItMattersToday,
    resolutionEvent: opportunity.catalyst.invalidation || opportunity.invalidation,
    checkBeforeTouching: opportunity.actionPlan.telegramSummary.whatToCheck,
    suggestedMaxRisk: "$2-$5",
    compoundingPlan: [
      "Do not put the full $50 in one market.",
      "Default max is 5%-10% per idea, about $2-$5.",
      "Take paper profits when odds move in your favor.",
      "Avoid unclear rules."
    ],
    polymarketSteps: [
      "Open Polymarket.",
      "Search the exact market title.",
      "Read rules and resolution criteria.",
      "Check YES/NO price still matches the app.",
      "Check volume and liquidity.",
      "If price moved too far, skip.",
      "Log as paper trade first."
    ]
  };
}

function makeHourlyWatch(opportunity: UnifiedOpportunity): PolymarketHourlyWatch {
  return {
    id: `hourly-${opportunity.id}`,
    marketTitle: opportunity.title,
    whyCheckThisHour: opportunity.actionPlan.plainEnglish.whyItMattersToday,
    yesMover: opportunity.bullCase,
    noMover: opportunity.bearCase,
    alertTrigger: "Alert if YES or NO moves about 5 cents with matching volume and no rule confusion.",
    riskNote: "For a $50 account, keep any single paper idea around $2-$5. Compounding is not guaranteed."
  };
}

function parseStockPrice(opportunity: UnifiedOpportunity) {
  const match = opportunity.current.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  const price = match ? Number(match[1]) : NaN;
  return Number.isFinite(price) && price > 0 ? price : null;
}

function dollars(value: number) {
  return `$${value.toFixed(2)}`;
}

function stockDirection(opportunity: UnifiedOpportunity): LiveCalloutPlan["direction"] {
  if (opportunity.actionPlan.decisionLabel === "Avoid" || opportunity.actionPlan.decisionLabel === "Skip") return "NO TRADE";
  return opportunity.current.includes("(-") ? "SHORT WATCH" : "LONG WATCH";
}

function makeStockCallout(opportunity: UnifiedOpportunity, index: number): LiveCalloutPlan {
  const price = parseStockPrice(opportunity);
  const isLong = stockDirection(opportunity) !== "SHORT WATCH";
  const keyLevel = price === null ? "current app price" : dollars(isLong ? price + 0.2 : Math.max(0.01, price - 0.2));
  const stop = price === null ? "the failed trigger level" : dollars(isLong ? Math.max(0.01, price - 0.5) : price + 0.5);
  const entryA = price === null ? null : isLong ? price + 0.25 : Math.max(0.01, price - 0.6);
  const entryB = price === null ? null : isLong ? price + 0.6 : Math.max(0.01, price - 0.25);
  const target1 = price === null ? "next clean intraday level" : dollars(isLong ? price + 1 : Math.max(0.01, price - 1));
  const target2 = price === null ? "second clean intraday level" : dollars(isLong ? price + 1.75 : Math.max(0.01, price - 1.75));
  const chopLow = price === null ? stop : dollars(Math.max(0.01, price - 0.5));
  const chopHigh = price === null ? keyLevel : dollars(price + 0.2);
  const direction = stockDirection(opportunity);

  return {
    id: `callout-${opportunity.id}-${index}`,
    generatedAt: new Date().toISOString(),
    marketType: "stock",
    market: opportunity.symbol,
    title: `LIVE CALLOUT - ${opportunity.symbol} ${direction}`,
    direction,
    status: "Waiting",
    keyLevel,
    trigger:
      direction === "NO TRADE"
        ? `No trigger. ${opportunity.symbol} is a watch-only or avoid idea until the setup improves.`
        : `Watch for ${opportunity.symbol} to ${isLong ? "break and hold above" : "break and hold below"} ${keyLevel} for 5-10 minutes.`,
    confirmation: [
      "Volume is increasing versus the prior few candles.",
      "QQQ/SPY are confirming the same direction.",
      "Price is holding above VWAP for a long watch or below VWAP for a short watch.",
      "No immediate rejection candle after the trigger.",
      "News/catalyst is still valid."
    ],
    entryZone:
      entryA === null || entryB === null
        ? "Only after the trigger confirms."
        : `${dollars(Math.min(entryA, entryB))}-${dollars(Math.max(entryA, entryB))}`,
    stopInvalidation: `The idea is wrong if price loses ${stop}.`,
    target1,
    target2,
    volumeCondition: "Volume should expand on the break; weak volume means wait.",
    doNothingCondition: `If price chops between ${chopLow} and ${chopHigh}, do nothing.`,
    beginnerTranslation: "We are not guessing. We are waiting for buyers or sellers to prove they are in control before paper-tracking anything.",
    robinhoodSteps: [
      "Open Robinhood.",
      `Search ${opportunity.symbol}.`,
      "Check live price.",
      "Wait for the trigger.",
      "Use limit order only for paper planning.",
      "Do not chase if already above Target 1.",
      "Max paper risk $2-$5."
    ],
    futuresWarning: null,
    polymarketPlan: null
  };
}

function makeFuturesWatchCallout(): LiveCalloutPlan {
  return {
    id: `callout-mnq-watch-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    marketType: "futures-watch",
    market: "MNQ/NQ watch",
    title: "LIVE CALLOUT - MNQ/NQ FUTURES WATCH ONLY",
    direction: "NO TRADE",
    status: "Waiting",
    keyLevel: "Use QQQ as the safer beginner proxy unless you fully understand futures margin.",
    trigger: "Watch QQQ/SPY first. Do not trade futures just because the Nasdaq moves.",
    confirmation: [
      "QQQ and SPY confirm direction.",
      "Market holds above or below VWAP.",
      "No fast rejection candle.",
      "You understand margin and contract risk before touching futures."
    ],
    entryZone: "No futures entry zone for beginners. Paper-watch QQQ instead.",
    stopInvalidation: "Invalid if the move reverses through VWAP or QQQ loses its trigger.",
    target1: "QQQ first target from the related stock callout.",
    target2: "QQQ second target from the related stock callout.",
    volumeCondition: "Futures can move fast even when stock volume looks normal.",
    doNothingCondition: "If QQQ is chopping, do nothing.",
    beginnerTranslation: "Futures are not beginner default tools. QQQ is usually the cleaner watch proxy.",
    robinhoodSteps: [
      "Open Robinhood.",
      "Use QQQ as the safer proxy watch.",
      "Do not trade /MNQ unless you understand margin.",
      "If paper-watching /MNQ, remember Micro Nasdaq futures use a $2 multiplier and 0.25 tick = $0.50.",
      "Max paper risk still stays $2-$5."
    ],
    futuresWarning:
      "FUTURES WATCH ONLY. Futures can move fast and losses can exceed expectations. Do not trade futures unless you understand margin. Default to QQQ as the safer beginner proxy.",
    polymarketPlan: null
  };
}

function makePolymarketCallout(opportunity: UnifiedOpportunity, index: number): LiveCalloutPlan {
  const yes = opportunity.current.match(/YES\s+(\d+)%/i)?.[1];
  const no = opportunity.current.match(/NO\s+(\d+)%/i)?.[1];
  const yesPrice = yes ? `${yes} cents` : "current YES odds";
  const noPrice = no ? `${no} cents` : "current NO odds";
  const direction: LiveCalloutPlan["direction"] = opportunity.actionPlan.decisionLabel.includes("NO") ? "NO WATCH" : "YES WATCH";

  return {
    id: `callout-${opportunity.id}-${index}`,
    generatedAt: new Date().toISOString(),
    marketType: "polymarket",
    market: opportunity.symbol,
    title: `LIVE CALLOUT - ${opportunity.title}`,
    direction,
    status: "Waiting",
    keyLevel: direction === "NO WATCH" ? noPrice : yesPrice,
    trigger: `Watch for ${direction === "NO WATCH" ? "NO" : "YES"} odds to move 3-5 cents with matching volume and a fresh news reason.`,
    confirmation: [
      "Rules and resolution criteria are clear.",
      "Fresh news directly affects the market question.",
      "Liquidity and volume support the odds move.",
      "Spread is not wide.",
      "Do not copy leaderboard traders blindly."
    ],
    entryZone: `Paper only near ${direction === "NO WATCH" ? noPrice : yesPrice} if odds still match the app.`,
    stopInvalidation: opportunity.invalidation,
    target1: "First paper target: odds move 5 cents in your favor.",
    target2: "Second paper target: odds move 10 cents in your favor or the thesis becomes crowded.",
    volumeCondition: "24h volume and liquidity should rise with the odds move.",
    doNothingCondition: "If odds drift without news or rules are unclear, do nothing.",
    beginnerTranslation: "Prediction markets can go to zero. Wait for news and rules to support the side you are paper-tracking.",
    robinhoodSteps: [],
    futuresWarning: null,
    polymarketPlan: {
      keyOddsLevel: direction === "NO WATCH" ? noPrice : yesPrice,
      triggerOddsMove: "3-5 cent move with real volume and fresh news.",
      newsConfirmation: opportunity.actionPlan.plainEnglish.whyItMattersToday,
      yesPlan: `YES plan: only paper-track YES if news makes YES more likely and rules are clear. Current YES: ${yesPrice}.`,
      noPlan: `NO plan: only paper-track NO if news weakens YES or rules make YES harder. Current NO: ${noPrice}.`,
      skipRule: "Skip if rules are vague, liquidity is low, spread is wide, or odds already ran too far.",
      maxRisk: "$2-$5"
    }
  };
}

function makeLiveCalloutPlans(stockIdeas: UnifiedOpportunity[], polymarketIdeas: UnifiedOpportunity[]) {
  const stockCallouts = stockIdeas.slice(0, 5).map(makeStockCallout);
  const polymarketCallouts = polymarketIdeas.slice(0, 5).map(makePolymarketCallout);
  const includeFuturesWatch = stockIdeas.some((item) => ["QQQ", "SPY", "NVDA", "TSLA"].includes(item.symbol));
  return includeFuturesWatch ? [...stockCallouts, makeFuturesWatchCallout(), ...polymarketCallouts] : [...stockCallouts, ...polymarketCallouts];
}

export function buildDailyReport(
  reportType: DailyReportType,
  engine: OpportunityEngineResponse,
  telegram?: Partial<SavedDailyReport["telegram"]>
): SavedDailyReport {
  const stockIdeas = engine.opportunities.filter((item) => item.marketType === "stock");
  const polymarketIdeas = engine.opportunities.filter((item) => item.marketType === "polymarket");
  const avoid = engine.opportunities
    .filter((item) => item.actionPlan.decisionLabel.toLowerCase().includes("skip") || item.actionPlan.decisionLabel.toLowerCase().includes("avoid") || item.riskLevel === "high")
    .slice(0, 6)
    .map((item) => `${item.symbol}: ${item.skipReason}`);

  return {
    id: `${reportType}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    reportType,
    title: REPORT_TITLES[reportType],
    topDayTradeIdeas: stockIdeas.slice(0, 5).map(makeDayTradeIdea),
    topLongTermIdeas: stockIdeas
      .filter((item) => ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOG", "META"].includes(item.symbol))
      .slice(0, 5)
      .map(makeLongTermIdea),
    topPolymarketIdeas: polymarketIdeas.slice(0, 5).map(makePolymarketIdea),
    hourlyPolymarketWatchlist: polymarketIdeas.slice(0, 5).map(makeHourlyWatch),
    liveCalloutPlans: makeLiveCalloutPlans(stockIdeas, polymarketIdeas),
    skippedAvoidList: avoid.length ? avoid : ["Do not trade unclear setups, low-confidence ideas, or markets where you cannot explain the rules."],
    oneSentencePlan: "Paper-track only the clearest idea in each section; skip anything with unclear rules, weak catalyst, or price drift.",
    telegram: {
      attempted: telegram?.attempted ?? false,
      sent: telegram?.sent ?? false,
      deliveredChannels: telegram?.deliveredChannels ?? [],
      warnings: telegram?.warnings ?? [],
      error: telegram?.error ?? null,
      attemptedAt: telegram?.attemptedAt ?? null
    },
    errors: engine.warnings,
    schedule: REPORT_SCHEDULES[reportType]
  };
}

export function formatDailyTelegram(report: SavedDailyReport) {
  const dayTrade = report.topDayTradeIdeas.slice(0, 3).map((idea, index) =>
    `${index + 1}. ${idea.symbol} - ${idea.actionLabel}\nWhy: ${idea.reason}\nEntry: ${idea.entryZone}\nStop/Invalidation: ${idea.stopInvalidation}\nMax paper risk: ${idea.maxPaperRisk}`
  );
  const longTerm = report.topLongTermIdeas.slice(0, 2).map((idea, index) =>
    `${index + 1}. ${idea.symbol} - Watchlist only\nWhy: ${idea.thesis}`
  );
  const polymarket = report.topPolymarketIdeas.slice(0, 3).map((idea, index) =>
    `${index + 1}. ${idea.title} - ${idea.actionLabel}\nYES means: ${idea.yesMeans}\nNO means: ${idea.noMeans}\nMax risk: ${idea.suggestedMaxRisk} from $50 account`
  );
  const callouts = (report.liveCalloutPlans ?? []).slice(0, 3).map((plan, index) =>
    `${index + 1}. ${plan.title}\nKey level: ${plan.keyLevel}\nTrigger: ${plan.trigger}\nEntry: ${plan.entryZone}\nWrong if: ${plan.stopInvalidation}\nTarget 1: ${plan.target1}\nTarget 2: ${plan.target2}\nDo nothing if: ${plan.doNothingCondition}`
  );

  return [
    `📡 ${report.title.toUpperCase()}`,
    "DAY TRADING:",
    dayTrade.length ? dayTrade.join("\n\n") : "No day-trade candidates. Watch only.",
    "LONG-TERM:",
    longTerm.length ? longTerm.join("\n\n") : "No long-term watchlist ideas returned.",
    "POLYMARKET:",
    polymarket.length ? polymarket.join("\n\n") : "No Polymarket candidates. Watch only.",
    "LIVE CALLOUT STYLE PLANS:",
    callouts.length ? callouts.join("\n\n") : "No conditional callouts generated. Watch only.",
    "DO NOT TOUCH TODAY:",
    report.skippedAvoidList.map((item) => `- ${item}`).join("\n"),
    "Research only. Manual approval only."
  ].join("\n\n");
}

export async function loadSavedReports(limit = 20): Promise<SavedReportsResponse> {
  try {
    const reports = ((await store().get(REPORTS_KEY, { type: "json" })) ?? []) as SavedDailyReport[];
    const sorted = reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
    return { reports: sorted, diagnostics: makeDiagnostics(sorted) };
  } catch (error) {
    return {
      reports: [],
      diagnostics: makeDiagnostics([]),
      warning: error instanceof Error ? error.message : "Saved reports storage unavailable."
    };
  }
}

export async function saveDailyReport(report: SavedDailyReport) {
  const existing = await loadSavedReports(100);
  const reports = [report, ...existing.reports.filter((item) => item.id !== report.id)].slice(0, 100);
  await store().setJSON(REPORTS_KEY, reports);
  return report;
}

export async function clearSavedReports() {
  await store().delete(REPORTS_KEY);
}

export function newYorkTime() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date());
}

export async function loadScheduleDiagnostics(): Promise<ScheduleDiagnosticsRecord> {
  try {
    const saved = (await store().get(SCHEDULE_DIAGNOSTICS_KEY, { type: "json" })) as ScheduleDiagnosticsRecord | null;
    return {
      ...makeEmptyScheduleDiagnostics(),
      ...saved,
      currentUtcTime: new Date().toISOString(),
      currentNewYorkTime: newYorkTime()
    };
  } catch {
    return makeEmptyScheduleDiagnostics();
  }
}

export async function saveScheduleDiagnostics(update: Partial<ScheduleDiagnosticsRecord>) {
  const diagnostics = {
    ...(await loadScheduleDiagnostics()),
    ...update,
    currentUtcTime: new Date().toISOString(),
    currentNewYorkTime: newYorkTime()
  };
  await store().setJSON(SCHEDULE_DIAGNOSTICS_KEY, diagnostics);
  return diagnostics;
}

export function telegramStatusFromAlert(alert: AlertResponse | null, error?: string | null): SavedDailyReport["telegram"] {
  return {
    attempted: true,
    sent: Boolean(alert?.sent),
    deliveredChannels: alert?.deliveredChannels ?? [],
    warnings: alert?.warnings ?? [],
    error: error ?? null,
    attemptedAt: new Date().toISOString()
  };
}

function makeDiagnostics(reports: SavedDailyReport[]): ReportDiagnostics {
  const latest = reports[0] ?? null;
  const latestTelegram = reports.find((report) => report.telegram.attempted);
  const latestError = reports.find((report) => report.telegram.error || report.telegram.warnings.length);
  return {
    lastScheduledRun: latest?.timestamp ?? null,
    lastTelegramAttempt: latestTelegram?.telegram.attemptedAt ?? null,
    lastTelegramError: latestError?.telegram.error ?? latestError?.telegram.warnings[0] ?? null,
    lastReportSavedTime: latest?.timestamp ?? null,
    currentUtcTime: new Date().toISOString(),
    expectedNextRunTime: "Weekdays at configured UTC cron times: morning 12:30 UTC, midday 16:30 UTC, closing 19:30 UTC.",
    configuredUtcTimes: {
      morning: REPORT_SCHEDULES.morning.configuredUtc,
      midday: REPORT_SCHEDULES.midday.configuredUtc,
      closing: REPORT_SCHEDULES.closing.configuredUtc
    },
    dstNote: "Netlify scheduled functions use fixed UTC cron. Adjust manually if you need exact ET across EST/EDT."
  };
}

function makeEmptyScheduleDiagnostics(): ScheduleDiagnosticsRecord {
  return {
    currentUtcTime: new Date().toISOString(),
    currentNewYorkTime: newYorkTime(),
    configuredMorningUtcCron: REPORT_SCHEDULES.morning.configuredUtc,
    configuredMiddayUtcCron: REPORT_SCHEDULES.midday.configuredUtc,
    configuredClosingUtcCron: REPORT_SCHEDULES.closing.configuredUtc,
    lastScheduledRun: null,
    lastTelegramAttempt: null,
    lastReportSaveAttempt: null,
    lastError: null
  };
}
