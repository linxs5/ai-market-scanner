import type { MarketRegime, NewsItem, Quote } from "@/lib/shared/types";

export function detectMarketRegime(quotes: Quote[], newsByTicker: Record<string, NewsItem[]>): MarketRegime {
  const marketQuotes = quotes.filter((quote) => ["SPY", "QQQ"].includes(quote.ticker));
  const drivers: string[] = [];
  const averageMarketMove =
    marketQuotes.reduce((sum, quote) => sum + quote.changePercent, 0) / Math.max(marketQuotes.length, 1);
  const averageRange =
    marketQuotes.reduce((sum, quote) => sum + ((quote.high - quote.low) / quote.price) * 100, 0) /
    Math.max(marketQuotes.length, 1);
  const totalNews = Object.values(newsByTicker).reduce((sum, items) => sum + items.length, 0);

  if (marketQuotes.length < 2) {
    drivers.push("Only limited ETF data was available.");
  }
  if (averageMarketMove > 0.8) drivers.push("SPY/QQQ are meaningfully positive versus previous close.");
  if (averageMarketMove < -0.8) drivers.push("SPY/QQQ are meaningfully negative versus previous close.");
  if (averageRange > 2.5) drivers.push("Major ETF intraday ranges are elevated.");
  if (totalNews > quotes.length * 3) drivers.push("News flow is unusually active across the watchlist.");

  if (totalNews > quotes.length * 3 && averageRange > 1.5) {
    return {
      label: "News-driven volatility",
      confidence: marketQuotes.length >= 2 ? "medium" : "low",
      summary: "Catalysts are active and price ranges are wider than a quiet session.",
      drivers
    };
  }

  if (averageRange > 3) {
    return {
      label: "High volatility",
      confidence: marketQuotes.length >= 2 ? "medium" : "low",
      summary: "The market is moving through a wide range, so position sizing should stay defensive.",
      drivers
    };
  }

  if (averageMarketMove > 0.8) {
    return {
      label: "Bull trend",
      confidence: marketQuotes.length >= 2 ? "medium" : "low",
      summary: "Broad market ETFs are trading above prior close with positive momentum.",
      drivers
    };
  }

  if (averageMarketMove < -0.8) {
    return {
      label: "Bear trend",
      confidence: marketQuotes.length >= 2 ? "medium" : "low",
      summary: "Broad market ETFs are trading below prior close, favoring caution and smaller risk.",
      drivers
    };
  }

  return {
    label: "Sideways/chop",
    confidence: marketQuotes.length >= 2 ? "medium" : "low",
    summary: "Major ETFs are near prior close, which can make clean directional setups harder.",
    drivers: drivers.length ? drivers : ["SPY/QQQ movement is muted versus previous close."]
  };
}
