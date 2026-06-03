export type RiskLevel = "low" | "medium" | "high";

export type RegimeLabel =
  | "Bull trend"
  | "Bear trend"
  | "Sideways/chop"
  | "High volatility"
  | "News-driven volatility";

export type Confidence = "low" | "medium" | "high";

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
};
