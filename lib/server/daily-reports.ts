import type {
  AlertResponse,
  DailyReportType,
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

  return [
    `📡 ${report.title.toUpperCase()}`,
    "DAY TRADING:",
    dayTrade.length ? dayTrade.join("\n\n") : "No day-trade candidates. Watch only.",
    "LONG-TERM:",
    longTerm.length ? longTerm.join("\n\n") : "No long-term watchlist ideas returned.",
    "POLYMARKET:",
    polymarket.length ? polymarket.join("\n\n") : "No Polymarket candidates. Watch only.",
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
