export const WATCHLIST = [
  "SPY",
  "QQQ",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMD",
  "TSLA",
  "META",
  "AMZN",
  "GOOG",
  "PLTR",
  "SOFI",
  "HOOD",
  "RIVN",
  "SMCI",
  "MSTR",
  "IONQ"
] as const;

export type WatchlistTicker = (typeof WATCHLIST)[number];
