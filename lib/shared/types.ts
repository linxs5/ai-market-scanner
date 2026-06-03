export type RiskLevel = "low" | "medium" | "high";

export type RegimeLabel =
  | "Bull trend"
  | "Bear trend"
  | "Sideways/chop"
  | "High volatility"
  | "News-driven volatility";

export type Confidence = "low" | "medium" | "high";
export type MarketType = "stock" | "polymarket";
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

export type UnifiedOpportunity = {
  id: string;
  marketType: MarketType;
  title: string;
  symbol: string;
  current: string;
  score: number;
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
  suggestedPaperAction: string;
  skipReason: string;
  source: "stock-scan" | "polymarket-scan" | "cross-market" | "leaderboard";
};

export type MacroRiskEvent = {
  category: "CPI" | "PPI" | "FOMC" | "Fed speeches" | "jobs report" | "GDP" | "treasury auctions" | "major earnings weeks";
  whyItMatters: string;
  monitor: string;
};

export type EarningsWatchItem = {
  ticker: string;
  status: "provider-needed" | "available";
  note: string;
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
