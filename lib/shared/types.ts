export type RiskLevel = "low" | "medium" | "high";

export type RegimeLabel =
  | "Bull trend"
  | "Bear trend"
  | "Sideways/chop"
  | "High volatility"
  | "News-driven volatility";

export type Confidence = "low" | "medium" | "high";
export type MarketType = "stock" | "polymarket";
export type ActionBadge = "Beginner Safe" | "Needs Research" | "Too Risky" | "Watch Only" | "Paper Candidate";
export type StockDecisionLabel = "Watch" | "Paper Candidate" | "Skip" | "Avoid";
export type PolymarketDecisionLabel = "Watch" | "Paper YES Candidate" | "Paper NO Candidate" | "Skip" | "Avoid";
export type CatalystType =
  | "earnings"
  | "analyst"
  | "SEC filing"
  | "macro"
  | "AI/tech"
  | "crypto-linked"
  | "legal/regulatory"
  | "product/news"
  | "politics"
  | "economics"
  | "crypto"
  | "sports"
  | "tech"
  | "weather"
  | "culture"
  | "finance"
  | "geopolitical"
  | "unknown";

export type Quote = {
  ticker: string;
  price: number;
  previousClose: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  timestamp: number;
  source: "finnhub" | "polygon";
};

export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SwingPoint = {
  index: number;
  timestamp: number;
  price: number;
  type: "high" | "low";
};

export type SupplyDemandZone = {
  id: string;
  label: "DEMAND ZONE" | "SUPPLY ZONE";
  high: number;
  low: number;
  midpoint: number;
  entryZone: string;
  stop: number;
  target: number;
  highProbability: boolean;
  sourceIndex: number;
};

export type FairValueGap = {
  id: string;
  type: "bullish" | "bearish";
  high: number;
  low: number;
  startIndex: number;
  endIndex: number;
};

export type PriceActionSignal = {
  ticker: string;
  timeframe: string;
  trend: "bullish" | "bearish" | "sideways";
  lastSwingHigh: SwingPoint | null;
  lastSwingLow: SwingPoint | null;
  demandZones: SupplyDemandZone[];
  supplyZones: SupplyDemandZone[];
  fairValueGaps: FairValueGap[];
  confirmedBreakouts: string[];
  failedBreakouts: string[];
  warnings: string[];
};

export type NewsItem = {
  id: string;
  ticker: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
};

export type ScoreBreakdown = {
  momentum: number;
  volatility: number;
  catalyst: number;
  riskReward: number;
};

export type ScoredSetupInput = {
  ticker: string;
  quote: Quote;
  news: NewsItem[];
  score: number;
  breakdown: ScoreBreakdown;
  riskLevel: RiskLevel;
  warnings: string[];
};

export type MarketRegime = {
  label: RegimeLabel;
  confidence: Confidence;
  summary: string;
  drivers: string[];
};

export type AiSetupReport = {
  ticker: string;
  bullCase: string;
  bearCase: string;
  catalyst: string;
  entryZone: string;
  stopLoss: string;
  target: string;
  riskReward: string;
  confidence: Confidence;
  whyToSkip: string;
  invalidation: string;
  checkBeforeTrading: string[];
};

export type SetupReport = ScoredSetupInput & {
  regime: MarketRegime;
  ai: AiSetupReport;
};

export type ScanResponse = {
  generatedAt: string;
  disclaimer: string;
  regime: MarketRegime;
  setups: SetupReport[];
  skipped: ScoredSetupInput[];
  warnings: string[];
};

export type SetupCheckResponse = {
  configured: Record<string, boolean>;
  requiredMissing: string[];
  optionalMissing: string[];
  publicApis: Record<string, boolean>;
};

export type PolymarketScoreBreakdown = {
  liquidityVolume: number;
  oddsMomentum: number;
  catalystStrength: number;
  resolutionClarity: number;
  timeAttractiveness: number;
  crowdSignal: number;
};

export type PolymarketRiskFlags = {
  ambiguousWording: boolean;
  resolutionSourceRisk: boolean;
  thinLiquidity: boolean;
  wideSpread: boolean;
  binaryNewsShock: boolean;
  crowdedTrade: boolean;
  manipulationWhaleRisk: boolean;
  timeDecayOpportunityCost: boolean;
  probableTrap: string;
};

export type PolymarketOpportunity = {
  id: string;
  eventId: string;
  slug: string;
  eventTitle: string;
  question: string;
  description: string;
  marketUrl: string;
  category: string;
  outcomes: string[];
  outcomePrices: number[];
  yesPrice: number | null;
  noPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  lastTradePrice: number | null;
  oneDayPriceChange: number | null;
  oneWeekPriceChange: number | null;
  priceHistoryChange: number | null;
  volume: number;
  volume24hr: number;
  liquidity: number;
  openInterest: number;
  endDate: string | null;
  timeRemainingDays: number | null;
  resolutionSource: string;
  resolutionCriteria: string;
  score: number;
  scoreBreakdown: PolymarketScoreBreakdown;
  categoryWeight: number;
  attentionPriority: number;
  confidence: Confidence;
  dataConfidence: Confidence;
  riskLevel: RiskLevel;
  riskFlags: PolymarketRiskFlags;
  catalyst: string;
  currentConsensus: string;
  yesCase: string;
  noCase: string;
  whatWouldMoveIt: string[];
  whatToMonitor: string[];
  whyToSkip: string;
  invalidation: string;
  warnings: string[];
};

export type CatalystProfile = {
  type: CatalystType;
  sourceQuality: Confidence;
  whyItMatters: string;
  whatWouldMoveTheMarket: string[];
  invalidation: string;
};

export type BeginnerActionPlan = {
  marketType: MarketType;
  decisionLabel: StockDecisionLabel | PolymarketDecisionLabel;
  badge: ActionBadge;
  plainEnglish: {
    whatThisMeans: string;
    whyItMattersToday: string;
    whyThisCouldStillFail: string;
  };
  manualChecklist: string[];
  riskTranslation: string;
  doNotTouchIf: string[];
  maxPaperRisk: "$2-$5";
  suggestedPaperPositionSize: string;
  whenToExit: string;
  whenToSkipCompletely: string;
  telegramSummary: {
    whatItIs: string;
    whyItMatters: string;
    whatToCheck: string[];
    whyToSkip: string;
  };
};

export type UnifiedOpportunity = {
  id: string;
  marketType: MarketType;
  title: string;
  symbol: string;
  current: string;
  score: number;
  attentionPriority: number;
  scoreBreakdown: Record<string, number>;
  catalyst: CatalystProfile;
  bullCase: string;
  bearCase: string;
  trap: string;
  invalidation: string;
  monitorNext: string[];
  riskLevel: RiskLevel;
  confidence: Confidence;
  dataConfidence: Confidence;
  catalystBadges: string[];
  suggestedPaperAction: string;
  skipReason: string;
  actionPlan: BeginnerActionPlan;
  source: "stock-scan" | "polymarket-scan" | "cross-market" | "leaderboard";
};

export type MacroRiskEvent = {
  category: "CPI" | "PPI" | "FOMC" | "Fed speeches" | "jobs report" | "GDP" | "treasury auctions" | "major earnings weeks";
  whyItMatters: string;
  monitor: string;
};

export type EarningsWatchItem = {
  ticker: string;
  status: "provider-needed" | "available" | "today" | "soon" | "unavailable";
  note: string;
  reportDate?: string | null;
  epsSurprisePercent?: number | null;
};

export type IntelligenceReport = {
  id: string;
  title: "Morning Brief" | "Midday Update" | "Closing Watchlist" | "Weekend Deep Dive";
  generatedAt: string;
  topStocks: UnifiedOpportunity[];
  topPolymarket: UnifiedOpportunity[];
  topCrossMarketInsight: CrossMarketInsight | null;
  biggestRiskToday: string;
  whatToIgnore: string[];
  monitorNext: string[];
  paperTradeIdeasOnly: string[];
};

export type OpportunityEngineResponse = {
  generatedAt: string;
  disclaimer: string;
  opportunities: UnifiedOpportunity[];
  stockScan: ScanResponse | null;
  polymarketScan: PolymarketScanResponse;
  crossMarketInsights: CrossMarketInsight[];
  reports: IntelligenceReport[];
  macroRiskToday: MacroRiskEvent[];
  earningsWatch: EarningsWatchItem[];
  warnings: string[];
};

export type SmartMoneyTrader = {
  rank: string;
  userName: string;
  proxyWallet: string;
  volume: number;
  pnl: number;
  xUsername: string;
  verified: boolean;
  possibleTheme: string;
  caution: string;
};

export type SmartMoneyWatch = {
  generatedAt: string;
  source: string;
  traders: SmartMoneyTrader[];
  repeatedThemes: string[];
  warnings: string[];
};

export type PolymarketScanResponse = {
  generatedAt: string;
  disclaimer: string;
  opportunities: PolymarketOpportunity[];
  skipped: PolymarketOpportunity[];
  smartMoney: SmartMoneyWatch;
  warnings: string[];
};

export type CrossMarketInsight = {
  id: string;
  title: string;
  hypothesis: string;
  stockSignals: string[];
  polymarketSignals: string[];
  relatedTickers: string[];
  relatedMarkets: string[];
  confidence: Confidence;
  risk: string;
  followUp: string;
};

export type AlertChannel = "sms" | "telegram" | "email";

export type AlertRequest = {
  title: string;
  message: string;
  severity?: RiskLevel;
  alertType?: "high score opportunity" | "risk warning" | "morning brief" | "midday update" | "closing report" | "polymarket mover" | "stock mover" | "test";
  channels?: AlertChannel[];
};

export type AlertResponse = {
  sent: boolean;
  configuredChannels: Record<AlertChannel, boolean>;
  attemptedChannels: AlertChannel[];
  deliveredChannels: AlertChannel[];
  warnings: string[];
};

export type DailyReportType = "morning" | "midday" | "closing";

export type DailyActionIdea = {
  id: string;
  title: string;
  symbol: string;
  actionLabel: string;
  reason: string;
  current: string;
  entryZone: string;
  stopInvalidation: string;
  target: string;
  maxPaperRisk: "$2-$5";
  robinhoodSteps: string[];
  doNotTouchIf: string[];
  watchNext: string[];
  riskNote?: string;
};

export type LongTermIdea = {
  id: string;
  symbol: string;
  thesis: string;
  whyMonthsYears: string;
  risk: string;
  betterEntryCondition: string;
  dcaIdea: string;
  robinhoodSteps: string[];
  label: "Not a day trade";
};

export type PolymarketActionIdea = {
  id: string;
  title: string;
  yesPrice: string;
  noPrice: string;
  actionLabel: string;
  yesMeans: string;
  noMeans: string;
  whyOddsMayMove: string;
  resolutionEvent: string;
  checkBeforeTouching: string[];
  suggestedMaxRisk: "$2-$5";
  compoundingPlan: string[];
  polymarketSteps: string[];
};

export type PolymarketHourlyWatch = {
  id: string;
  marketTitle: string;
  whyCheckThisHour: string;
  yesMover: string;
  noMover: string;
  alertTrigger: string;
  riskNote: string;
};

export type LiveCalloutStatus = "Waiting" | "Triggered" | "Invalidated" | "Expired";

export type LiveCalloutPlan = {
  id: string;
  generatedAt: string;
  marketType: "stock" | "polymarket" | "futures-watch";
  market: string;
  title: string;
  direction: "LONG WATCH" | "SHORT WATCH" | "NO TRADE" | "YES WATCH" | "NO WATCH";
  status: LiveCalloutStatus;
  keyLevel: string;
  trigger: string;
  confirmation: string[];
  entryZone: string;
  stopInvalidation: string;
  target1: string;
  target2: string;
  volumeCondition: string;
  doNothingCondition: string;
  beginnerTranslation: string;
  robinhoodSteps: string[];
  futuresWarning: string | null;
  polymarketPlan: {
    keyOddsLevel: string;
    triggerOddsMove: string;
    newsConfirmation: string;
    yesPlan: string;
    noPlan: string;
    skipRule: string;
    maxRisk: "$2-$5";
  } | null;
};

export type ConditionalCalloutPlan = LiveCalloutPlan & {
  safetyLabels: Array<"WATCH ONLY" | "PAPER TRADE ONLY" | "HIGH RISK" | "NO TRADE">;
  rrRatio: number | null;
  sourceZoneId: string | null;
};

export type PriceActionAnalyzerResponse = {
  generatedAt: string;
  ticker: string;
  timeframe: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  source: "polygon" | "finnhub" | "none";
  candles: Candle[];
  signal: PriceActionSignal | null;
  calloutPlans: ConditionalCalloutPlan[];
  error: string | null;
  warnings: string[];
};

export type SavedDailyReport = {
  id: string;
  timestamp: string;
  reportType: DailyReportType;
  title: "Morning Brief" | "Midday Update" | "Closing Watchlist";
  topDayTradeIdeas: DailyActionIdea[];
  topLongTermIdeas: LongTermIdea[];
  topPolymarketIdeas: PolymarketActionIdea[];
  hourlyPolymarketWatchlist: PolymarketHourlyWatch[];
  liveCalloutPlans: LiveCalloutPlan[];
  skippedAvoidList: string[];
  oneSentencePlan: string;
  telegram: {
    attempted: boolean;
    sent: boolean;
    deliveredChannels: AlertChannel[];
    warnings: string[];
    error: string | null;
    attemptedAt: string | null;
  };
  errors: string[];
  schedule: {
    configuredUtc: string;
    etEstUtc: string;
    etEdtUtc: string;
    dstNote: string;
  };
};

export type ReportDiagnostics = {
  lastScheduledRun: string | null;
  lastTelegramAttempt: string | null;
  lastTelegramError: string | null;
  lastReportSavedTime: string | null;
  currentUtcTime: string;
  expectedNextRunTime: string;
  configuredUtcTimes: Record<DailyReportType, string>;
  dstNote: string;
};

export type SavedReportsResponse = {
  reports: SavedDailyReport[];
  diagnostics: ReportDiagnostics;
  warning?: string;
};

export type PersistedAppSettings = {
  sendOpportunityTelegram: boolean;
  beginnerMode: boolean;
};

export type PersistedAppState = {
  updatedAt: string;
  lastScanAt: string | null;
  source?: "server" | "local";
  engine: OpportunityEngineResponse | null;
  stockScan: ScanResponse | null;
  polymarketScan: PolymarketScanResponse | null;
  crossMarket: {
    generatedAt: string;
    stockScan: ScanResponse | null;
    stockError: string | null;
    polymarketScan: PolymarketScanResponse;
    insights: CrossMarketInsight[];
  } | null;
  savedReports: SavedReportsResponse | null;
  researchFeed: unknown[];
  paperTrades: unknown[];
  settings: PersistedAppSettings;
};

export type AppStatePersistenceResponse = {
  available: boolean;
  state: PersistedAppState | null;
  warning?: string;
};

export type ScheduleDiagnosticsRecord = {
  currentUtcTime: string;
  currentNewYorkTime: string;
  configuredMorningUtcCron: string;
  configuredMiddayUtcCron: string;
  configuredClosingUtcCron: string;
  lastScheduledRun: string | null;
  lastTelegramAttempt: string | null;
  lastReportSaveAttempt: string | null;
  lastError: string | null;
};

export type RecommendationStatus =
  | "recommended"
  | "waiting_for_trigger"
  | "user_entered"
  | "user_skipped"
  | "missed_trigger"
  | "missed_winner"
  | "good_skip"
  | "triggered"
  | "target_hit"
  | "stopped_out"
  | "expired"
  | "manually_closed";

export type ExecutionPlanQuality = "weak" | "acceptable" | "strong" | "elite";

export type DirectExecutionPlan = {
  label: "PAPER EXECUTION CANDIDATE" | "WATCH ONLY" | "SKIP" | "AVOID" | "OPTIONS WATCH - HIGH RISK" | "POLYMARKET BINARY RISK";
  category: "DAY TRADE - SHARES" | "DAY TRADE - OPTIONS WATCH" | "LONG-TERM INVESTING" | "POLYMARKET";
  direction: "LONG WATCH" | "SHORT WATCH" | "WATCH" | "PAPER YES" | "PAPER NO" | "NO TRADE";
  currentPriceOrOdds: string;
  entryZone: string;
  stopOrInvalidation: string;
  target1: string;
  target2: string;
  maxPaperRisk: "$2-$5";
  suggestedPaperPositionSize: string;
  timeHorizon: string;
  plainEnglish: string;
  robinhoodSteps: string[];
  polymarketSteps: string[];
  optionsUnavailableMessage: string;
  warnings: string[];
};

export type AutoPaperTradePlan = {
  plannedEntry: string;
  plannedStopOrInvalidation: string;
  plannedTarget: string;
  plannedMaxRisk: "$2-$5";
  createdAt: string;
  expiresAt: string;
  sourceRecommendationId: string;
  currentPriceOrOdds: string;
  maxFavorableMove: string;
  maxAdverseMove: string;
  theoreticalResult: string;
};

export type RecommendationLedgerItem = {
  id: string;
  createdAt: string;
  marketType: "stock" | "polymarket";
  tradeCategory: "DAY_TRADE" | "LONG_TERM" | "POLYMARKET";
  tickerOrMarket: string;
  title: string;
  recommendation: "WATCH" | "PAPER_TRADE" | "SKIP" | "AVOID" | "PAPER_YES" | "PAPER_NO";
  entryZone: string;
  stopOrInvalidation: string;
  target1: string;
  target2: string;
  currentPriceOrOddsAtRecommendation: string;
  confidence: Confidence;
  riskLevel: RiskLevel;
  catalystType: string;
  signalTypes: string[];
  strategyTags: string[];
  sourceDataUsed: string[];
  beginnerThesis: string;
  whyNow: string;
  whySkip: string;
  maxRisk: "$2-$5";
  status: RecommendationStatus;
  userActuallyEntered: "yes" | "no" | "unknown";
  userEntryPrice: string;
  userPositionSize: string;
  userNotes: string;
  finalOutcome: string;
  resultPct: number | null;
  lessonLearned: string;
  learningAdjustment: number;
  learningAdjustmentReason: string;
  lastCheckedAt: string | null;
  lastAlertedStatus: RecommendationStatus | null;
  executionReadinessScore: number;
  autoPaperEligible: boolean;
  reasonNotEligible: string;
  executionPlanQuality: ExecutionPlanQuality;
  directExecutionPlan: DirectExecutionPlan;
  autoPaperTrade: AutoPaperTradePlan | null;
};

export type RecommendationLedgerResponse = {
  ok: boolean;
  storageSource: "server" | "local fallback";
  recommendations: RecommendationLedgerItem[];
  warning?: string;
  error?: string;
};

export type LearningAnalytics = {
  totalRecommendations: number;
  winRateByCategory: Record<string, number>;
  winRateBySignalType: Record<string, number>;
  winRateByCatalystType: Record<string, number>;
  winRateByScoreBucket: Record<string, number>;
  averageResultByConfidence: Record<string, number>;
  bestPerformingSetupType: string;
  worstPerformingSetupType: string;
  missedWinners: number;
  avoidedLosers: number;
  autoPaperWinRate: number;
  userEnteredWinRate: number;
  skippedWinnerCount: number;
  avoidedLoserCount: number;
  bestSignalType: string;
  worstSignalType: string;
  bestCategory: string;
  recommendationsToStopMaking: string[];
  overconfidenceWarning: string;
  systemGoodAt: string;
  systemBadAt: string;
};
